-- Smoke-Test „Themen als Liste" (SPK-027). Belegt:
--   01 das Vokabular steht mit 17 Eintraegen bereit;
--   02 eine Einreichung mit gepflegten Themen geht durch und speichert sie;
--   03 ein erfundenes Thema wird abgewiesen (22023 invalid_topic, mit dem
--      Wert im detail) — sonst waere `topics` ein Freitextfeld mit
--      Auswahlknoepfen davor;
--   04 eine Einreichung ganz ohne Themen bleibt erlaubt (die Angabe ist
--      freiwillig, und ein Pflichtfeld hat Konrad nicht verlangt);
--   05 die vorige Einreichung wird abgeloest (Verhalten unveraendert).
--
-- Probelauf der Build-Session am 22.09.2026 gegen die Live-Datenbank
-- (`sh scripts/db.sh dry-run`, alles zurueckgerollt): 5 von 5 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_profile uuid;
  v_session uuid; v_stage uuid; v_day uuid;
  v_n integer; v_detail text; v_topics text[];
begin
  select count(*)::integer into v_n from vocab_term where vocabulary = 'session_topic';
  insert into t_res values ('01_vokabular',
    case when v_n = 17 then 'ok, 17 Themen' else 'FEHLER ' || v_n::text end);

  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_profile;
  end if;

  -- Eine Session, an der diese Person spricht.
  insert into session (event_id, title_de, format) values (v_ed, 'ZZ Testsession', 'keynote')
    returning id into v_session;
  insert into session_speaker (session_id, person_id, role) values (v_session, v_pid, 'speaker');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 02 · gepflegte Themen
  perform submit_session_content(v_session, jsonb_build_object(
    'title', 'Fuehrung, Vertrauen und Tempo',
    'topics', jsonb_build_array('leadership_management', 'tech_ai')));
  select s.topics into v_topics from session_submission s
   where s.session_id = v_session and s.status = 'submitted';
  insert into t_res values ('02_gepflegte_themen',
    case when v_topics @> array['leadership_management', 'tech_ai'] and array_length(v_topics, 1) = 2
         then 'ok' else 'FEHLER ' || coalesce(array_to_string(v_topics, ','), 'null') end);

  -- 03 · erfundenes Thema
  begin
    perform submit_session_content(v_session, jsonb_build_object(
      'title', 'Noch ein Titel', 'topics', jsonb_build_array('tech_ai', 'brieftaube')));
    insert into t_res values ('03_erfundenes_thema', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_erfundenes_thema',
      'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 04 · ohne Themen
  begin
    perform submit_session_content(v_session, jsonb_build_object('title', 'Ohne Themen'));
    insert into t_res values ('04_ohne_themen', 'ok, erlaubt');
  exception when others then
    insert into t_res values ('04_ohne_themen', 'ABGEWIESEN (BUG) ' || sqlstate);
  end;

  -- 05 · die vorige Einreichung ist abgeloest
  select count(*)::integer into v_n from session_submission
   where session_id = v_session and status = 'superseded';
  insert into t_res values ('05_vorige_abgeloest',
    case when v_n >= 1 then 'ok' else 'FEHLER: keine abgeloest' end);
end $$;
select * from t_res order by step;
rollback;
