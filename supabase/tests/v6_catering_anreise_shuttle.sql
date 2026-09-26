-- Smoke-Test zum Vorschlag v6_catering_anreise_shuttle (SPK-073 + SPK-069). Aufbau
-- im Rollback: drei bestätigte Speaker in FLS27 — A regulär, G Gast der
-- Standbühne (stage_guest, vom Partner angelegt), P Speaker am Talk eines
-- Partners (vom Partner angelegt, kein Gast). A hat vier Shuttle-Fahrten (zwei
-- angefragt, eine bestätigt, eine storniert) und eine Anreise mit Zugnummer.
-- T ist Admin (Catering und Anreise sind Team-Sichten), K hat nur
-- marketing_team. Geurteilt wird nur über die selbst angelegten Zeilen.
--
--   01 catering_people: A und P drin, G nicht                               (gegen live: G drin)
--   02 catering_summary als T: G zählt erst mit, wenn er kein Gast mehr ist  (gegen live: zählt immer)
--   03 speaker_travel_list als T: A mit 2 angefragt / 1 bestätigt, die Zugnummer (Spalte
--      außerhalb der Änderung) bleibt; P mit 0 / 0                          (gegen live: Spalten fehlen)
--   04 speaker_detail als T: A mit shuttle 2 / 1, P mit 0 / 0               (gegen live: shuttle fehlt)
--   05 Rechte nach drop + create: authenticated darf speaker_travel_list ausführen, anon
--      nicht, K bekommt 42501; catering_people bleibt ohne EXECUTE für authenticated
--                                                       (gegen live: schon so — Wächter)
--   06 Lounge: G mit lounge_access = true → 23514 (CHECK aus 0188)          (gegen live: schon so — Wächter)
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_org uuid;
  v_pa uuid; v_pg uuid; v_pp uuid; v_spa uuid; v_spg uuid; v_spp uuid;
  v_pt uuid; v_ut uuid; v_pk uuid; v_uk uuid;
  v_a int; v_g int; v_p int; v_s0 int; v_s1 int;
  v_req int; v_conf int; v_preq int; v_pconf int; v_ref text;
  v_j jsonb; v_jp jsonb; v_txt text; v_state text;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select o.id into v_org from organization o order by o.created_at limit 1;
  insert into person (first_name, last_name, preferred_language) values ('Anna', 'ZZCatering Speaker', 'de') returning id into v_pa;
  insert into person (first_name, last_name, preferred_language) values ('Gero', 'ZZCatering Gast', 'de') returning id into v_pg;
  insert into person (first_name, last_name, preferred_language) values ('Pia', 'ZZCatering Talk', 'de') returning id into v_pp;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pa, v_ed, 'panelist', 'confirmed', now()) returning id into v_spa;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, stage_guest,
                               stage_guest_consent_at, created_by_org_id, lounge_access, reception_eligible,
                               travel_costs_covered, hospitality_status)
  values (v_pg, v_ed, 'panelist', 'confirmed', now(), true, now(), v_org, false, false, false, 'none') returning id into v_spg;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, created_by_org_id)
  values (v_pp, v_ed, 'panelist', 'confirmed', now(), v_org) returning id into v_spp;

  insert into speaker_travel (profile_id, arrival_ref) values (v_spa, 'ZZ ICE 1234');
  insert into shuttle_booking (profile_id, passenger_name, pickup_at, pickup_location, dropoff_location,
                               status, confirmed_at, cancelled_at) values
    (v_spa, 'Anna ZZCatering', now() + interval '2 days', 'ZZ Hbf', 'ZZ Messe', 'requested', null, null),
    (v_spa, 'Anna ZZCatering', now() + interval '2 days 2 hours', 'ZZ Messe', 'ZZ Hotel', 'requested', null, null),
    (v_spa, 'Anna ZZCatering', now() + interval '3 days', 'ZZ Hotel', 'ZZ Messe', 'confirmed', now(), null),
    (v_spa, 'Anna ZZCatering', now() + interval '3 days 5 hours', 'ZZ Messe', 'ZZ Flughafen', 'cancelled', null, now());

  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_pk);
  insert into role_assignment (person_id, role, scope_type) values (v_pt, 'admin', 'global');
  insert into role_assignment (person_id, role, scope_type) values (v_pk, 'marketing_team', 'global');

  -- ---- 01 Catering-Personen (ohne Rollenwechsel: EXECUTE haben nur die Definer-Funktionen)
  select count(*) filter (where c.person_id = v_pa), count(*) filter (where c.person_id = v_pg),
         count(*) filter (where c.person_id = v_pp)
    into v_a, v_g, v_p from catering_people(v_ed) c;
  insert into t_res values ('01_catering_ohne_gaeste',
    case when v_a = 1 and v_p = 1 and v_g = 0 then 'ok'
         else 'FEHLER speaker=' || v_a || ' talk=' || v_p || ' gast=' || v_g end);

  -- ---- 02 Catering-Zählung als T: einmal mit G als Gast, einmal ohne
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select coalesce(sum(s.anzahl), 0) into v_s0 from catering_summary(v_ed) s where s.audience = 'speaker';
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  update speaker_profile set stage_guest = false, stage_guest_consent_at = null where id = v_spg;
  execute 'set local role authenticated';
  begin
    select coalesce(sum(s.anzahl), 0) into v_s1 from catering_summary(v_ed) s where s.audience = 'speaker';
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  update speaker_profile set stage_guest = true, stage_guest_consent_at = now() where id = v_spg;
  insert into t_res values ('02_zaehlung_ohne_gaeste',
    coalesce(v_txt, case when v_s1 = v_s0 + 1 then 'ok'
                         else 'FEHLER mit_gast=' || v_s0 || ' ohne_gast=' || v_s1 end));

  -- ---- 03 Anreise als T (dynamisch: gegen live fehlen die Spalten)
  v_txt := null;
  execute 'set local role authenticated';
  begin
    execute $q$select l.shuttle_requested, l.shuttle_confirmed, l.arrival_ref
                 from speaker_travel_list($1) l where l.profile_id = $2$q$
      into v_req, v_conf, v_ref using v_ed, v_spa;
    execute $q$select l.shuttle_requested, l.shuttle_confirmed
                 from speaker_travel_list($1) l where l.profile_id = $2$q$
      into v_preq, v_pconf using v_ed, v_spp;
    v_txt := case when v_req = 2 and v_conf = 1 and v_ref = 'ZZ ICE 1234' and v_preq = 0 and v_pconf = 0 then 'ok'
                  else 'FEHLER A=' || coalesce(v_req::text, '?') || '/' || coalesce(v_conf::text, '?')
                       || ' ref=' || coalesce(v_ref, '?')
                       || ' P=' || coalesce(v_preq::text, '?') || '/' || coalesce(v_pconf::text, '?') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('03_anreise_mit_shuttle', v_txt);

  -- ---- 04 Speaker-Detail als T
  execute 'set local role authenticated';
  begin
    v_j := speaker_detail(v_spa)->'shuttle';
    v_jp := speaker_detail(v_spp)->'shuttle';
    v_txt := case when (v_j->>'requested')::int = 2 and (v_j->>'confirmed')::int = 1
                       and (v_jp->>'requested')::int = 0 and (v_jp->>'confirmed')::int = 0 then 'ok'
                  else 'FEHLER A=' || coalesce(v_j::text, 'fehlt') || ' P=' || coalesce(v_jp::text, 'fehlt') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('04_detail_mit_shuttle', v_txt);

  -- ---- 05 Rechte: Grants nach drop + create, K ohne Team-Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform 1 from speaker_travel_list(v_ed);
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('05_rechte_unveraendert',
    case when has_function_privilege('authenticated', 'speaker_travel_list(uuid)', 'execute')
              and not has_function_privilege('anon', 'speaker_travel_list(uuid)', 'execute')
              and not has_function_privilege('authenticated', 'catering_people(uuid)', 'execute')
              and v_state = '42501' then 'ok'
         else 'FEHLER authenticated=' || has_function_privilege('authenticated', 'speaker_travel_list(uuid)', 'execute')
              || ' anon=' || has_function_privilege('anon', 'speaker_travel_list(uuid)', 'execute')
              || ' catering_people=' || has_function_privilege('authenticated', 'catering_people(uuid)', 'execute')
              || ' K=' || v_state end);

  -- ---- 06 Lounge: für Gäste gesperrt (Vorbedingung: G ist wieder Gast)
  begin
    if not (select sp.stage_guest from speaker_profile sp where sp.id = v_spg) then
      raise exception 'Vorbedingung: G ist kein Gast';
    end if;
    update speaker_profile set lounge_access = true where id = v_spg;
    v_state := 'kein Fehler';
  exception when others then v_state := sqlstate || ' ' || sqlerrm;
  end;
  insert into t_res values ('06_lounge_nie_fuer_gaeste',
    case when v_state like '23514 %' then 'ok' else 'FEHLER ' || v_state end);
end $$;
select * from t_res order by step;
rollback;
