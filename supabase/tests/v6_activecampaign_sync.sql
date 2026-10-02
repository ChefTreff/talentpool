-- Test „ActiveCampaign-Sync“ (TAL-009, v6_activecampaign_sync.sql). Belegt:
--   01 ac_contact ohne Grants; Server-Funktionen für angemeldete Nutzer und anon nicht ausführbar;
--   02 ac_sync_outbound: erreichbare Person mit Themen ⇒ dabei (mit Themen, ohne Kontakt-Id);
--      ohne Newsletter ⇒ nicht; Adresse auf der Sperrliste ⇒ nicht;
--   03 nach ac_mark_synced ⇒ nicht mehr dabei; geänderte Themen ⇒ wieder dabei mit alten Themen;
--   04 ac_sync_withdrawn: Newsletter widerrufen ⇒ unsubscribe; keine Themen mehr ⇒ untag;
--      Adresse gesperrt ⇒ delete; Profil gelöscht (anonymize_person) ⇒ delete;
--   05 ac_apply_unsubscribe: Widerruf von newsletter mit source activecampaign, zweiter Aufruf und
--      unbekannte Adresse ⇒ false; consent_current zeigt granted = false; der Nachweis bleibt;
--   06 ac_mark_removed räumt den Stand; ac_mark_synced ohne Kontakt-Id ⇒ 22023;
--   07 ac_sync_status: nur mit Abschnitt notifications (sonst 42501), nur Zahlen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_a uuid; v_b uuid; v_c uuid; v_staff uuid; v_staff_uid uuid; v_other_uid uuid; v_s text; v_n integer; r record;
        v_mail_a text := 'ac-a-' || gen_random_uuid() || '@example.invalid';
        v_mail_b text := 'ac-b-' || gen_random_uuid() || '@example.invalid';
        v_mail_c text := 'ac-c-' || gen_random_uuid() || '@example.invalid';
        v_topic1 text; v_topic2 text;
