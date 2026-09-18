-- Smoke-Test A7.1 (Shuttle-Fahrten). Belegt:
--   01 ohne jede Beziehung zum Profil bleibt das Anfordern zu ⇒ 42501;
--   02 der Speaker selbst darf anfordern, Status ist requested;
--   03 fehlende Pflichtangaben ⇒ 22023 fields_required;
--   04 späteste Ankunft vor der Abholung ⇒ 22023 invalid_shuttle;
--   05 die fünfte Fahrt geht noch ohne Begründung durch;
--   06 die sechste ohne Begründung ⇒ P0001 shuttle_limit mit Zahl im detail;
--   07 die sechste **mit** Begründung geht durch und merkt sie sich;
--   08 der Speaker darf seine Fahrt nicht selbst freigeben ⇒ 42501;
--   09 das Speaker-Team gibt frei ⇒ confirmed, mit Zeitstempel;
--   10 ein zweites Freigeben ⇒ P0001 shuttle_not_open;
--   11 Stornieren nimmt die Fahrt aus der Zählung — danach geht wieder eine
--      Fahrt ohne Begründung (das ist der Kern von „Schwelle statt Riegel");
--   12 my_shuttle_bookings zeigt nur die eigenen Fahrten;
--   13 shuttle_bookings_admin ohne Team-Rolle ⇒ 42501;
--   14 Grants: Trigger-Funktion ist für authenticated gesperrt, die Tabelle
--      hat keine Grants.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_profile uuid; v_fremd uuid; v_fremd_person uuid;
  v_id uuid; v_b shuttle_booking%rowtype; v_n integer; v_detail text; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  -- Testperson ohne Vorrechte: sonst entscheidet eine geerbte Rolle mit.
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  -- Eigenes Profil: die Testperson hat je nach Bestand schon eines (Lehre aus
  -- den vier Testprämissen vom 15.09.) — deshalb suchen, dann anlegen.
  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed)
      returning id into v_profile;
  end if;
  delete from shuttle_booking where profile_id = v_profile;

  -- Fremdes Profil einer Wegwerf-Person.
  insert into person (first_name, last_name) values ('ZZ', 'Shuttle-Fremd')
    returning id into v_fremd_person;
  insert into speaker_profile (person_id, edition_id) values (v_fremd_person, v_ed)
    returning id into v_fremd;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · fremdes Profil
  begin
    perform request_shuttle(v_fremd, jsonb_build_object(
      'passenger_name', 'ZZ Test', 'pickup_at', (now() + interval '10 days')::text,
      'pickup_location', 'Hotel', 'dropoff_location', 'CCH'));
    insert into t_res values ('01_fremdes_profil', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('01_fremdes_profil', 'abgewiesen ' || sqlstate); end;

  -- 02 · eigenes Profil
  v_id := (request_shuttle(v_profile, jsonb_build_object(
    'passenger_name', 'ZZ Test 1', 'pickup_at', (now() + interval '10 days')::text,
    'pickup_location', 'Hotel', 'dropoff_location', 'CCH',
    'driver_phone', '+49 170 0000000', 'passengers', '2'))->>'id')::uuid;
  select * into v_b from shuttle_booking where id = v_id;
  insert into t_res values ('02_eigene_fahrt',
    case when v_b.status = 'requested' and v_b.passengers = 2 and v_b.booked_by_email = v_email
         then 'ok requested' else 'FEHLER ' || coalesce(v_b.status, 'null') end);

  -- 03 · Pflichtangaben
  begin
    perform request_shuttle(v_profile, jsonb_build_object('passenger_name', 'ZZ ohne Zeit'));
    insert into t_res values ('03_pflichtfelder', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_pflichtfelder', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 04 · Ankunft vor Abholung
  begin
    perform request_shuttle(v_profile, jsonb_build_object(
      'passenger_name', 'ZZ Rueckwaerts', 'pickup_at', (now() + interval '10 days')::text,
      'pickup_location', 'Hotel', 'dropoff_location', 'CCH',
      'latest_arrival_at', (now() + interval '9 days')::text));
    insert into t_res values ('04_ankunft_vor_abholung', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04_ankunft_vor_abholung', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 05 · Fahrten zwei bis fünf
  for i in 2..5 loop
    perform request_shuttle(v_profile, jsonb_build_object(
      'passenger_name', 'ZZ Test ' || i::text, 'pickup_at', (now() + interval '10 days')::text,
      'pickup_location', 'Hotel', 'dropoff_location', 'CCH'));
  end loop;
  select count(*) into v_n from shuttle_booking where profile_id = v_profile and status <> 'cancelled';
  insert into t_res values ('05_fuenf_fahrten', case when v_n = 5 then 'ok 5' else 'FEHLER ' || v_n::text end);

  -- 06 · sechste ohne Begründung
  begin
    perform request_shuttle(v_profile, jsonb_build_object(
      'passenger_name', 'ZZ Sechste', 'pickup_at', (now() + interval '10 days')::text,
      'pickup_location', 'Hotel', 'dropoff_location', 'CCH'));
    insert into t_res values ('06_sechste_ohne_grund', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('06_sechste_ohne_grund', 'abgewiesen ' || sqlstate || ' / detail=' || coalesce(v_detail, '-'));
  end;

  -- 07 · sechste mit Begründung
  v_id := (request_shuttle(v_profile, jsonb_build_object(
    'passenger_name', 'ZZ Sechste', 'pickup_at', (now() + interval '10 days')::text,
    'pickup_location', 'Hotel', 'dropoff_location', 'Dinner',
    'over_limit_reason', 'Abendtermin, vom Team zugesagt'))->>'id')::uuid;
  select over_limit_reason into v_txt from shuttle_booking where id = v_id;
  insert into t_res values ('07_sechste_mit_grund',
    case when v_txt is not null then 'ok, Grund gemerkt' else 'FEHLER Grund fehlt' end);

  -- 08 · Speaker gibt nicht selbst frei
  begin
    perform confirm_shuttle(v_id);
    insert into t_res values ('08_speaker_freigabe', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('08_speaker_freigabe', 'abgewiesen ' || sqlstate); end;

  -- 09 · Team gibt frei
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform confirm_shuttle(v_id);
  select * into v_b from shuttle_booking where id = v_id;
  insert into t_res values ('09_team_freigabe',
    case when v_b.status = 'confirmed' and v_b.confirmed_at is not null and v_b.confirmed_by = v_pid
         then 'ok confirmed' else 'FEHLER ' || coalesce(v_b.status, 'null') end);

  -- 10 · zweites Freigeben
  begin
    perform confirm_shuttle(v_id);
    insert into t_res values ('10_zweite_freigabe', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('10_zweite_freigabe', 'abgewiesen ' || sqlstate || ' / detail=' || coalesce(v_detail, '-'));
  end;

  -- 11 · Stornieren nimmt aus der Zählung
  perform cancel_shuttle(v_id);
  select count(*) into v_n from shuttle_booking where profile_id = v_profile and status <> 'cancelled';
  begin
    perform request_shuttle(v_profile, jsonb_build_object(
      'passenger_name', 'ZZ Nach Storno', 'pickup_at', (now() + interval '10 days')::text,
      'pickup_location', 'Hotel', 'dropoff_location', 'CCH'));
    insert into t_res values ('11_nach_storno', 'ok, wieder ohne Grund moeglich (offen: ' || v_n::text || ')');
  exception when others then
    insert into t_res values ('11_nach_storno', 'ABGEWIESEN (BUG) ' || sqlstate);
  end;

  -- 12 · eigene Liste zeigt nur eigene Fahrten
  select count(*) into v_n from my_shuttle_bookings();
  insert into t_res values ('12_eigene_liste',
    case when v_n = (select count(*) from shuttle_booking where profile_id = v_profile)
         then 'ok ' || v_n::text else 'FEHLER ' || v_n::text end);

  -- 13 · Admin-Liste ohne Team-Rolle
  delete from role_assignment where person_id = v_pid;
  begin
    perform count(*) from shuttle_bookings_admin();
    insert into t_res values ('13_adminliste_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('13_adminliste_ohne_rolle', 'abgewiesen ' || sqlstate); end;

  -- 14 · Grants
  insert into t_res values ('14a_trigger_gesperrt',
    case when has_function_privilege('authenticated', 'touch_shuttle_booking()', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
  select count(*) into v_n from information_schema.role_table_grants
   where table_name = 'shuttle_booking' and grantee in ('anon', 'authenticated');
  insert into t_res values ('14b_tabellen_grants', case when v_n = 0 then 'keine' else 'FEHLER ' || v_n::text end);
end $$;
select * from t_res order by step;
rollback;
