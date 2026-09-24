-- Test „Community-Events aus Luma" (TAL-007, vorschlag/v6_luma_events.sql). Belegt:
--   01 angemeldete Person darf die Sync-Funktionen nicht aufrufen (42501); Grants entzogen;
--   02 Event anlegen und nachziehen: dieselbe Id, eine external_ref, Datum in Berliner Zeit;
--   03 Gast ohne passende Person ⇒ matched false, keine Zeile;
--   04 Anmeldung aus dem Portal (ohne Gast-Id) und späterer Abgleich mit Gast-Id ⇒ **eine**
--      Zeile, Gast-Id nachgetragen; E-Mail ohne Rücksicht auf Groß-/Kleinschreibung;
--   05 Check-in ⇒ attended; Warteliste ⇒ waitlisted;
--   06 unbekannter Status 22023, unbekanntes Event P0002;
--   07 my_community_registrations: eigene Teilnahme mit Luma-Id, fremde Person sieht nichts;
--   08 keine Portal-Mail für Luma-Teilnahmen (Luma verschickt selbst).
--
-- Probelauf der Build-Session am 24.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurueckgerollt): 8 von 8 Schritten gruen. Keine bestehende Funktion geaendert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_other uuid; v_uid2 uuid;
  v_ev uuid; v_ev2 uuid; v_j jsonb; v_n integer; v_s text; v_reg uuid; v_mail_before integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select p.id, p.auth_user_id into v_other, v_uid2 from person p
   where p.auth_user_id is not null and p.id <> v_pid and p.deleted_at is null limit 1;
  select count(*) into v_mail_before from mail_log;

  -- 01 angemeldet: verboten
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  begin
    perform luma_sync_event('{"luma_id":"evt-x"}'::jsonb);
    v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into t_res values ('01_nur_server',
    case when v_s = 'ok'
          and not has_function_privilege('authenticated', 'luma_sync_event(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'luma_sync_registration(text,text,text,text,timestamptz,boolean)', 'execute')
          and has_function_privilege('authenticated', 'my_community_registrations()', 'execute')
         then 'ok' else v_s end);

  -- Ab hier Serverkontext
  perform set_config('request.jwt.claims', null, true);

  -- 02 Event
  v_ev := luma_sync_event(jsonb_build_object('luma_id', 'evt-test-okt', 'name', 'Community Night',
            'start_at', '2026-10-15T22:30:00Z', 'end_at', '2026-10-15T23:30:00Z', 'timezone', 'Europe/Berlin',
            'city', 'Hamburg', 'url', 'https://luma.com/test'));
  v_ev2 := luma_sync_event(jsonb_build_object('luma_id', 'evt-test-okt', 'name', 'Community Night Oktober',
            'start_at', '2026-10-15T22:30:00Z', 'end_at', '2026-10-15T23:30:00Z', 'timezone', 'Europe/Berlin'));
  select count(*) into v_n from external_ref r where r.system = 'luma' and r.external_id = 'evt-test-okt';
  insert into t_res values ('02_event',
    case when v_ev = v_ev2 and v_n = 1
          and (select name from event where id = v_ev) = 'Community Night Oktober'
          and (select format_tag from event where id = v_ev) = 'community'
          and (select start_date from event where id = v_ev) = date '2026-10-16'   -- 00:30 in Berlin
          and (select location from event where id = v_ev) = 'Hamburg'
         then 'ok' else 'FEHLER n=' || v_n end);

  -- 03 ohne Person
  v_j := luma_sync_registration('evt-test-okt', 'niemand-' || gen_random_uuid() || '@example.invalid', 'gst-x', 'registered');
  insert into t_res values ('03_ohne_person',
    case when v_j->>'matched' = 'false' and not exists (select 1 from registration where external_ref = 'gst-x') then 'ok' else v_j::text end);

  -- 04 Portal-Zeile, dann Abgleich
  v_j := luma_sync_registration('evt-test-okt', upper(v_email), null, 'pending');
  v_reg := (v_j->>'registration_id')::uuid;
  v_j := luma_sync_registration('evt-test-okt', v_email, 'gst-test-1', 'registered', '2026-10-01T10:00:00Z');
  select count(*) into v_n from registration where person_id = v_pid and event_id = v_ev;
  insert into t_res values ('04_eine_zeile',
    case when v_n = 1 and (v_j->>'registration_id')::uuid = v_reg
          and (select external_ref from registration where id = v_reg) = 'gst-test-1'
          and (select status from registration where id = v_reg) = 'confirmed'
         then 'ok' else 'FEHLER n=' || v_n || ' ' || v_j::text end);

  -- 05 Check-in, Warteliste
  perform luma_sync_registration('evt-test-okt', v_email, 'gst-test-1', 'registered', null, true);
  v_s := (select status from registration where id = v_reg);
  perform luma_sync_registration('evt-test-okt', v_email, 'gst-test-1', 'waitlist');
  insert into t_res values ('05_status',
    case when v_s = 'attended' and (select status from registration where id = v_reg) = 'waitlisted' then 'ok' else v_s end);

  -- 06 Fehler
  begin perform luma_sync_registration('evt-test-okt', v_email, 'gst-test-1', 'erfunden'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' then 'ok' else sqlstate end; end;
  begin perform luma_sync_registration('evt-gibt-es-nicht', v_email, 'gst-test-1', 'registered'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('06_fehler', case when v_s = 'ok/ok' then 'ok' else v_s end);

  -- 07 eigene Teilnahmen
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  select string_agg(luma_event_id, ',') into v_s from my_community_registrations();
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2, 'role', 'authenticated')::text, true);
  select count(*) into v_n from my_community_registrations() m where m.luma_event_id = 'evt-test-okt';
  insert into t_res values ('07_eigene', case when v_s like '%evt-test-okt%' and v_n = 0 then 'ok' else coalesce(v_s, 'leer') || ' n=' || v_n end);

  -- 08 keine Mail
  select count(*) - v_mail_before into v_n from mail_log;
  insert into t_res values ('08_keine_mail', case when v_n = 0 then 'ok' else 'FEHLER n=' || v_n end);
end $$;
select * from t_res order by step;
rollback;