begin
  select p.id, p.auth_user_id into v_staff, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.auth_user_id into v_other_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  delete from role_assignment where person_id in (select id from person where auth_user_id in (v_staff_uid, v_other_uid));
  insert into role_assignment (person_id, role, scope_type) values (v_staff, 'marketing_team', 'global');
  select key into v_topic1 from vocab_term where vocabulary = 'notification_topic' and active order by sort_order limit 1;
  select key into v_topic2 from vocab_term where vocabulary = 'notification_topic' and active and key <> v_topic1 order by sort_order limit 1;

  insert into person (first_name, last_name, source_first, tier) values ('ACA', 'Testa', 'test', 'lead') returning id into v_a;
  insert into person_email (person_id, email, is_primary, verified) values (v_a, v_mail_a, true, false);
  insert into person (first_name, last_name, source_first, tier) values ('ACB', 'Testb', 'test', 'lead') returning id into v_b;
  insert into person_email (person_id, email, is_primary, verified) values (v_b, v_mail_b, true, false);
  insert into person (first_name, last_name, source_first, tier) values ('ACC', 'Testc', 'test', 'lead') returning id into v_c;
  insert into person_email (person_id, email, is_primary, verified) values (v_c, v_mail_c, true, false);
  -- Zeitpunkte ausdrücklich: in einer Transaktion hätten alle Zeilen dasselbe now().
  insert into consent_record (person_id, consent_type, version, granted, source, granted_at) values
    (v_a, 'newsletter', '2026-09', true, 'portal', now() - interval '5 hours'),
    (v_c, 'newsletter', '2026-09', true, 'portal', now() - interval '5 hours');
  insert into person_interest (person_id, vocabulary, term_key) values
    (v_a, 'notification_topic', v_topic1), (v_a, 'notification_topic', v_topic2),
    (v_b, 'notification_topic', v_topic1),                                  -- ohne Newsletter
    (v_c, 'notification_topic', v_topic1);
  insert into suppression (email_hash, reason) values (email_hash(v_mail_c), 'manual') on conflict do nothing;   -- C ist gesperrt

  -- 01
  insert into t_res values ('01_grants',
    case when not has_table_privilege('authenticated', 'ac_contact', 'select')
          and not has_table_privilege('anon', 'ac_contact', 'select')
          and not has_function_privilege('authenticated', 'ac_sync_outbound(integer)', 'execute')
          and not has_function_privilege('authenticated', 'ac_apply_unsubscribe(text)', 'execute')
          and not has_function_privilege('authenticated', 'ac_outbound_rows()', 'execute')
          and not has_function_privilege('anon', 'ac_sync_status()', 'execute')
         then 'ok' else 'FEHLER' end);

  perform set_config('request.jwt.claims', null, true);

  -- 02
  select * into r from ac_sync_outbound(200) o where o.person_id = v_a;
  insert into t_res values ('02_ausgehend',
    case when r.person_id is not null and r.email = v_mail_a and r.ac_contact_id is null
          and cardinality(r.topics) = 2 and cardinality(r.previous_topics) = 0
          and not exists (select 1 from ac_sync_outbound(200) o where o.person_id in (v_b, v_c))
         then 'ok' else 'FEHLER' end);

  -- 03
  perform ac_mark_synced(v_a, 'ac-123', array[v_topic1, v_topic2]);
  v_s := case when exists (select 1 from ac_sync_outbound(200) o where o.person_id = v_a) then 'noch dabei' else 'ok' end;
  delete from person_interest where person_id = v_a and term_key = v_topic2;
  select * into r from ac_sync_outbound(200) o where o.person_id = v_a;
  insert into t_res values ('03_aenderung',
    case when v_s = 'ok' and r.ac_contact_id = 'ac-123' and r.topics = array[v_topic1]
          and cardinality(r.previous_topics) = 2
         then 'ok' else v_s end);
  perform ac_mark_synced(v_a, 'ac-123', array[v_topic1]);

  -- 04 Rückzug
  perform ac_mark_synced(v_c, 'ac-333', array[v_topic1]);
  v_s := '';
  select action into v_s from ac_sync_withdrawn(200) w where w.person_id = v_c;           -- gesperrt ⇒ delete
  v_s := coalesce(v_s, '-') || '/';
  insert into consent_record (person_id, consent_type, version, granted, source, granted_at) values (v_a, 'newsletter', '2026-09', false, 'portal', now() - interval '4 hours');
  v_s := v_s || coalesce((select action from ac_sync_withdrawn(200) w where w.person_id = v_a), '-') || '/';   -- widerrufen ⇒ unsubscribe
  insert into consent_record (person_id, consent_type, version, granted, source, granted_at) values (v_a, 'newsletter', '2026-09', true, 'portal', now() - interval '3 hours');
  delete from person_interest where person_id = v_a;
  v_s := v_s || coalesce((select action from ac_sync_withdrawn(200) w where w.person_id = v_a), '-') || '/';   -- ohne Themen ⇒ untag
  insert into person_interest (person_id, vocabulary, term_key) values (v_a, 'notification_topic', v_topic1);
  v_s := v_s || case when exists (select 1 from ac_sync_withdrawn(200) w where w.person_id = v_a) then 'noch dabei' else 'weg' end;
  -- Profil gelöscht ⇒ delete
  perform ac_mark_synced(v_b, 'ac-222', array[v_topic1]);
  perform anonymize_person(v_b);
  v_s := v_s || '/' || coalesce((select action from ac_sync_withdrawn(200) w where w.person_id = v_b), '-');
  insert into t_res values ('04_rueckzug', case when v_s = 'delete/unsubscribe/untag/weg/delete' then 'ok' else v_s end);

  -- 05 Abmeldung aus ActiveCampaign
  v_s := ac_apply_unsubscribe(upper(v_mail_a))::text || '/' || ac_apply_unsubscribe(v_mail_a)::text || '/' || ac_apply_unsubscribe('unbekannt-' || v_mail_a)::text;
  insert into t_res values ('05_abmeldung',
    case when v_s = 'true/false/false'
          and not (select granted from consent_current where person_id = v_a and consent_type = 'newsletter')
          and (select count(*) from consent_record where person_id = v_a and consent_type = 'newsletter' and source = 'activecampaign' and not granted) = 1
          and (select count(*) from consent_record where person_id = v_a and consent_type = 'newsletter' and granted) >= 1
         then 'ok' else v_s end);

  -- 06
  perform ac_mark_removed(v_a);
  v_s := '';
  begin perform ac_mark_synced(v_a, '  ', array[v_topic1]); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '22023' then 'ok' else sqlstate end; end;
  insert into t_res values ('06_stand_raeumen',
    case when v_s = 'ok' and not exists (select 1 from ac_contact where person_id = v_a) then 'ok' else v_s end);

  -- 07 Status
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  select * into r from ac_sync_status();
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  begin perform ac_sync_status(); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into t_res values ('07_status',
    case when v_s = 'ok' and r.contacts is not null and r.pending_out is not null and r.pending_withdrawn is not null
         then 'ok' else v_s end);
end $$;
select * from t_res order by step;
rollback;
