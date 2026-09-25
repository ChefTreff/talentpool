-- Smoke-Test zum Vorschlag v6_lead039_verlauf (LEAD-039 Schnitt 2, LEAD-025/027).
-- Mit echtem **Rollenwechsel** (`set local role authenticated`). Aufbau im
-- Rollback: Test-Bühne am Summit mit Slot und Session, auf der P spricht; ein
-- Lead-Profil für P, Owner ist L.
--
--   L  Speaker-Lead, Owner (speaker_manager nur an einer fremden Test-Bühne)
--      01 legt eine Notiz an — Autor L, Zeitpunkt jetzt
--      02 legt eine Aufgabe mit Frist an (Zuständige Standard: L); manager_speakers
--         zeigt open_tasks 1, next_task mit Text und last_activity_at der Notiz
--      03 Aufgabe ohne Frist → 22023 due_required; leerer Text → body_required;
--         unbekannte Art → invalid_activity_kind; über 2000 Zeichen → text_too_long
--      04 Zuständige ohne Rolle (X) → 22023 invalid_assignee
--   S  Stage Lead der Bühne mit P's Session (K-36 F1)
--      05 liest beide Einträge (RLS und speaker_activities, mit Autor), schreibt
--         eine eigene Notiz
--      06 darf L's Notiz weder ändern noch löschen und L's Aufgabe nicht abhaken (42501)
--   L  07 hakt die Aufgabe ab: done_at gesetzt, open_tasks 0, last_activity_at = done_at;
--         `not_a_task` beim Abhaken einer Notiz
--   X  08 ohne Rolle: nichts lesen, nichts schreiben (42501, keine Zeile unter RLS)
--   P  09 der Speaker selbst liest keinen Eintrag; my_speaker_profile ohne Verlauf
--   T  10 Team der Edition löscht S's Notiz und sieht die Übersicht; S bekommt
--         die Übersicht nicht (42501)
--      11 anonymize_person löscht den Verlauf des Profils
--      12 Rechte: EXECUTE für authenticated auf den neuen Wegen, die internen
--         Helfer nicht; kein Schreibrecht auf die Tabelle; manager_speakers behält
--         internal_notes und stage_candidates
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_day uuid; v_tag date; v_s uuid; v_s_fremd uuid; v_sl uuid; v_se uuid; v_sp uuid;
  v_pl uuid; v_ul uuid; v_ps uuid; v_us uuid; v_px uuid; v_ux uuid; v_pp uuid; v_up uuid; v_pt uuid; v_ut uuid;
  v_note uuid; v_task uuid; v_snote uuid; v_n int; v_r record; v_txt text; v_j jsonb; b1 boolean; b2 boolean; b3 boolean;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id, d.day_date into v_day, v_tag from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  select p.id, p.auth_user_id into v_pp, v_up from person p
   where p.auth_user_id is not null
     and not exists (select 1 from speaker_profile sp where sp.person_id = p.id and sp.edition_id = v_ed)
   order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pl, v_ul from person p where p.auth_user_id is not null and p.id <> v_pp order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_ps, v_us from person p where p.auth_user_id is not null and p.id not in (v_pp, v_pl) order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_px, v_ux from person p where p.auth_user_id is not null and p.id not in (v_pp, v_pl, v_ps) order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pt, v_ut from person p where p.auth_user_id is not null and p.id not in (v_pp, v_pl, v_ps, v_px) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pl, v_ps, v_px, v_pp, v_pt);

  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test Verlauf', 'zz-test-verlauf', 'side', true) returning id into v_s;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test Verlauf fremd', 'zz-test-verlauf-fremd', 'side', true) returning id into v_s_fremd;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s, v_day, v_tag + time '15:00', v_tag + time '15:30', 'content', 'open') returning id into v_sl;
  insert into session (event_id, slot_id, format, title_de, language, access_mode, publish_status)
  values (v_sum, v_sl, 'talk', 'ZZ Test Verlauf Talk', 'de', 'open', 'draft') returning id into v_se;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_se, v_pp, 'speaker', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, internal_notes)
  values (v_pp, v_ed, 'panelist', 'lead', v_pl, 'ZZ interne Notiz') returning id into v_sp;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pl, 'speaker_manager', 'stage', v_s_fremd, v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_ps, 'speaker_manager', 'stage', v_s, v_ed);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'programme_team', 'edition', v_ed);

  -- ---- L: Owner
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v_note := add_speaker_activity(v_sp, '{"kind": "call", "body": "ZZ Anruf: Interesse an Keynote"}'::jsonb);
    select a.kind, a.author_person_id, a.occurred_at into v_r from speaker_activity a where a.id = v_note;
    v_txt := case when v_r.kind = 'call' and v_r.author_person_id = v_pl and v_r.occurred_at > now() - interval '1 minute'
                  then 'ok' else 'FEHLER ' || coalesce(v_r::text, 'keine Zeile') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('01_L_notiz', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v_task := add_speaker_activity(v_sp, jsonb_build_object('kind', 'task', 'body', 'ZZ Nachfassen', 'due_on', (current_date + 3)::text));
    select m.open_tasks, m.next_task, m.last_activity_at into v_r from manager_speakers(v_ed) m where m.id = v_sp;
    v_txt := case when v_r.open_tasks = 1 and v_r.next_task->>'body' = 'ZZ Nachfassen'
                    and (v_r.next_task->>'assignee_person_id')::uuid = v_pl
                    and v_r.last_activity_at = (select a.occurred_at from speaker_activity a where a.id = v_note)
                  then 'ok' else 'FEHLER ' || coalesce(v_r::text, 'keine Zeile') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('02_L_aufgabe', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_txt := '';
  begin
    perform add_speaker_activity(v_sp, '{"kind": "task", "body": "ohne Frist"}'::jsonb);
    v_txt := v_txt || ' ohneFrist=ERLAUBT';
  exception when others then v_txt := v_txt || case when sqlerrm = 'due_required' then '' else ' ohneFrist=' || sqlerrm end;
  end;
  begin
    perform add_speaker_activity(v_sp, '{"kind": "note", "body": "   "}'::jsonb);
    v_txt := v_txt || ' leer=ERLAUBT';
  exception when others then v_txt := v_txt || case when sqlerrm = 'body_required' then '' else ' leer=' || sqlerrm end;
  end;
  begin
    perform add_speaker_activity(v_sp, '{"kind": "fax", "body": "x"}'::jsonb);
    v_txt := v_txt || ' art=ERLAUBT';
  exception when others then v_txt := v_txt || case when sqlerrm = 'invalid_activity_kind' then '' else ' art=' || sqlerrm end;
  end;
  begin
    perform add_speaker_activity(v_sp, jsonb_build_object('kind', 'note', 'body', repeat('x', 2001)));
    v_txt := v_txt || ' lang=ERLAUBT';
  exception when others then v_txt := v_txt || case when sqlerrm = 'text_too_long' then '' else ' lang=' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('03_L_pruefungen', case when v_txt = '' then 'ok' else 'FEHLER' || v_txt end);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform add_speaker_activity(v_sp, jsonb_build_object('kind', 'task', 'body', 'für X', 'due_on', current_date::text, 'assignee_person_id', v_px));
    v_txt := 'ERLAUBT (BUG)';
  exception when others then
    v_txt := case when sqlstate = '22023' and sqlerrm = 'invalid_assignee' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('04_L_zustaendige_ohne_rolle', v_txt);

  -- ---- S: Stage Lead der Bühne
  perform set_config('request.jwt.claims', json_build_object('sub', v_us, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into v_n from speaker_activity a where a.profile_id = v_sp;
    select string_agg(x.author_name, ',') into v_txt from speaker_activities(v_sp) x;
    v_snote := add_speaker_activity(v_sp, '{"kind": "note", "body": "ZZ Stage Lead: passt zur Bühne"}'::jsonb);
    v_txt := case when v_n = 2 and v_txt is not null and v_snote is not null then 'ok' else 'FEHLER n=' || v_n || ' autoren=' || coalesce(v_txt, 'null') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('05_S_liest_und_schreibt', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_us, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b1 := false; b2 := false; b3 := false;
  begin perform update_speaker_activity(v_note, '{"body": "geändert"}'::jsonb);
  exception when others then b1 := sqlstate = '42501'; end;
  begin perform delete_speaker_activity(v_note);
  exception when others then b2 := sqlstate = '42501'; end;
  begin perform set_speaker_activity_done(v_task, true);
  exception when others then b3 := sqlstate = '42501'; end;
  execute 'reset role';
  insert into t_res values ('06_S_fremde_eintraege', case when b1 and b2 and b3 then 'ok' else 'FEHLER ändern=' || b1 || ' löschen=' || b2 || ' abhaken=' || b3 end);

  -- ---- L hakt ab
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform set_speaker_activity_done(v_task, true);
    select m.open_tasks, m.last_activity_at into v_r from manager_speakers(v_ed) m where m.id = v_sp;
    b1 := v_r.open_tasks = 0 and v_r.last_activity_at = (select a.done_at from speaker_activity a where a.id = v_task);
    begin
      perform set_speaker_activity_done(v_note, true);
      b2 := false;
    exception when others then b2 := sqlerrm = 'not_a_task';
    end;
    v_txt := case when b1 and b2 then 'ok' else 'FEHLER abgehakt=' || coalesce(b1::text, 'null') || ' notiz=' || b2 end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('07_L_abhaken', v_txt);

  -- ---- X ohne Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b1 := false; b2 := false;
  begin perform add_speaker_activity(v_sp, '{"kind": "note", "body": "x"}'::jsonb);
  exception when others then b1 := sqlstate = '42501'; end;
  begin perform count(*) from speaker_activities(v_sp);
  exception when others then b2 := sqlstate = '42501'; end;
  select count(*) into v_n from speaker_activity a where a.profile_id = v_sp;
  execute 'reset role';
  insert into t_res values ('08_X_nichts', case when b1 and b2 and v_n = 0 then 'ok' else 'FEHLER add=' || b1 || ' lesen=' || b2 || ' n=' || v_n end);

  -- ---- P der Speaker selbst
  perform set_config('request.jwt.claims', json_build_object('sub', v_up, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into v_n from speaker_activity a where a.profile_id = v_sp;
    v_j := my_speaker_profile(v_ed);
    v_txt := case when v_n = 0 and v_j is not null and not (v_j ? 'activities') and position('ZZ Anruf' in v_j::text) = 0
                  then 'ok' else 'FEHLER n=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('09_P_sieht_nichts', v_txt);

  -- ---- T Team der Edition; S und die Übersicht
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform delete_speaker_activity(v_snote);
    select count(*) into v_n from speaker_activity_overview(v_ed) o where o.profile_id = v_sp;
    v_txt := case when v_n = 2 then 'ok' else 'FEHLER übersicht=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_us, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform count(*) from speaker_activity_overview(v_ed);
    v_txt := v_txt || ' S=ERLAUBT (BUG)';
  exception when others then
    if sqlstate <> '42501' then v_txt := v_txt || ' S=' || sqlstate; end if;
  end;
  execute 'reset role';
  insert into t_res values ('10_T_team', v_txt);

  -- ---- Profil löschen
  begin
    perform anonymize_person(v_pp);
    select count(*) into v_n from speaker_activity a where a.profile_id = v_sp;
    v_txt := case when v_n = 0 then 'ok' else 'FEHLER n=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into t_res values ('11_anonymisiert', v_txt);

  -- ---- Rechte
  insert into t_res values ('12_rechte',
    case when to_regprocedure('add_speaker_activity(uuid, jsonb)') is null then 'FEHLER fehlt'
         when has_function_privilege('authenticated', 'add_speaker_activity(uuid, jsonb)', 'execute')
          and has_function_privilege('authenticated', 'update_speaker_activity(uuid, jsonb)', 'execute')
          and has_function_privilege('authenticated', 'set_speaker_activity_done(uuid, boolean)', 'execute')
          and has_function_privilege('authenticated', 'delete_speaker_activity(uuid)', 'execute')
          and has_function_privilege('authenticated', 'speaker_activities(uuid)', 'execute')
          and has_function_privilege('authenticated', 'speaker_activity_overview(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'speaker_activity_assignee_ok(uuid, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'speaker_activity_edit_right(uuid)', 'execute')
          and not has_function_privilege('anon', 'add_speaker_activity(uuid, jsonb)', 'execute')
          and has_table_privilege('authenticated', 'speaker_activity', 'select')
          and not has_table_privilege('authenticated', 'speaker_activity', 'insert')
          and not has_table_privilege('authenticated', 'speaker_activity', 'update')
          and not has_table_privilege('anon', 'speaker_activity', 'select')
          and pg_get_function_result('manager_speakers(uuid)'::regprocedure) like '%internal_notes text%'
          and pg_get_function_result('manager_speakers(uuid)'::regprocedure) like '%stage_candidates jsonb%'
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
