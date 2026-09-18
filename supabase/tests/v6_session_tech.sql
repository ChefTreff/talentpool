-- Smoke-Test A7.2 (Technik am Slot). Belegt:
--   01 wer nicht auf der Bühne steht, schreibt nicht ⇒ 42501;
--   02 der Speaker der Session schreibt, Freitext bleibt Freitext;
--   03 ein unbekannter Schlüssel ⇒ 22023 invalid_tech_key mit dem Schlüssel
--      im detail (nicht stillschweigend verworfen);
--   04 über 500 Zeichen ⇒ 22023 tech_too_long mit dem Feld im detail;
--   05 leere Werte fallen heraus, statt als "" stehen zu bleiben;
--   06 Vorbelegung aus tech_rider greift beim **ersten** Schreiben;
--   07 und **nicht** mehr beim zweiten — danach gilt der Slot;
--   08 die Assistenz darf schreiben;
--   09 my_sessions liefert tech mit;
--   10 und hat dabei **keine** der alten Spalten verloren (Lehre aus 0099);
--   11 der Helfer session_tech_keys ist für authenticated gesperrt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_event uuid;
  v_session uuid; v_fremd_session uuid; v_profile uuid;
  v_ass_uid uuid; v_ass_mail text;
  v_tech jsonb; v_detail text; v_n integer; v_spalten text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_event from event e where e.edition_id = v_ed or e.id = v_ed order by e.start_date limit 1;

  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_profile;
  end if;
  -- Rider mit zwei Werten, an denen die Vorbelegung sichtbar wird.
  update speaker_profile set tech_rider = jsonb_build_object('mic', 'Headset', 'notes', 'Wasser auf der Bühne')
   where id = v_profile;

  insert into session (event_id, format, title_de) values (v_event, 'keynote', 'ZZ Technik-Test')
    returning id into v_session;
  insert into session_speaker (session_id, person_id, role) values (v_session, v_pid, 'speaker');

  insert into session (event_id, format, title_de) values (v_event, 'keynote', 'ZZ Fremde Session')
    returning id into v_fremd_session;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · fremde Session
  begin
    perform update_session_tech(v_fremd_session, jsonb_build_object('microphone', 'Handmikro'));
    insert into t_res values ('01_fremde_session', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_fremde_session', 'abgewiesen ' || sqlstate); end;

  -- 02 · eigene Session, Freitext
  v_tech := update_session_tech(v_session, jsonb_build_object(
    'people_on_stage', 'zwei Personen, ich und die Moderatorin',
    'microphone', 'Headset, ersatzweise Handmikro',
    'presentation_media', 'Slides als PDF, ein Video mit Ton'));
  insert into t_res values ('02_freitext',
    case when v_tech->>'microphone' = 'Headset, ersatzweise Handmikro'
         then 'ok, Freitext erhalten' else 'FEHLER ' || coalesce(v_tech->>'microphone', 'null') end);

  -- 03 · unbekannter Schlüssel
  begin
    perform update_session_tech(v_session, jsonb_build_object('beamer', 'zwei'));
    insert into t_res values ('03_unbekannter_schluessel', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_unbekannter_schluessel', 'abgewiesen ' || sqlstate || ' / detail=' || coalesce(v_detail, '-'));
  end;

  -- 04 · zu lang
  begin
    perform update_session_tech(v_session, jsonb_build_object('furniture', repeat('x', 501)));
    insert into t_res values ('04_zu_lang', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04_zu_lang', 'abgewiesen ' || sqlstate || ' / detail=' || coalesce(v_detail, '-'));
  end;

  -- 05 · leere Werte fallen heraus
  v_tech := update_session_tech(v_session, jsonb_build_object(
    'microphone', 'Headset', 'furniture', '   ', 'special_requirements', ''));
  insert into t_res values ('05_leere_werte',
    case when not (v_tech ? 'furniture') and not (v_tech ? 'special_requirements')
         then 'ok, leere Felder entfallen' else 'FEHLER ' || v_tech::text end);

  -- 06 · Vorbelegung beim ersten Schreiben
  update session set tech = '{}'::jsonb where id = v_session;
  v_tech := update_session_tech(v_session, jsonb_build_object('people_on_stage', 'eine Person'));
  insert into t_res values ('06_vorbelegung',
    case when v_tech->>'special_requirements' = 'Wasser auf der Bühne'
          and v_tech->>'microphone' = 'Headset'
         then 'ok, aus dem Rider' else 'FEHLER ' || v_tech::text end);

  -- 07 · keine Vorbelegung beim zweiten Mal
  v_tech := update_session_tech(v_session, jsonb_build_object('people_on_stage', 'zwei Personen'));
  insert into t_res values ('07_keine_zweite_vorbelegung',
    case when not (v_tech ? 'special_requirements') and not (v_tech ? 'microphone')
         then 'ok, Slot gewinnt' else 'FEHLER ' || v_tech::text end);

  -- 08 · Assistenz
  select p.auth_user_id, pe.email::text into v_ass_uid, v_ass_mail
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.id <> v_pid limit 1;
  if v_ass_uid is not null then
    update speaker_profile set assistant_person_id =
      (select p.id from person p where p.auth_user_id = v_ass_uid) where id = v_profile;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_ass_uid, 'role', 'authenticated', 'email', v_ass_mail)::text, true);
    begin
      perform update_session_tech(v_session, jsonb_build_object('furniture', 'Barhocker'));
      insert into t_res values ('08_assistenz', 'ok, darf schreiben');
    exception when others then insert into t_res values ('08_assistenz', 'ABGEWIESEN (BUG) ' || sqlstate); end;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  else
    insert into t_res values ('08_assistenz', 'uebersprungen: kein zweites Konto im Bestand');
  end if;

  -- 09 · tech in my_sessions
  select count(*) into v_n from my_sessions() m
   where m.session_id = v_session and m.tech ? 'people_on_stage';
  insert into t_res values ('09_my_sessions_tech',
    case when v_n = 1 then 'ok' else 'FEHLER ' || v_n::text end);

  -- 10 · alte Spalten vollständig (die Spalte, die **nicht** Gegenstand der
  --      Änderung ist: latest_submission, co_speakers, on_behalf_of).
  -- `RETURNS TABLE` hat keinen Composite-Typ in `pg_type`; die Spaltenliste
  -- steht nur in `pg_get_function_result` (Konvention §6).
  select pg_get_function_result(pr.oid) into v_spalten
    from pg_proc pr
   where pr.proname = 'my_sessions' and pr.pronamespace = 'public'::regnamespace;
  insert into t_res values ('10_alte_spalten',
    case when v_spalten like '%co_speakers%latest_submission%on_behalf_of%tech jsonb%'
         then 'ok, vollstaendig + tech' else 'FEHLER ' || coalesce(v_spalten, 'null') end);

  -- 11 · Helfer gesperrt
  insert into t_res values ('11_helfer_gesperrt',
    case when has_function_privilege('authenticated', 'session_tech_keys()', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
end $$;
select * from t_res order by step;
rollback;
