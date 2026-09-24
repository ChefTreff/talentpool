-- Smoke-Test „Technik neu geschnitten" (SPK-029, LEAD-012). Belegt:
--   01 der Speaker gibt nur noch Mikrofon und besondere Anforderungen an;
--   02 die drei Felder der Regie weist die Ansage jetzt ab (22023
--      invalid_tech_key, mit dem Schluessel im detail);
--   03 das Mikrofon ist eine Auswahl: ein Freitext wird abgewiesen (22023
--      invalid_microphone) — genau der Fall, der frueher aus dem Rider kam;
--   04 `regie_cue` nimmt „Personen auf der Buehne" entgegen;
--   05 `regie_view` gibt die Spalte heraus;
--   06 ohne Regie-Recht bleibt `regie_view` gesperrt (42501);
--   07 Grants nach dem drop/create: anon gesperrt, authenticated erlaubt;
--   08 im Altbestand steht keiner der drei Schluessel mehr.
--
-- Probelauf der Build-Session am 23.09.2026 gegen die Live-Datenbank
-- (`sh scripts/db.sh dry-run`, alles zurueckgerollt): 9 von 9 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_session uuid; v_stage uuid; v_day uuid; v_slot uuid; v_cue uuid;
  v_tech jsonb; v_n integer; v_detail text; v_text text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed)
    on conflict do nothing;

  insert into stage (event_id, name) values (v_ed, 'ZZ Testbuehne') returning id into v_stage;
  -- Die Veranstaltungstage pflegt Konrad seit dem 21.09. selbst; hier wird
  -- einer genommen statt einer angelegt (sonst 23505 auf dem Unique).
  select d.id into v_day from event_day d where d.event_id = v_ed order by d.day_date limit 1;
  if v_day is null then
    insert into event_day (event_id, day_date) values (v_ed, '2027-04-16') returning id into v_day;
  end if;
  insert into slot (stage_id, event_day_id, start_at, end_at)
    values (v_stage, v_day, now() + interval '200 days', now() + interval '200 days 30 minutes')
    returning id into v_slot;
  insert into session (event_id, title_de, format, slot_id)
    values (v_ed, 'ZZ Technik', 'keynote', v_slot) returning id into v_session;
  insert into session_speaker (session_id, person_id, role) values (v_session, v_pid, 'speaker');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · was bleibt
  v_tech := update_session_tech(v_session, jsonb_build_object(
    'microphone', 'headset', 'special_requirements', 'Hocker waere schoen'));
  insert into t_res values ('01_ansage',
    case when v_tech->>'microphone' = 'headset' and v_tech ? 'special_requirements'
         then 'ok' else 'FEHLER ' || v_tech::text end);

  -- 02 · was nicht mehr geht
  begin
    perform update_session_tech(v_session, jsonb_build_object('people_on_stage', 'drei'));
    insert into t_res values ('02_personen_abgewiesen', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('02_personen_abgewiesen',
      'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 03 · Mikrofon als Auswahl
  begin
    perform update_session_tech(v_session, jsonb_build_object('microphone', 'Headset mit Ersatz'));
    insert into t_res values ('03_mikro_freitext', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_mikro_freitext',
      'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 06 · Regie ohne Recht
  begin
    perform count(*) from regie_view(v_stage, v_day);
    insert into t_res values ('06_regie_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06_regie_ohne_recht', 'abgewiesen ' || sqlstate);
  end;

  -- 04/05 · mit Recht: schreiben und lesen
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_cue := upsert_regie_cue(jsonb_build_object(
    'stage_id', v_stage, 'event_day_id', v_day, 'slot_id', v_slot,
    'cue_start', (now() + interval '200 days')::text,
    'cue_end', (now() + interval '200 days 30 minutes')::text,
    'action', 'Session', 'people_on_stage', 'Speakerin und Moderation'));
  select people_on_stage into v_text from regie_cue where id = v_cue;
  insert into t_res values ('04_cue_schreibt',
    case when v_text = 'Speakerin und Moderation' then 'ok' else 'FEHLER ' || coalesce(v_text, 'null') end);

  select r.people_on_stage into v_text from regie_view(v_stage, v_day) r where r.cue_id = v_cue;
  insert into t_res values ('05_regie_liest',
    case when v_text = 'Speakerin und Moderation' then 'ok' else 'FEHLER ' || coalesce(v_text, 'null') end);
  delete from role_assignment where person_id = v_pid;

  -- 07 · Grants nach dem drop/create
  insert into t_res values ('07_anon_gesperrt',
    case when has_function_privilege('anon', 'regie_view(uuid, uuid)', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
  insert into t_res values ('07_authenticated_erlaubt',
    case when has_function_privilege('authenticated', 'regie_view(uuid, uuid)', 'execute')
         then 'ok' else 'FEHLER: der drop hat die Rechte mitgenommen' end);

  -- 08 · Altbestand
  select count(*)::integer into v_n from session
   where tech ?| array['people_on_stage', 'presentation_media', 'furniture'];
  insert into t_res values ('08_altbestand_sauber',
    case when v_n = 0 then 'ok, keine Session mehr' else 'FEHLER ' || v_n::text end);
end $$;
select * from t_res order by step;
rollback;
