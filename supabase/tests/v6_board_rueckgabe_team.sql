-- Smoke-Test zum Vorschlag v6_board_rueckgabe_team (LEAD-038). Aufbau im Rollback:
-- eine Entwurfs-Session am Summit mit Rückgabe (Grund, zurückgegeben von T).
-- T hat programme_team (Programmleitung), L ist Stage Lead der Bühne, K hat
-- keine Rolle. T, L und K sind Live-Konten; geurteilt wird nur über die eigene Session.
--
--   01 board_session_return als T: Grund und Name                          (gegen live: Funktion fehlt)
--   02 als L (Stage Lead) → 42501                                           (gegen live: Funktion fehlt)
--   03 als K (ohne Rolle) → 42501                                           (gegen live: Funktion fehlt)
--   04 unbekannte Session → P0002 session_not_found                         (gegen live: Funktion fehlt)
--   05 die Tabelle bleibt für Clients zu: direkt lesen als T → 42501        (gegen live: schon so — Wächter)
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_sum uuid; v_day uuid; v_st uuid; v_sl uuid; v_se uuid;
  v_pt uuid; v_ut uuid; v_pl uuid; v_ul uuid; v_pk uuid; v_uk uuid;
  v_note text; v_name text; v_tname text; v_txt text; v_st1 text; v_st2 text; v_st3 text; v_st4 text;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_sum from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select d.id into v_day from event_day d where d.event_id = v_sum order by d.day_date limit 1;
  insert into stage (event_id, name, slug, type, active) values (v_sum, 'ZZ LEAD038', 'zz-lead038', 'side', true) returning id into v_st;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_st, v_day, now() + interval '1 day', now() + interval '1 day 30 minutes', 'content', 'open') returning id into v_sl;
  insert into session (event_id, slot_id, format, title_de, title_en, language, access_mode, publish_status)
  values (v_sum, v_sl, 'talk', 'ZZ LEAD038 Talk', null, 'de', 'open', 'draft') returning id into v_se;

  select p.id, p.auth_user_id, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_pt, v_ut, v_tname from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pl, v_ul from person p where p.auth_user_id is not null and p.id <> v_pt order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_pk, v_uk from person p where p.auth_user_id is not null and p.id not in (v_pt, v_pl) order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pt, v_pl, v_pk);
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pt, 'programme_team', 'edition', v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pl, 'speaker_manager', 'stage', v_st, v_ed);
  insert into partner_session_return (session_id, note, returned_by) values (v_se, 'ZZ Bitte den englischen Titel ergänzen.', v_pt);

  -- ---- 01 Programmleitung
  perform set_config('request.jwt.claims', json_build_object('sub', v_ut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select r.note, r.returned_by_name from board_session_return($1) r' into v_note, v_name using v_se;
  exception when others then v_txt := 'FEHLER ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute 'select 1 from board_session_return($1)' using gen_random_uuid();
    v_st4 := 'kein Fehler';
  exception when others then v_st4 := sqlstate || ' ' || sqlerrm;
  end;
  begin
    execute 'select count(*) from partner_session_return';
    v_st3 := 'kein Fehler';
  exception when others then v_st3 := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('01_programmleitung_sieht_grund',
    coalesce(v_txt, case when v_note = 'ZZ Bitte den englischen Titel ergänzen.' and v_name is not distinct from v_tname then 'ok'
                         else 'FEHLER note=' || coalesce(v_note, '?') || ' name=' || coalesce(v_name, '?') end));

  -- ---- 02 Stage Lead
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select 1 from board_session_return($1)' using v_se;
    v_st1 := 'kein Fehler';
  exception when others then v_st1 := sqlstate;
  end;
  execute 'reset role';
  -- ---- 03 Ohne Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_uk, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select 1 from board_session_return($1)' using v_se;
    v_st2 := 'kein Fehler';
  exception when others then v_st2 := sqlstate;
  end;
  execute 'reset role';
  insert into t_res values ('02_stage_lead_gesperrt', case when v_st1 = '42501' then 'ok' else 'FEHLER ' || v_st1 end);
  insert into t_res values ('03_ohne_rolle_gesperrt', case when v_st2 = '42501' then 'ok' else 'FEHLER ' || v_st2 end);
  insert into t_res values ('04_unbekannte_session', case when v_st4 = 'P0002 session_not_found' then 'ok' else 'FEHLER ' || v_st4 end);
  insert into t_res values ('05_tabelle_bleibt_zu', case when v_st3 = '42501' then 'ok' else 'FEHLER ' || v_st3 end);
end $$;
select * from t_res order by step;
rollback;
