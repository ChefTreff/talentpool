-- Smoke-Test zum Vorschlag v6_port3_stage_leads (PORT3, Variante A). Aufbau im
-- Rollback: zwei Test-Bühnen am Summit — A (L ist Stage Lead) und B (fremd) —,
-- je ein Slot morgen mit einer Entwurfs-Session; Speaker SA auf A, SB auf B;
-- LE ist ein eigener Pipeline-Eintrag von L (ohne Session). L und E sind
-- Live-Konten; E hat eine Edition-Zeile `speaker_manager` (Altbestand, vor der
-- CHECK-Regel entstanden — hier im Rollback nachgestellt). T mit
-- programme_team (Team), K mit admin (Vergabe). Geurteilt wird nur über die
-- selbst angelegten Zeilen (Live-Konten können mehr haben).
--
--   01 is_stage_lead_of: L für A ja, für B nein                          (gegen live: Funktion fehlt)
--   02 programme_board als L: der Entwurf auf A mit Inhalt; der Entwurf auf B gar nicht
--      (`slot_read`: fremde Slots nur mit veröffentlichter Session); eine veröffentlichte
--      Session auf B ist sichtbar (Vorbedingung: Entwurf B existiert)
--                                               (gegen live: schon dicht seit 0180 — bleibt als Wächter)
--   03 manager_speakers: L sieht SA und LE, nicht SB; E (Edition-Altbestand) sieht keinen
--                                                                         (gegen live: E sieht alle)
--   04 board_search_people als L: SA und LE, nicht SB                     (gegen live: auch SB)
--   05 speaker_managers: als L ohne E-Mail, als T mit                     (gegen live: L sieht Mails)
--   06 upsert_speaker als L: mit der Adresse von SB → 42501, SB unverändert;
--      mit person_id → 42501; mit der Adresse von LE → ok (eigener Eintrag)
--                                                                         (gegen live: SB überschrieben)
--   07 assign_role als K: speaker_manager mit Edition → 22023 stage_scope_required,
--      mit Bühne → ok (Edition aus der Bühne); direkt eingefügt mit Edition → 23514
--   08 Team-RPCs als L → 42501 (speaker_leads_admin, unassigned_speakers)
--                                               (gegen live: schon gesperrt — bleibt als Wächter)
--   09 my_manager_scope als L: Edition aus der Bühne, „alle“ nein; als E: kein Manager mehr
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_day uuid; v_sa uuid; v_sb uuid; v_sla uuid; v_slb uuid; v_sea uuid; v_seb uuid;
  v_slb2 uuid; v_seb2 uuid;
  v_psa uuid; v_psb uuid; v_ple uuid; v_spa uuid; v_spb uuid; v_sple uuid;
  v_pl uuid; v_ul uuid; v_pe uuid; v_ue uuid; v_pt uuid; v_ut uuid; v_pk uuid; v_uk uuid;
  v_txt text; v_n int; v_m int; v_p int; v_j jsonb; v_titel_vorher text; v_id uuid;
  r1 text; r2 text; r3 text; r4 text; r5 text; r6 text; r7 text; r8 text; r9 text; v_regel boolean;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id into v_day from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ PORT3 A', 'zz-port3-a', 'side', true) returning id into v_sa;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ PORT3 B', 'zz-port3-b', 'side', true) returning id into v_sb;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_sa, v_day, now() + interval '1 day', now() + interval '1 day 30 minutes', 'content', 'open') returning id into v_sla;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_sb, v_day, now() + interval '1 day', now() + interval '1 day 30 minutes', 'content', 'open') returning id into v_slb;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
  values (v_sum, v_sla, 'talk', 'ZZ PORT3 Talk A', 'ZZ PORT3 talk A', 'Beschreibung.', 'de', 'open', 'draft') returning id into v_sea;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
  values (v_sum, v_slb, 'talk', 'ZZ PORT3 Entwurf B', 'ZZ PORT3 draft B', 'Beschreibung.', 'de', 'open', 'draft') returning id into v_seb;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_sb, v_day, now() + interval '1 day 1 hour', now() + interval '1 day 90 minutes', 'content', 'final') returning id into v_slb2;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, language, access_mode, publish_status)
  values (v_sum, v_slb2, 'talk', 'ZZ PORT3 Veröffentlicht B', 'ZZ PORT3 published B', 'Beschreibung.', 'de', 'open', 'published') returning id into v_seb2;

  select p.id, p.auth_user_id into v_pl, v_ul from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pe, v_ue from person p where p.auth_user_id is not null and p.id <> v_pl order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null and p.id not in (v_pl, v_pe) order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id not in (v_pl, v_pe, v_pt) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pl, v_pe, v_pt, v_pk);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pl, 'speaker_manager', 'stage', v_sa, v_ed);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'programme_team', 'edition', v_ed);
  insert into role_assignment (person_id, role, scope_type) values (v_pk, 'admin', 'global');
  -- E: Edition-Zeile als Altbestand. Sie ist vor der Regel entstanden; im Test
  -- wird sie ohne die Regel eingefügt und die Regel danach wieder angelegt —
  -- nur, wenn es sie gab (gegen live fehlt sie, und 07 soll dann scheitern).
  select exists (select 1 from pg_constraint where conname = 'role_assignment_stage_lead_scope_chk') into v_regel;
  if v_regel then execute 'alter table role_assignment drop constraint role_assignment_stage_lead_scope_chk'; end if;
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pe, 'speaker_manager', 'edition', v_ed);
  if v_regel then
    execute $q$alter table role_assignment add constraint role_assignment_stage_lead_scope_chk
             check (role <> 'speaker_manager' or scope_type in ('stage', 'stage_day', 'slot')) not valid$q$;
  end if;

  insert into person (first_name, last_name) values ('Sina', 'ZZPort3 A') returning id into v_psa;
  insert into person (first_name, last_name) values ('Bodo', 'ZZPort3 B') returning id into v_psb;
  insert into person (first_name, last_name) values ('Lena', 'ZZPort3 Eintrag') returning id into v_ple;
  insert into person_email (person_id, email, is_primary) values
    (v_psb, 'zzport3-b@example.org', true), (v_ple, 'zzport3-le@example.org', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at)
  values (v_psa, v_ed, 'panelist', 'confirmed', now()) returning id into v_spa;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, confirmed_at, job_title)
  values (v_psb, v_ed, 'panelist', 'confirmed', now(), 'Vorher') returning id into v_spb;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, created_by)
  values (v_ple, v_ed, 'panelist', 'lead', v_pl) returning id into v_sple;
  insert into session_speaker (session_id, person_id, role, confirmed) values
    (v_sea, v_psa, 'speaker', true), (v_seb, v_psb, 'speaker', true);

  -- Vorbedingung zu 02: der Entwurf auf B existiert (als Superuser gelesen).
  select count(*) into v_n from session se where se.id = v_seb and se.publish_status = 'draft';

  -- ---- L
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select is_stage_lead_of($1)::text || is_stage_lead_of($2)::text' into v_txt using v_sa, v_sb;
    r1 := case when v_txt = 'truefalse' then 'ok' else 'FEHLER ' || v_txt end;
  exception when others then r1 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute $q$select count(*) filter (where b.slot_id = $1 and b.session_id = $3 and b.title_de = 'ZZ PORT3 Talk A'),
                      count(*) filter (where b.slot_id = $2),
                      count(*) filter (where b.slot_id = $4 and b.session_id = $5)
                 from programme_board b where b.slot_id in ($1, $2, $4)$q$
      into v_m, v_txt, v_p using v_sla, v_slb, v_sea, v_slb2, v_seb2;
    r2 := case when v_n <> 1 then 'FEHLER Vorbedingung (Entwurf B fehlt)'
               when v_m = 1 and v_txt = '0' and v_p = 1 then 'ok'
               else 'FEHLER A=' || v_m || ' B-Entwurf=' || v_txt || ' B-veröffentlicht=' || v_p end;
  exception when others then r2 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute 'select count(*) filter (where m.id = $1), count(*) filter (where m.id = $2), count(*) filter (where m.id = $3) from manager_speakers($4) m'
      into v_n, v_m, v_txt using v_spa, v_sple, v_spb, v_ed;
    r3 := case when v_n = 1 and v_m = 1 and v_txt = '0' then 'ok' else 'FEHLER SA=' || v_n || ' LE=' || v_m || ' SB=' || v_txt end;
  exception when others then r3 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute $q$select count(*) filter (where s.id = $1), count(*) filter (where s.id = $2), count(*) filter (where s.id = $3)
                 from board_search_people($4, 'ZZPort3', 25) s$q$
      into v_n, v_m, v_txt using v_psa, v_ple, v_psb, v_sum;
    r4 := case when v_n = 1 and v_m = 1 and v_txt = '0' then 'ok' else 'FEHLER SA=' || v_n || ' LE=' || v_m || ' SB=' || v_txt end;
  exception when others then r4 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute 'select count(*) filter (where m.person_id = $1 and m.email is not null) from speaker_managers() m' into v_n using v_pl;
    r5 := case when v_n = 0 then 'ok' else 'FEHLER L sieht Adressen' end;
  exception when others then r5 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  -- 06: Anlegen über fremde Adresse, über person_id, über den eigenen Eintrag
  begin
    execute $q$select upsert_speaker(jsonb_build_object('edition_id', $1, 'email', 'zzport3-b@example.org',
                                                        'first_name', 'Bodo', 'last_name', 'ZZPort3 B', 'job_title', 'Überschrieben'))$q$ using v_ed;
    r6 := 'FEHLER fremdes Profil überschrieben';
  exception when others then r6 := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  if r6 = 'ok' then
    begin
      execute $q$select upsert_speaker(jsonb_build_object('edition_id', $1, 'person_id', $2, 'job_title', 'Überschrieben'))$q$ using v_ed, v_psb;
      r6 := 'FEHLER person_id angenommen';
    exception when others then r6 := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
    end;
  end if;
  if r6 = 'ok' then
    begin
      execute $q$select upsert_speaker(jsonb_build_object('edition_id', $1, 'email', 'zzport3-le@example.org', 'job_title', 'Eigener Eintrag'))$q$
        into v_id using v_ed;
      r6 := case when v_id = v_sple then 'ok' else 'FEHLER eigener Eintrag: ' || coalesce(v_id::text, 'null') end;
    exception when others then r6 := 'FEHLER eigener Eintrag ' || sqlstate || ' ' || sqlerrm;
    end;
  end if;
  begin
    execute 'select speaker_leads_admin($1)' using v_ed;
    r8 := 'FEHLER speaker_leads_admin offen';
  exception when others then r8 := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  if r8 = 'ok' then
    begin
      execute 'select unassigned_speakers($1)' using v_ed;
      r8 := 'FEHLER unassigned_speakers offen';
    exception when others then r8 := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
    end;
  end if;
  begin
    execute 'select my_manager_scope()' into v_j;
    r9 := case when (v_j->>'all')::boolean is false
                and exists (select 1 from jsonb_array_elements(v_j->'editions') x where x->>'id' = v_ed::text)
               then 'ok' else 'FEHLER ' || coalesce(v_j::text, 'null') end;
  exception when others then r9 := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  -- 06: SB unverändert (als Superuser gelesen)
  select sp.job_title into v_titel_vorher from speaker_profile sp where sp.id = v_spb;
  if r6 = 'ok' and v_titel_vorher is distinct from 'Vorher' then r6 := 'FEHLER SB verändert: ' || coalesce(v_titel_vorher, 'null'); end if;

  -- ---- E (Edition-Altbestand): sieht keine fremden Speaker mehr, ist kein Manager
  perform set_config('request.jwt.claims', json_build_object('sub', v_ue, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from manager_speakers($1) m where m.id in ($2, $3)' into v_n using v_ed, v_spa, v_spb;
    if r3 = 'ok' and v_n <> 0 then r3 := 'FEHLER E sieht ' || v_n || ' fremde'; end if;
    execute 'select my_manager_scope()' into v_j;
    if r9 = 'ok' and ((v_j->>'is_manager')::boolean or (v_j->>'all')::boolean) then r9 := 'FEHLER E noch Manager'; end if;
  exception when others then
    -- `manager_speakers` darf E mit reiner Edition-Zeile auch ganz abweisen.
    if sqlstate <> '42501' then r3 := 'FEHLER E ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  execute 'reset role';

  -- ---- T (Team): Adressen sichtbar
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from speaker_managers() m where m.person_id = $1' into v_n using v_pl;
    execute $q$select count(*) from speaker_managers() m where m.email is not null$q$ into v_m;
    if r5 = 'ok' and not (v_n = 1 and v_m >= 1) then r5 := 'FEHLER Team ohne Adressen'; end if;
  exception when others then r5 := 'FEHLER T ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';

  -- ---- K (admin): Vergabe
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select assign_role($1, 'speaker_manager', 'edition', null, $2)$q$ using v_pt, v_ed;
    r7 := 'FEHLER Edition vergeben';
  exception when others then
    r7 := case when sqlstate = '22023' and sqlerrm = 'stage_scope_required' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  if r7 = 'ok' then
    begin
      execute $q$select assign_role($1, 'speaker_manager', 'stage', $2)$q$ into v_id using v_pt, v_sb;
      r7 := 'ok';
    exception when others then r7 := 'FEHLER Bühne ' || sqlstate || ' ' || sqlerrm;
    end;
  end if;
  execute 'reset role';
  if r7 = 'ok' and not exists (select 1 from role_assignment ra where ra.id = v_id and ra.scope_id = v_sb and ra.edition_id = v_ed) then
    r7 := 'FEHLER Edition nicht aus der Bühne';
  end if;
  if r7 = 'ok' then
    begin
      insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pk, 'speaker_manager', 'edition', v_ed);
      r7 := 'FEHLER CHECK fehlt';
    exception when check_violation then r7 := 'ok';
    end;
  end if;

  insert into t_res values
    ('01_stage_lead_der_eigenen_buehne', r1), ('02_keine_fremden_entwuerfe', r2),
    ('03_speaker_nur_eigene_buehne', r3), ('04_suche_nur_eigene_buehne', r4),
    ('05_lead_adressen_nur_fuers_team', r5), ('06_anlegen_ueberschreibt_nichts', r6),
    ('07_vergabe_nur_fuer_buehnen', r7), ('08_team_rpcs_gesperrt', r8), ('09_scope_aus_den_buehnen', r9);
end $$;
select * from t_res order by step;
rollback;
