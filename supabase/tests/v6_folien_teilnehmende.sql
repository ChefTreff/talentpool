-- Test „Folien nach dem Summit" (TAL-001, vorschlag/v6_folien_teilnehmende.sql). Belegt:
--   01 Vorbedingung: mit Ticket erscheint genau die eine Datei, die alle Bedingungen erfüllt;
--   02 ohne Ticket der Edition ⇒ leer (auch mit Ticket einer **anderen** Edition);
--   03 storniertes Ticket zählt nicht; `checked_in` zählt;
--   04 nicht freigegeben, ältere Fassung, Foto mit Freigabe, Entwurfs-Session und
--      zukünftiger Slot erscheinen jeweils nicht;
--   05 Freigabe zurückgenommen ⇒ Datei verschwindet sofort;
--   06 Speaker-Name kommt als Text, keine weiteren Personendaten (Spaltenliste);
--   07 ohne Person ⇒ 28000; Grants: anon ohne EXECUTE, authenticated mit.
--
-- Probelauf der Build-Session am 24.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurueckgerollt, Wegwerf-Editionen): 7 von 7 Schritten gruen. Keine bestehende Funktion geaendert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_spk uuid;
  v_ed uuid; v_ed2 uuid; v_day uuid; v_st uuid; v_past uuid; v_past2 uuid; v_fut uuid;
  v_s_ok uuid; v_s_draft uuid; v_s_fut uuid; v_prof uuid;
  v_ok uuid; v_old uuid; v_norel uuid; v_foto uuid; v_draft uuid; v_future uuid;
  v_t uuid; v_s text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  select p.id into v_spk from person p where p.id <> v_pid and p.deleted_at is null limit 1;
  update person set first_name = 'Folien', last_name = 'Speakerin' where id = v_spk;

  -- Wegwerf-Editionen, damit keine Stammdaten vorausgesetzt werden.
  insert into event (name, format_tag, is_edition, slug) values ('Folien-Test 26', 'edition', true, 'folien-test-26')
    returning id into v_ed;
  insert into event (name, format_tag, is_edition, slug) values ('Folien-Test Andere', 'edition', true, 'folien-test-andere')
    returning id into v_ed2;
  insert into event_day (event_id, day_date) values (v_ed, current_date - 10) returning id into v_day;
  insert into stage (event_id, name, slug) values (v_ed, 'Test-Bühne', 'test-buehne-folien') returning id into v_st;
  insert into slot (stage_id, event_day_id, start_at, end_at)
    values (v_st, v_day, now() - interval '10 days 1 hour', now() - interval '10 days') returning id into v_past;
  insert into slot (stage_id, event_day_id, start_at, end_at)
    values (v_st, v_day, now() + interval '1 day', now() + interval '1 day 1 hour') returning id into v_fut;
  insert into slot (stage_id, event_day_id, start_at, end_at)
    values (v_st, v_day, now() - interval '9 days 1 hour', now() - interval '9 days') returning id into v_past2;
  insert into session (event_id, slot_id, title_de, title_en, format, access_mode, publish_status)
    values (v_ed, v_past, 'Vergangene Keynote', 'Past keynote', 'keynote', 'open', 'draft') returning id into v_s_ok;
  update session set description_de = 'Beschreibung', publish_status = 'published' where id = v_s_ok;
  insert into session (event_id, title_de, format, access_mode, publish_status)
    values (v_ed, 'Entwurf', 'keynote', 'open', 'draft') returning id into v_s_draft;
  update session set slot_id = v_past2 where id = v_s_draft;
  insert into session (event_id, slot_id, title_de, format, access_mode, publish_status)
    values (v_ed, v_fut, 'Zukunft', 'keynote', 'open', 'draft') returning id into v_s_fut;
  update session set title_en = 'Future' where id = v_s_fut;
  update session set description_de = 'Beschreibung', publish_status = 'published' where id = v_s_fut;
  insert into speaker_profile (person_id, edition_id) values (v_spk, v_ed) returning id into v_prof;

  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, version, is_current, slides_release)
    values (v_prof, v_s_ok, 'presentation', v_ed || '/' || v_prof || '/presentation/v2.pdf', 'folien-v2.pdf', 2, true, true)
    returning id into v_ok;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, version, is_current, slides_release)
    values (v_prof, v_s_ok, 'presentation', v_ed || '/' || v_prof || '/presentation/v1.pdf', 'folien-v1.pdf', 1, false, true)
    returning id into v_old;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, version, is_current, slides_release)
    values (v_prof, v_s_draft, 'presentation', v_ed || '/' || v_prof || '/presentation/draft.pdf', 'draft.pdf', 1, true, true)
    returning id into v_draft;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, version, is_current, slides_release)
    values (v_prof, v_s_fut, 'presentation', v_ed || '/' || v_prof || '/presentation/fut.pdf', 'fut.pdf', 1, true, true)
    returning id into v_future;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, version, is_current, slides_release)
    values (v_prof, v_s_ok, 'photo', v_ed || '/' || v_prof || '/photo/p.jpg', 'p.jpg', 1, true, true)
    returning id into v_foto;

  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 ohne Ticket / mit Ticket einer anderen Edition
  select count(*) into v_n from my_session_slides() m where m.edition_id = v_ed;
  insert into ticket (event_id, person_id, status) values (v_ed2, v_pid, 'valid');
  select count(*) + v_n into v_n from my_session_slides() m where m.edition_id = v_ed;
  insert into t_res values ('02_ohne_ticket_leer', case when v_n = 0 then 'ok' else 'ALLOWED (BUG) n=' || v_n end);

  -- 01 mit Ticket der Edition
  insert into ticket (event_id, person_id, status) values (v_ed, v_pid, 'valid') returning id into v_t;
  select string_agg(m.asset_id::text, ',') into v_s from my_session_slides() m where m.edition_id = v_ed;
  insert into t_res values ('01_genau_eine_datei', case when v_s = v_ok::text then 'ok' else coalesce(v_s, 'leer') end);

  -- 03 storniert zählt nicht, checked_in zählt
  update ticket set status = 'cancelled' where id = v_t;
  select count(*) into v_n from my_session_slides() m where m.edition_id = v_ed;
  update ticket set status = 'checked_in' where id = v_t;
  v_s := case when v_n = 0 then 'ok' else 'ALLOWED (BUG)' end;
  select count(*) into v_n from my_session_slides() m where m.edition_id = v_ed;
  insert into t_res values ('03_ticketstatus', case when v_s = 'ok' and v_n = 1 then 'ok' else v_s || ' n=' || v_n end);

  -- 04 was nie erscheint (Vorbedingung 01 zeigt: die Liste ist nicht einfach leer)
  select count(*) into v_n from my_session_slides() m
   where m.asset_id in (v_old, v_foto, v_draft, v_future);
  insert into t_res values ('04_ausgeschlossen', case when v_n = 0 then 'ok' else 'ALLOWED (BUG) n=' || v_n end);
  update speaker_asset set slides_release = false where id = v_ok;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, version, is_current, slides_release)
    values (v_prof, v_s_ok, 'presentation', v_ed || '/' || v_prof || '/presentation/x.pdf', 'x.pdf', 1, true, false)
    returning id into v_norel;

  -- 05 zurückgenommen
  select count(*) into v_n from my_session_slides() m where m.edition_id = v_ed;
  insert into t_res values ('05_zurueckgenommen', case when v_n = 0 then 'ok' else 'ALLOWED (BUG) n=' || v_n end);
  update speaker_asset set slides_release = true where id = v_ok;

  -- 06 Speaker-Name und Spaltenliste
  select m.speaker_name into v_s from my_session_slides() m where m.asset_id = v_ok;
  insert into t_res values ('06_speaker_name',
    case when v_s = 'Folien Speakerin'
          and pg_get_function_result('my_session_slides()'::regprocedure) =
              'TABLE(asset_id uuid, session_id uuid, session_title_de text, session_title_en text, speaker_name text, filename text, storage_path text, slot_end_at timestamp with time zone, edition_id uuid)'
         then 'ok' else coalesce(v_s, 'leer') || ' / ' || pg_get_function_result('my_session_slides()'::regprocedure) end);

  -- 07 ohne Person, Grants
  perform set_config('request.jwt.claims', null, true);
  begin
    perform * from my_session_slides();
    v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '28000' then 'ok' else sqlstate end; end;
  insert into t_res values ('07_ohne_person_grants',
    case when v_s = 'ok'
          and not has_function_privilege('anon', 'my_session_slides()', 'execute')
          and has_function_privilege('authenticated', 'my_session_slides()', 'execute')
         then 'ok' else v_s end);
end $$;
select * from t_res order by step;
rollback;
