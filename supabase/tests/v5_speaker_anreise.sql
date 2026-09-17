-- Smoke-Test 0098 (An- und Abreise, Abgleich 15.09.). Belegt:
--   01 ohne Speaker-Profil gibt es nichts einzutragen ⇒ P0002;
--   02 Speaker trägt die Reise ein und liest sie zurück;
--   03 ein unbekanntes Verkehrsmittel wird mit `invalid_travel_mode`
--      abgewiesen, nicht stillschweigend gespeichert;
--   04 ein zweiter Aufruf mit nur der Abreise lässt die Anreise stehen —
--      sonst leert ein halbes Formular das andere;
--   05 Abreise vor Anreise weist der CHECK ab;
--   06 die Liste ist nicht für Speaker ⇒ 42501;
--   07 das Speaker-Team sieht den Eintrag in der Liste;
--   08 keine Grants für `authenticated`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid; v_j jsonb; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from speaker_profile where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  begin
    perform set_my_speaker_travel(jsonb_build_object('arrival_date', '2027-04-15'), v_ed);
    insert into t_res values ('01_ohne_profil', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_ohne_profil', 'abgewiesen ' || sqlstate); end;

  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status)
    values (v_pid, v_ed, 'keynote', 'confirmed') returning id into v_sp;

  perform set_my_speaker_travel(jsonb_build_object(
    'arrival_date', '2027-04-15', 'arrival_time', '14:30', 'arrival_mode', 'bahn',
    'arrival_ref', 'ICE 802', 'needs_pickup', true,
    'departure_date', '2027-04-17', 'departure_time', '10:05', 'departure_mode', 'bahn'), v_ed);
  v_j := my_speaker_travel(v_ed);
  insert into t_res values ('02_eintragen',
    case when v_j->>'arrival_ref' = 'ICE 802' and (v_j->>'needs_pickup')::boolean
         then 'gespeichert und gelesen (richtig)' else 'unerwartet ' || coalesce(v_j::text, 'leer') end);

  begin
    perform set_my_speaker_travel(jsonb_build_object('arrival_mode', 'rakete'), v_ed);
    insert into t_res values ('03_unbekanntes_mittel', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('03_unbekanntes_mittel', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  perform set_my_speaker_travel(jsonb_build_object('departure_time', '11:00'), v_ed);
  v_j := my_speaker_travel(v_ed);
  insert into t_res values ('04_teilspeicherung',
    case when v_j->>'arrival_ref' = 'ICE 802' and v_j->>'departure_time' = '11:00:00'
         then 'Anreise steht, Abreise neu (richtig)'
         else 'unerwartet ' || coalesce(v_j->>'arrival_ref', '-') || '/' || coalesce(v_j->>'departure_time', '-') end);

  begin
    perform set_my_speaker_travel(jsonb_build_object('departure_date', '2027-04-14'), v_ed);
    insert into t_res values ('05_reihenfolge', 'ANGENOMMEN (BUG)');
  exception when others then insert into t_res values ('05_reihenfolge', 'abgewiesen ' || sqlstate); end;

  begin
    perform count(*) from speaker_travel_list(v_ed);
    insert into t_res values ('06_liste_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('06_liste_ohne_rolle', 'abgewiesen ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  select l.arrival_ref into v_txt from speaker_travel_list(v_ed) l where l.profile_id = v_sp;
  insert into t_res values ('07_liste_mit_rolle',
    case when v_txt = 'ICE 802' then 'in der Liste (richtig)' else 'unerwartet ' || coalesce(v_txt, 'fehlt') end);

  insert into t_res values ('08_grants',
    case when has_table_privilege('authenticated', 'speaker_travel', 'select')
         then 'LESBAR (BUG)' else 'kein SELECT (richtig)' end);
end $$;
select * from t_res order by step;
rollback;
