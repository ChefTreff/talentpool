-- Smoke-Test zum Vorschlag v6_moderation_stage_leads (LEAD-042). Aufbau im
-- Rollback: am Summit der Edition eine Test-Bühne; fünf Wegwerf-Personen mit dem
-- Nachnamen „ZZModsuche …“:
--   Sp  Speaker der Edition (Speaker-Profil)
--   Sl  Stage Lead der Test-Bühne (speaker_manager, Scope stage, aktiv)
--   Ab  Stage Lead mit abgelaufener Rolle
--   Gl  globaler Speaker-Manager (internes Team)
--   Bd  Speaker **und** Stage Lead
-- Suchende Person C mit programme_team an der Edition (darf suchen), X ohne Rolle.
--
--   01 ohne p_moderation: nur die Speaker (Sp, Bd) — wie bisher
--   02 mit p_moderation: dazu der Stage Lead Sl, markiert is_stage_lead   (gegen live: FEHLER, Parameter fehlt)
--   03 abgelaufene Rolle (Ab) und globaler Manager (Gl) stehen nicht in der Liste
--   04 Bd erscheint einmal, als Speaker (is_stage_lead = false)
--   05 X ohne Rolle: 42501
--   06 Signatur: alte mit drei Parametern entfernt, neue für authenticated ausführbar, nicht für anon
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_s uuid;
  v_sp uuid; v_sl uuid; v_ab uuid; v_gl uuid; v_bd uuid;
  v_pc uuid; v_uc uuid; v_px uuid; v_ux uuid;
  v_namen text; v_leads text; v_n int; v_txt text;
begin
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ Test Modsuche', 'zz-test-modsuche', 'side', true) returning id into v_s;

  -- Wegwerf-Personen ohne Konto; die primäre E-Mail prüft der Trigger erst beim
  -- Commit, und der kommt im Rollback nie.
  insert into person (first_name, last_name) values ('Anna', 'ZZModsuche Speaker') returning id into v_sp;
  insert into person (first_name, last_name) values ('Lea', 'ZZModsuche Stagelead') returning id into v_sl;
  insert into person (first_name, last_name) values ('Otto', 'ZZModsuche Abgelaufen') returning id into v_ab;
  insert into person (first_name, last_name) values ('Gustav', 'ZZModsuche Global') returning id into v_gl;
  insert into person (first_name, last_name) values ('Bea', 'ZZModsuche Beides') returning id into v_bd;
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status) values (v_sp, v_ed, 'panelist', 'lead');
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status) values (v_bd, v_ed, 'moderator', 'lead');
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_sl, 'speaker_manager', 'stage', v_s, v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_bd, 'speaker_manager', 'stage', v_s, v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_from, valid_to)
  values (v_ab, 'speaker_manager', 'stage', v_s, v_ed, now() - interval '2 days', now() - interval '1 day');
  insert into role_assignment (person_id, role, scope_type) values (v_gl, 'speaker_manager', 'global');

  select p.id, p.auth_user_id into v_pc, v_uc from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_px, v_ux from person p where p.auth_user_id is not null and p.id <> v_pc order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pc, v_px);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pc, 'programme_team', 'edition', v_ed);

  -- ---- C: Programm-Team der Edition
  perform set_config('request.jwt.claims', json_build_object('sub', v_uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select string_agg(r.display_name, ', ' order by r.display_name) into v_namen
      from board_search_people(v_sum, 'ZZModsuche') r;
    v_txt := v_namen;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('01_ohne_moderation', case when v_txt = 'Anna ZZModsuche Speaker, Bea ZZModsuche Beides' then 'ok' else 'FEHLER ' || coalesce(v_txt, 'leer') end);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute $q$select string_agg(r.display_name, ', ' order by r.display_name),
                      string_agg(r.display_name, ', ' order by r.display_name) filter (where r.is_stage_lead)
                 from board_search_people($1, 'ZZModsuche', 25, true) r$q$
      into v_namen, v_leads using v_sum;
    v_txt := 'ok';
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into t_res values ('02_mit_moderation',
    case when v_txt <> 'ok' then v_txt
         when v_leads = 'Lea ZZModsuche Stagelead'
          and v_namen = 'Anna ZZModsuche Speaker, Bea ZZModsuche Beides, Lea ZZModsuche Stagelead' then 'ok'
         else 'FEHLER namen=' || coalesce(v_namen, 'leer') || ' leads=' || coalesce(v_leads, 'leer') end);
  insert into t_res values ('03_abgelaufen_und_global_fehlen',
    case when v_txt <> 'ok' then v_txt
         when position('Abgelaufen' in coalesce(v_namen, '')) = 0 and position('Global' in coalesce(v_namen, '')) = 0 then 'ok'
         else 'FEHLER ' || v_namen end);
  insert into t_res values ('04_beides_einmal_als_speaker',
    case when v_txt <> 'ok' then v_txt
         when (length(v_namen) - length(replace(v_namen, 'Bea ZZModsuche Beides', ''))) / length('Bea ZZModsuche Beides') = 1
          and position('Beides' in coalesce(v_leads, '')) = 0 then 'ok'
         else 'FEHLER ' || v_namen end);

  -- ---- X: ohne Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from board_search_people($1, $2, 25, true)' into v_n using v_sum, 'ZZModsuche';
    v_txt := 'ERLAUBT (BUG)';
  exception when others then
    v_txt := case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end;
  end;
  execute 'reset role';
  insert into t_res values ('05_X_nicht_erlaubt', v_txt);

  insert into t_res values ('06_signatur',
    case when to_regprocedure('board_search_people(uuid, text, integer, boolean)') is null then 'FEHLER neue fehlt'
         when to_regprocedure('board_search_people(uuid, text, integer)') is not null then 'FEHLER alte noch da'
         when has_function_privilege('authenticated', 'board_search_people(uuid, text, integer, boolean)', 'execute')
          and not has_function_privilege('anon', 'board_search_people(uuid, text, integer, boolean)', 'execute') then 'ok'
         else 'FEHLER rechte' end);
end $$;
select * from t_res order by step;
rollback;
