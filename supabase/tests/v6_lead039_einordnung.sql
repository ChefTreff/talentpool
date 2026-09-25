-- Smoke-Test zum Vorschlag v6_lead039_einordnung (LEAD-039 Schnitt 1). Mit echtem
-- **Rollenwechsel** (`set local role authenticated`) für Tabellen und RPCs — als
-- Superuser griffe RLS nicht, und ein grüner Test belegte nichts. Aufbau im
-- Rollback: eine Test-Bühne am Summit mit Slot und Session, ein Lead-Profil für
-- die Person P, Owner ist L.
--
--   L  Speaker-Lead, Owner des Profils (`speaker_manager` nur mit Scope auf eine
--      fremde Test-Bühne — sieht P also allein als Owner)
--      01 schreibt die sieben Felder über `update_speaker` und liest sie zurück
--      02 setzt die Bühnen in Frage und liest die Zeile unter RLS
--      03 Unbekannte Kategorie → 22023 `invalid_category`
--      04 `@` in „Kontakt via“ → 22023 `contact_details_not_allowed`
--      05 Thema/Rolle über 300 Zeichen → 22023 `text_too_long`
--      06 Bühne ausserhalb der Edition → P0001 `stage_not_in_edition`
--      07 `manager_speakers` gibt die Felder und `stage_candidates` aus — und
--         weiter `internal_notes` (Spalte, die diese Migration nicht betrifft)
--   S  Stage Lead der Bühne, auf der P eine Session hat (K-36 F1)
--      08 ändert die Prio und liest die Bühnen in Frage
--   X  ohne Rolle
--      09 darf nichts schreiben (42501) und liest keine Bühne in Frage
--   P  der Speaker selbst
--      10 liest weder Profilzeile noch Bühnen in Frage; `my_speaker_profile`
--         enthält keines der neuen Felder
--      11 Ein stillgelegter Begriff sperrt das Profil nicht: nach dem Stilllegen
--         der Kategorie speichert L eine andere Änderung
--      12 `anonymize_person` leert die Felder und löscht die Bühnen in Frage
--      13 Rechte: EXECUTE für authenticated, nicht für anon; kein Schreibrecht
--         auf `speaker_stage_candidate`
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_day uuid; v_tag date; v_s uuid; v_s_fremd uuid; v_sl uuid; v_se uuid; v_sp uuid;
  v_pl uuid; v_ul uuid; v_ps uuid; v_us uuid; v_px uuid; v_ux uuid; v_pp uuid; v_up uuid;
  v_n int; v_r record; v_err text; v_txt text; v_j jsonb; b1 boolean; b2 boolean;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id, d.day_date into v_day, v_tag from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  -- Vier Personen mit Konto; P hat für FLS27 noch kein Profil.
  select p.id, p.auth_user_id into v_pp, v_up from person p
   where p.auth_user_id is not null
     and not exists (select 1 from speaker_profile sp where sp.person_id = p.id and sp.edition_id = v_ed)
   order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pl, v_ul from person p where p.auth_user_id is not null and p.id <> v_pp order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_ps, v_us from person p where p.auth_user_id is not null and p.id not in (v_pp, v_pl) order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_px, v_ux from person p where p.auth_user_id is not null and p.id not in (v_pp, v_pl, v_ps) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pl, v_ps, v_px, v_pp);

  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test L39 Bühne', 'zz-test-l39', 'side', true) returning id into v_s;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test L39 fremd', 'zz-test-l39-fremd', 'side', true) returning id into v_s_fremd;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s, v_day, v_tag + time '15:00', v_tag + time '15:30', 'content', 'open') returning id into v_sl;
  insert into session (event_id, slot_id, format, title_de, language, access_mode, publish_status)
  values (v_sum, v_sl, 'talk', 'ZZ Test L39 Talk', 'de', 'open', 'draft') returning id into v_se;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_se, v_pp, 'speaker', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, internal_notes)
  values (v_pp, v_ed, 'panelist', 'lead', v_pl, 'ZZ interne Notiz') returning id into v_sp;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pl, 'speaker_manager', 'stage', v_s_fremd);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_ps, 'speaker_manager', 'stage', v_s);

  -- ---- L: Owner
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform update_speaker(v_sp, jsonb_build_object(
      'category', 'politics', 'topic_cluster', 'politics_society', 'topic_role', 'Stimme der jungen Wirtschaft',
      'priority', 'a', 'recommended_format', 'keynote', 'contact_via', 'über Konrad', 'outreach_channel', 'linkedin'));
    select sp.category, sp.topic_cluster, sp.topic_role, sp.priority, sp.recommended_format, sp.contact_via, sp.outreach_channel
      into v_r from speaker_profile sp where sp.id = v_sp;
    v_txt := case when v_r.category = 'politics' and v_r.topic_cluster = 'politics_society'
                    and v_r.topic_role = 'Stimme der jungen Wirtschaft' and v_r.priority = 'a'
                    and v_r.recommended_format = 'keynote' and v_r.contact_via = 'über Konrad'
                    and v_r.outreach_channel = 'linkedin' then 'ok' else 'FEHLER ' || coalesce(v_r::text, 'keine Zeile') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('01_L_felder', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v_n := set_speaker_stage_candidates(v_sp, array[v_s, v_s]);
    select count(*) into v_n from speaker_stage_candidate c where c.profile_id = v_sp and c.stage_id = v_s;
    v_txt := case when v_n = 1 then 'ok' else 'FEHLER n=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('02_L_buehnen_in_frage', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform update_speaker(v_sp, '{"category": "quatsch"}'::jsonb);
    v_txt := 'ERLAUBT (BUG)';
  exception when others then
    v_txt := case when sqlstate = '22023' and sqlerrm = 'invalid_category' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('03_L_kategorie_unbekannt', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform update_speaker(v_sp, '{"contact_via": "Office, max@beispiel.de"}'::jsonb);
    v_txt := 'ERLAUBT (BUG)';
  exception when others then
    v_txt := case when sqlstate = '22023' and sqlerrm = 'contact_details_not_allowed' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('04_L_kontakt_ohne_adresse', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform update_speaker(v_sp, jsonb_build_object('topic_role', repeat('x', 301)));
    v_txt := 'ERLAUBT (BUG)';
  exception when others then
    v_txt := case when sqlstate = '22023' and sqlerrm = 'text_too_long' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('05_L_text_zu_lang', v_txt);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform set_speaker_stage_candidates(v_sp, array[v_s, gen_random_uuid()]);
    v_txt := 'ERLAUBT (BUG)';
  exception when others then
    v_txt := case when sqlstate = 'P0001' and sqlerrm = 'stage_not_in_edition' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  -- Die gültige Bühne aus 02 bleibt: die Ablehnung schreibt nichts.
  select count(*) into v_n from speaker_stage_candidate c where c.profile_id = v_sp;
  insert into t_res values ('06_L_fremde_buehne', case when v_txt = 'ok' and v_n = 1 then 'ok' else v_txt || ' n=' || v_n end);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select m.priority, m.category, m.internal_notes, m.stage_candidates into v_r
      from manager_speakers(v_ed) m where m.id = v_sp;
    v_txt := case when v_r.priority = 'a' and v_r.category = 'politics' and v_r.internal_notes = 'ZZ interne Notiz'
                    and jsonb_array_length(v_r.stage_candidates) = 1
                    and v_r.stage_candidates->0->>'name' = 'ZZ Test L39 Bühne'
                  then 'ok' else 'FEHLER ' || coalesce(v_r::text, 'keine Zeile') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('07_L_manager_speakers', v_txt);

  -- ---- S: Stage Lead der Bühne mit P's Session
  perform set_config('request.jwt.claims', json_build_object('sub', v_us, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform update_speaker(v_sp, '{"priority": "b"}'::jsonb);
    select count(*) into v_n from speaker_stage_candidate c where c.profile_id = v_sp;
    select sp.priority into v_txt from speaker_profile sp where sp.id = v_sp;
    v_txt := case when v_txt = 'b' and v_n = 1 then 'ok' else 'FEHLER prio=' || coalesce(v_txt, 'null') || ' n=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('08_S_stage_lead', v_txt);

  -- ---- X: ohne Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b1 := false; b2 := false;
  begin
    perform update_speaker(v_sp, '{"priority": "c"}'::jsonb);
  exception when others then b1 := sqlstate = '42501';
  end;
  begin
    perform set_speaker_stage_candidates(v_sp, '{}');
  exception when others then b2 := sqlstate = '42501';
  end;
  select count(*) into v_n from speaker_stage_candidate c where c.profile_id = v_sp;
  execute 'reset role';
  insert into t_res values ('09_X_nichts', case when b1 and b2 and v_n = 0 then 'ok' else 'FEHLER upd=' || b1 || ' set=' || b2 || ' n=' || v_n end);

  -- ---- P: der Speaker selbst
  perform set_config('request.jwt.claims', json_build_object('sub', v_up, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into v_n from speaker_profile sp where sp.id = v_sp;
    b1 := v_n = 0;
    select count(*) into v_n from speaker_stage_candidate c where c.profile_id = v_sp;
    b2 := v_n = 0;
    v_j := my_speaker_profile(v_ed);
    v_txt := case when b1 and b2 and v_j is not null
                    and not (v_j ?| array['category', 'topic_cluster', 'topic_role', 'priority',
                                           'recommended_format', 'contact_via', 'outreach_channel', 'stage_candidates'])
                    and not (coalesce(v_j->'profile', '{}'::jsonb) ?| array['category', 'priority', 'contact_via'])
                  then 'ok' else 'FEHLER zeile=' || b1 || ' buehnen=' || b2 || ' json=' || coalesce(left(v_j::text, 80), 'null') end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('10_P_sieht_nichts', v_txt);

  -- ---- Stillgelegter Begriff (Superuser legt still, L speichert anderes)
  update vocab_term set active = false where vocabulary = 'speaker_category' and key = 'politics';
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform update_speaker(v_sp, '{"job_title": "ZZ Titel"}'::jsonb);
    select sp.job_title into v_txt from speaker_profile sp where sp.id = v_sp;
    v_txt := case when v_txt = 'ZZ Titel' then 'ok' else 'FEHLER ' || coalesce(v_txt, 'null') end;
  exception when others then v_txt := 'GESPERRT (BUG) ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('11_stillgelegt_sperrt_nicht', v_txt);

  -- ---- Profil löschen (als Superuser; `anonymize_person` ist ein interner Weg)
  begin
    perform anonymize_person(v_pp);
    select sp.category, sp.topic_cluster, sp.topic_role, sp.priority, sp.recommended_format, sp.contact_via, sp.outreach_channel
      into v_r from speaker_profile sp where sp.id = v_sp;
    select count(*) into v_n from speaker_stage_candidate c where c.profile_id = v_sp;
    v_txt := case when num_nulls(v_r.category, v_r.topic_cluster, v_r.topic_role, v_r.priority,
                                 v_r.recommended_format, v_r.contact_via, v_r.outreach_channel) = 7 and v_n = 0
                  then 'ok' else 'FEHLER ' || coalesce(v_r::text, 'keine Zeile') || ' n=' || v_n end;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  insert into t_res values ('12_anonymisiert', v_txt);

  -- ---- Rechte
  insert into t_res values ('13_rechte',
    case when to_regprocedure('set_speaker_stage_candidates(uuid, uuid[])') is null then 'FEHLER fehlt'
         when has_function_privilege('authenticated', 'set_speaker_stage_candidates(uuid, uuid[])', 'execute')
          and not has_function_privilege('anon', 'set_speaker_stage_candidates(uuid, uuid[])', 'execute')
          and has_function_privilege('authenticated', 'manager_speakers(uuid)', 'execute')
          and has_table_privilege('authenticated', 'speaker_stage_candidate', 'select')
          and not has_table_privilege('authenticated', 'speaker_stage_candidate', 'insert')
          and not has_table_privilege('authenticated', 'speaker_stage_candidate', 'delete')
          and not has_table_privilege('anon', 'speaker_stage_candidate', 'select')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
