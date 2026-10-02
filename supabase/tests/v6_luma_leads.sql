-- Test „Luma-Gäste ohne Profil als Lead“ (K-34, v6_luma_leads.sql). Belegt:
--   01 nur Server: angemeldet und anon dürfen luma_sync_registration (8 Argumente) nicht;
--      die alte 6-Argument-Fassung ist weg;
--   02 Anmeldung ohne Profil ⇒ Lead: person tier lead, source_first luma, Name, E-Mail primär und
--      nicht verifiziert, kein Login, **keine Einwilligung**, Teilnahme als registration (source luma);
--   03 derselbe Gast noch einmal ⇒ keine zweite Person, keine zweite Teilnahme; Check-in ⇒ attended;
--   04 kein Lead bei eingeladen/abgesagt, ungültiger Adresse und Adresse auf der Sperrliste;
--   05 vorhandene Person (auch der frühere Lead) wird zugeordnet statt doppelt angelegt;
--   06 luma_lead_stats: nur Zählwerte, nur mit Abschnitt Community-Events (sonst 42501);
--   07 der Lead läuft durch anonymize_person wie jede Person (Name und Adresse weg, Gast-Id weg, Adresse auf der Sperrliste).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_staff uuid; v_staff_uid uuid; v_other uuid; v_other_uid uuid; v_ev uuid; v_j jsonb; v_s text; v_n integer;
        v_mail text := 'lead-' || gen_random_uuid() || '@example.invalid'; v_lead uuid; r record; v_before integer; v_supp text;
