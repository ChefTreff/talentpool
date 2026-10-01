-- Test zu `v6_einwilligung_sperrliste` (ADM-033 + ADM-035). Belegt:
--   01 ohne Admin-Rolle 42501 auf alle vier Funktionen — auch für eine Teamrolle;
--   02 Einwilligungsliste: Filter Person, Typ und Zustand (erteilt, abgelehnt,
--      widerrufen) treffen genau die angelegten Zeilen; total stimmt;
--   03 Suche über Name und Adresse;
--   04 Sperrliste: Eintrag von Hand, Prüfung findet die Adresse auch in anderer
--      Schreibweise (Gross/Klein, Leerzeichen);
--   05 ein bestehender Eintrag behält seinen Grund (Löschung bleibt Löschung);
--   06 `profile_deleted` von Hand und unbekannte Gründe: invalid_reason;
--   07 Übersicht zählt je Grund;
--   08 das Protokoll trägt den Hash-Anfang, **nicht** die Adresse.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_me uuid; v_uid uuid; v_email text; v_p uuid; v_txt text; v_state text; v_n integer; v_b boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  insert into person (first_name, last_name) values ('Ella', 'ZZTEST-Einwilligung') returning id into v_p;
  insert into person_email (person_id, email, is_primary) values (v_p, 'zztest-einwilligung@example.org', true);
  insert into consent_record (person_id, consent_type, version, granted, granted_at, source) values
    (v_p, 'newsletter', 'zz-1', true, now() - interval '3 days', 'portal'),
    (v_p, 'photo_video', 'zz-1', false, now() - interval '2 days', 'portal');
  insert into consent_record (person_id, consent_type, version, granted, granted_at, revoked_at, source) values
    (v_p, 'privacy', 'zz-1', true, now() - interval '5 days', now() - interval '1 day', 'portal');
  delete from suppression where email_hash in (email_hash('zztest-sperre@example.org'), email_hash('zztest-geloescht@example.org'));
  insert into suppression (email_hash, reason) values (email_hash('zztest-geloescht@example.org'), 'profile_deleted');

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  v_txt := '';
  begin perform consent_records_admin(v_p); v_txt := v_txt || 'consents ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'consents 42501; '; end;
  begin perform suppression_overview(); v_txt := v_txt || 'overview ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'overview 42501; '; end;
  begin perform suppression_check('a@b.de'); v_txt := v_txt || 'check ERLAUBT; '; exception when sqlstate '42501' then v_txt := v_txt || 'check 42501; '; end;
  begin perform add_suppression('a@b.de', 'manual'); v_txt := v_txt || 'add ERLAUBT'; exception when sqlstate '42501' then v_txt := v_txt || 'add 42501'; end;
  insert into t_res values ('01_ohne_admin', v_txt);

  perform set_config('request.jwt.claims', '', true);
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  select count(*)::text || ', total=' || max(x.total) into v_txt from consent_records_admin(v_p) x;
  insert into t_res values ('02a_person', v_txt || ' (erwartet 3, total=3)');
  select string_agg(x.consent_type, ',' order by x.consent_type) into v_txt from consent_records_admin(v_p, null, 'granted') x;
  insert into t_res values ('02b_erteilt', coalesce(v_txt, '-') || ' (erwartet newsletter)');
  select string_agg(x.consent_type, ',') into v_txt from consent_records_admin(v_p, null, 'declined') x;
  insert into t_res values ('02c_abgelehnt', coalesce(v_txt, '-') || ' (erwartet photo_video)');
  select string_agg(x.consent_type, ',') into v_txt from consent_records_admin(v_p, null, 'revoked') x;
  insert into t_res values ('02d_widerrufen', coalesce(v_txt, '-') || ' (erwartet privacy)');
  select count(*) into v_n from consent_records_admin(null, 'newsletter', null, 'ZZTEST-Einwilligung') x;
  insert into t_res values ('03a_suche_name_typ', v_n || ' (erwartet 1)');
  select count(*) into v_n from consent_records_admin(null, null, null, 'zztest-einwilligung@') x;
  insert into t_res values ('03b_suche_adresse', v_n || ' (erwartet 3)');

  v_b := add_suppression('ZZTEST-Sperre@Example.org', 'unsubscribed');
  select x.suppressed::text || ' ' || coalesce(x.reason, '-') into v_txt from suppression_check('  zztest-sperre@example.ORG ') x;
  insert into t_res values ('04_eintrag_und_pruefung', 'neu=' || v_b || ', gefunden: ' || v_txt);

  v_b := add_suppression('zztest-geloescht@example.org', 'manual');
  select x.reason into v_txt from suppression_check('zztest-geloescht@example.org') x;
  insert into t_res values ('05_grund_bleibt', 'neu=' || v_b || ', Grund ' || v_txt || ' (erwartet false, profile_deleted)');

  begin
    perform add_suppression('x@example.org', 'profile_deleted');
    insert into t_res values ('06_grund_geloescht_von_hand', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_txt = message_text;
    insert into t_res values ('06_grund_geloescht_von_hand', v_state || ' ' || v_txt);
  end;

  select string_agg(o.reason || '=' || o.entries, ', ' order by o.reason) into v_txt
    from suppression_overview() o where o.reason in ('unsubscribed', 'profile_deleted');
  insert into t_res values ('07_uebersicht', v_txt);

  select count(*) into v_n from audit_log a
   where a.action = 'suppression.added' and (a.after::text ilike '%zztest%' or a.object_id ilike '%zztest%');
  select a.object_id into v_txt from audit_log a where a.action = 'suppression.added' order by a.created_at desc limit 1;
  insert into t_res values ('08_protokoll_ohne_adresse', 'Treffer mit Adresse=' || v_n || ', Objekt=' || length(v_txt) || ' Zeichen (erwartet 0, 12)');
end $$;
select * from t_res order by step;
rollback;
