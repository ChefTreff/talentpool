-- Smoke-Test zum Vorschlag v6_speaker_profilwahl (SPK-071). Aufbau im Rollback:
-- T (ein Konto) mit eigenem Speaker-Profil O der Edition und als Kontakt mit
-- Zugang für X und Y — wie ein Operations-Kontakt, der Speaker verwaltet. Z ist
-- ein fremdes Profil. X hat eine Session.
--
--   01 my_speaker_profiles: O, X, Y — eigenes zuerst, gewählt ist O  (gegen live: Funktion fehlt)
--   02 set_my_speaker_profile(X): my_speaker_profile_id und my_speaker_profile zeigen X,
--      nur X ist gewählt
--   03 my_sessions: nur die Session von X                          (gegen live: auch die von O)
--   04 update_my_speaker_profile ohne id schreibt X, nicht O        (gegen live: schreibt O)
--   05 set_my_speaker_profile(Z) → 42501, auf ein unbekanntes Profil → P0002
--   06 Zugang zu X entzogen: die Wahl zeigt noch auf X, gilt aber nicht mehr — es gilt
--      wieder O                                                    (gegen live: Tabelle fehlt)
--   07 die Tabelle der Wahl ist für Angemeldete nicht lesbar
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_day uuid; v_s uuid; v_sl uuid; v_se uuid;
  v_pt uuid; v_ut uuid; v_px uuid; v_py uuid; v_pz uuid;
  v_so uuid; v_sx uuid; v_sy uuid; v_sz uuid; v_cx uuid;
  v_txt text; v_n int; v_j jsonb; r1 text; r2 text; r3 text; r4 text; r5 text;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id into v_day from event_day d where d.event_id = v_sum order by d.day_date limit 1;

  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null order by p.created_at limit 1;
  -- T braucht ein eigenes Profil in der Edition — vorhandenes nehmen, sonst anlegen.
  select sp.id into v_so from speaker_profile sp where sp.person_id = v_pt and sp.edition_id = v_ed;
  if v_so is null then
    insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
    values (v_pt, v_ed, 'keynote', 'confirmed', now()) returning id into v_so;
  end if;
  -- Eine alte Wahl von T räumen; gegen live gibt es die Tabelle noch nicht.
  begin
    execute 'delete from speaker_portal_selection where person_id = $1' using v_pt;
  exception when undefined_table then null;
  end;

  insert into person (first_name, last_name, preferred_language) values ('Xaver', 'ZZWahl X', 'de') returning id into v_px;
  insert into person (first_name, last_name, preferred_language) values ('Yvonne', 'ZZWahl Y', 'de') returning id into v_py;
  insert into person (first_name, last_name, preferred_language) values ('Zora', 'ZZWahl Z', 'de') returning id into v_pz;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_px, v_ed, 'panelist', 'confirmed', now()) returning id into v_sx;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_py, v_ed, 'panelist', 'confirmed', now()) returning id into v_sy;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_pz, v_ed, 'panelist', 'confirmed', now()) returning id into v_sz;
  -- Zugang verlangt Person und Adresse (`speaker_contact_access_chk`).
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_sx, 'assistant', v_pt, 'T', 'Kontakt', 'zzwahl-t@example.org', true, current_date) returning id into v_cx;
  insert into speaker_contact (profile_id, kind, person_id, first_name, last_name, email, has_access, consent_at)
  values (v_sy, 'assistant', v_pt, 'T', 'Kontakt', 'zzwahl-t@example.org', true, current_date);

  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test Wahl', 'zz-test-wahl', 'side', true) returning id into v_s;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s, v_day, now() + interval '1 day', now() + interval '1 day 30 minutes', 'content', 'final') returning id into v_sl;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
  values (v_sum, v_sl, 'talk', 'ZZ Test Wahl-Talk', 'ZZ Test choice talk', 'Beschreibung.', 'de', 'open', 'draft') returning id into v_se;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_se, v_px, 'speaker', true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- ---- 01 Liste
  begin
    execute $q$select string_agg(case when p.own then 'O' when p.profile_id = $1 then 'X' when p.profile_id = $2 then 'Y' else '?' end
                                 || case when p.selected then '*' else '' end, ',' order by p.own desc)
                 from my_speaker_profiles() p where p.edition_id = $3$q$
      into v_txt using v_sx, v_sy, v_ed;
    -- O zuerst und gewählt; X und Y folgen (nach Name).
    v_txt := case when v_txt = 'O*,X,Y' then 'ok' else 'FEHLER ' || coalesce(v_txt, 'leer') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  r1 := v_txt;

  -- ---- 02 Wahl merken
  begin
    execute 'select set_my_speaker_profile($1)' using v_sx;
    execute 'select my_speaker_profile_id()' into v_txt;
    execute 'select my_speaker_profile()' into v_j;
    execute 'select count(*) from my_speaker_profiles() p where p.selected' into v_n;
    v_txt := case when v_txt = v_sx::text and v_j->>'id' = v_sx::text and v_n = 1 then 'ok'
                  else 'FEHLER id=' || coalesce(v_txt, 'null') || ' profil=' || coalesce(v_j->>'id', 'null') || ' gewählt=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  r2 := v_txt;

  -- ---- 03 Sessions der gewählten Person
  begin
    execute 'select count(*) filter (where s.session_id = $1), count(*) from my_sessions() s' into v_n, v_txt using v_se;
    v_txt := case when v_n = 1 and v_txt = '1' then 'ok' else 'FEHLER x=' || v_n || ' alle=' || v_txt end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  r3 := v_txt;

  -- ---- 04 Schreiben ohne id trifft die Wahl
  begin
    execute $q$select update_my_speaker_profile(jsonb_build_object('bio_short_de', 'ZZ Wahl-Bio'))$q$ into v_txt;
    v_txt := case when v_txt = v_sx::text then 'ok' else 'FEHLER schrieb ' || coalesce(v_txt, 'null') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  r4 := v_txt;

  -- ---- 05 fremd und unbekannt
  begin
    execute 'select set_my_speaker_profile($1)' using v_sz;
    v_txt := 'FEHLER fremdes Profil gewählt';
  exception when others then v_txt := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  if v_txt = 'ok' then
    begin
      execute 'select set_my_speaker_profile($1)' using gen_random_uuid();
      v_txt := 'FEHLER unbekanntes Profil gewählt';
    exception when others then v_txt := case when sqlstate = 'P0002' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
    end;
  end if;
  r5 := v_txt;
  execute 'reset role';
  insert into t_res values ('01_liste_eigenes_zuerst', r1), ('02_wahl_gilt', r2), ('03_sessions_der_wahl', r3),
                           ('04_schreiben_trifft_die_wahl', r4), ('05_fremd_und_unbekannt', r5);

  -- ---- 06 Recht entzogen: die Wahl gilt nicht mehr. Vorbedingung: sie zeigt
  -- noch auf X — sonst wäre „es gilt das eigene“ auch ohne Wahl wahr.
  update speaker_contact set has_access = false where id = v_cx;
  begin
    execute 'select profile_id::text from speaker_portal_selection where person_id = $1' into v_txt using v_pt;
    r1 := case when v_txt = v_sx::text then 'ok' else 'FEHLER Wahl zeigt auf ' || coalesce(v_txt, 'nichts') end;
  exception when others then r1 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if r1 = 'ok' then
    begin
      execute 'select my_speaker_profile_id()' into v_txt;
      r1 := case when v_txt = v_so::text then 'ok' else 'FEHLER ' || coalesce(v_txt, 'null') end;
    exception when others then r1 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
    end;
  end if;

  -- ---- 07 die Tabelle selbst
  begin
    execute 'select count(*) from speaker_portal_selection' into v_n;
    v_txt := 'FEHLER lesbar (' || v_n || ')';
  exception when others then v_txt := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('06_ohne_recht_gilt_wieder_das_eigene', r1), ('07_tabelle_nicht_lesbar', v_txt);
end $$;
select * from t_res order by step;
rollback;