begin
  select p.id, p.auth_user_id into v_staff, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_other, v_other_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  delete from role_assignment where person_id in (v_staff, v_other);
  insert into role_assignment (person_id, role, scope_type) values (v_staff, 'talent_team', 'global');

  -- 01
  insert into t_res values ('01_nur_server',
    case when not has_function_privilege('authenticated', 'luma_sync_registration(text,text,text,text,timestamptz,boolean,text,text)', 'execute')
          and not has_function_privilege('anon', 'luma_sync_registration(text,text,text,text,timestamptz,boolean,text,text)', 'execute')
          and not exists (select 1 from pg_proc where proname = 'luma_sync_registration' and pronargs = 6)
          and not has_function_privilege('anon', 'luma_lead_stats()', 'execute')
         then 'ok' else 'FEHLER' end);

  -- Serverkontext
  perform set_config('request.jwt.claims', null, true);
  v_ev := luma_sync_event(jsonb_build_object('luma_id', 'evt-test-k34', 'name', 'Community Night K34',
            'start_at', '2026-10-15T22:30:00Z', 'end_at', '2026-10-15T23:30:00Z', 'timezone', 'Europe/Berlin', 'url', 'https://luma.com/k34'));
  select count(*) into v_before from person where source_first = 'luma';

  -- 02
  v_j := luma_sync_registration('evt-test-k34', upper(v_mail), 'gst-k34-1', 'registered', '2026-10-01T10:00:00Z', false, 'Lena', 'Leadgast');
  select p.* into r from person p join person_email pe on pe.person_id = p.id where pe.email = lower(v_mail)::citext;
  v_lead := r.id;
  insert into t_res values ('02_lead_angelegt',
    case when v_j->>'lead_created' = 'true' and v_j->>'matched' = 'false'
          and r.tier = 'lead' and r.source_first = 'luma' and r.auth_user_id is null
          and r.first_name = 'Lena' and r.last_name = 'Leadgast'
          and (select is_primary and not verified from person_email where person_id = v_lead) is true
          and not exists (select 1 from consent_record where person_id = v_lead)
          and (select count(*) from registration where person_id = v_lead and event_id = v_ev and source = 'luma' and status = 'confirmed'
                and external_ref = 'gst-k34-1') = 1
         then 'ok' else v_j::text end);

  -- 03
  v_j := luma_sync_registration('evt-test-k34', v_mail, 'gst-k34-1', 'registered', '2026-10-01T10:00:00Z', true, 'Lena', 'Leadgast');
  select count(*) into v_n from person p join person_email pe on pe.person_id = p.id where pe.email = lower(v_mail)::citext;
  insert into t_res values ('03_idempotent',
    case when v_n = 1 and v_j->>'lead_created' = 'false' and v_j->>'matched' = 'true'
          and (select count(*) from registration where person_id = v_lead and event_id = v_ev) = 1
          and (select status from registration where person_id = v_lead and event_id = v_ev) = 'attended'
         then 'ok' else v_j::text || ' n=' || v_n end);

  -- 04
  insert into suppression (email_hash, reason) values (email_hash('gesperrt-k34@example.invalid'), 'profile_deleted') on conflict do nothing;
  v_s := '';
  v_j := luma_sync_registration('evt-test-k34', 'eingeladen-k34@example.invalid', 'gst-k34-2', 'invited', null, false, 'Ina', 'Eingeladen');
  v_s := v_s || (v_j->>'lead_created') || '/';
  v_j := luma_sync_registration('evt-test-k34', 'abgesagt-k34@example.invalid', 'gst-k34-3', 'declined', null, false, 'Ada', 'Abgesagt');
  v_s := v_s || (v_j->>'lead_created') || '/';
  v_j := luma_sync_registration('evt-test-k34', 'keine-adresse', 'gst-k34-4', 'registered', null, false, 'Kai', 'Kaputt');
  v_s := v_s || (v_j->>'lead_created') || '/';
  v_j := luma_sync_registration('evt-test-k34', 'GESPERRT-k34@example.invalid', 'gst-k34-5', 'registered', null, false, 'Gil', 'Gesperrt');
  v_s := v_s || (v_j->>'lead_created');
  insert into t_res values ('04_kein_lead',
    case when v_s = 'false/false/false/false'
          and not exists (select 1 from person where last_name in ('Eingeladen', 'Abgesagt', 'Kaputt', 'Gesperrt'))
          and not exists (select 1 from registration where external_ref in ('gst-k34-2', 'gst-k34-3', 'gst-k34-4', 'gst-k34-5'))
         then 'ok' else v_s end);

  -- 05 Wartelisten- und Wartegäste werden Leads, der Lead wird später zugeordnet (auch mit anderer Schreibweise)
  v_j := luma_sync_registration('evt-test-k34', 'warte-k34@example.invalid', 'gst-k34-6', 'waitlist', null, false, 'Wiebke', 'Warte');
  v_s := v_j->>'lead_created';
  v_j := luma_sync_registration('evt-test-k34', 'Warte-K34@Example.Invalid', 'gst-k34-7', 'pending', null, false, 'Wiebke', 'Warte');
  select count(*) into v_n from person where last_name = 'Warte';
  insert into t_res values ('05_zuordnung',
    case when v_s = 'true' and v_j->>'matched' = 'true' and v_j->>'lead_created' = 'false' and v_n = 1
          and (select count(*) from registration g join person p on p.id = g.person_id where p.last_name = 'Warte' and g.event_id = v_ev) = 1
         then 'ok' else v_s || ' ' || v_j::text || ' n=' || v_n end);

  -- 06 Zählwerte
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  select * into r from luma_lead_stats();
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  begin perform luma_lead_stats(); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into t_res values ('06_zaehlwerte',
    case when v_s = 'ok' and r.total >= v_before + 2 and r.without_login >= 2 and r.claimed <= r.total
          and (select count(*) from information_schema.columns where table_name = 'luma_lead_stats') = 0
         then 'ok' else v_s || ' ' || coalesce(r.total::text, 'null') end);

  -- 07 Löschweg wie bei jeder Person
  perform set_config('request.jwt.claims', null, true);
  perform anonymize_person(v_lead);
  insert into t_res values ('07_loeschweg',
    case when (select first_name is null and last_name is null from person where id = v_lead)
          and (select deleted_at is not null from person where id = v_lead)
          and not exists (select 1 from person_email where person_id = v_lead and email::text = lower(v_mail))
          and (select external_ref is null from registration where person_id = v_lead and event_id = v_ev)
          and exists (select 1 from suppression where email_hash = email_hash(v_mail))
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
