-- Smoke-Test zum Vorschlag v6_board_suche (LEAD-019, LEAD-020). Belegt mit
-- einem **reinen** Stage-Lead-Konto:
--   01 der Lead darf im Board seiner Veranstaltung suchen;
--   02 er findet einen Speaker der Edition — Vorbedingung, sonst belegten die
--      Leerbefunde darunter nur, dass die Suche nichts findet;
--   03 er findet **keine** Person ohne Speaker-Profil (kein Talentpool);
--   04 die Ergebnisse tragen keine Mailadresse, keine Stufe, keinen Ort;
--   05 er findet einen Partner der Edition;
--   06 aber keine Organisation ohne Partnerschaft in dieser Edition;
--   07 wer keine Rolle hat, bekommt 42501;
--   08 ein Lead **einer anderen** Veranstaltung ebenso;
--   09 `board_session_refs` gibt Moderation und Partner mit Namen heraus —
--      und nur diese beiden.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ev uuid; v_ed uuid; v_stage uuid; v_fremd_ev uuid; v_fremd_stage uuid;
  v_mit uuid; v_ohne uuid; v_org_mit uuid; v_org_ohne uuid; v_n integer; v_cols text;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;

  select st.id, st.event_id into v_stage, v_ev from stage st order by st.created_at limit 1;
  select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = v_ev;

  -- Testdaten mit einem Namen, den es sonst nicht gibt.
  insert into person (first_name, last_name, source_first, tier) values ('Zaphodine', 'Mitprofil', 'test', 'lead')
    returning id into v_mit;
  insert into speaker_profile (person_id, edition_id, organization_name) values (v_mit, v_ed, 'Beispiel AG');
  insert into person (first_name, last_name, source_first, tier) values ('Zaphodine', 'Ohneprofil', 'test', 'lead')
    returning id into v_ohne;
  insert into organization (communication_name) values ('Zaphodine Partner GmbH') returning id into v_org_mit;
  insert into org_edition (org_id, edition_id) values (v_org_mit, v_ed);
  insert into organization (communication_name) values ('Zaphodine Fremd GmbH') returning id into v_org_ohne;

  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'speaker_manager', 'stage', v_stage);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  insert into t_res values ('01_darf_suchen', case when can_search_board(v_ev) then 'ok' else 'FEHLER' end);

  select count(*) into v_n from board_search_people(v_ev, 'Zaphodine') where id = v_mit;
  insert into t_res values ('02_findet_speaker', case when v_n = 1 then 'ok' else 'FEHLER: ' || v_n end);

  select count(*) into v_n from board_search_people(v_ev, 'Zaphodine') where id = v_ohne;
  insert into t_res values ('03_kein_talentpool', case when v_n = 0 then 'ok, nicht gefunden' else 'FEHLER: gefunden' end);

  select pg_get_function_result('board_search_people(uuid, text, integer)'::regprocedure) into v_cols;
  insert into t_res values ('04_nur_name_und_org',
    case when v_cols !~* 'email|tier|city' then 'ok: ' || v_cols else 'FEHLER: ' || v_cols end);

  select count(*) into v_n from board_search_partners(v_ev, 'Zaphodine') where id = v_org_mit;
  insert into t_res values ('05_findet_partner', case when v_n = 1 then 'ok' else 'FEHLER: ' || v_n end);

  select count(*) into v_n from board_search_partners(v_ev, 'Zaphodine') where id = v_org_ohne;
  insert into t_res values ('06_keine_fremde_org', case when v_n = 0 then 'ok, nicht gefunden' else 'FEHLER: gefunden' end);

  -- 09 · Namen zur Session
  declare v_se uuid; v_refs jsonb;
  begin
    insert into session (event_id, format, title_de, moderation_person_id, host_org_id)
    values (v_ev, 'panel', 'Probe 019', v_mit, v_org_mit) returning id into v_se;
    v_refs := board_session_refs(v_se);
    insert into t_res values ('09_refs',
      case when v_refs->'moderation'->>'name' = 'Zaphodine Mitprofil'
            and v_refs->'partner'->>'name' = 'Zaphodine Partner GmbH'
            and (select count(*) from jsonb_object_keys(v_refs)) = 2
           then 'ok, zwei Namen und nichts sonst' else 'FEHLER ' || v_refs::text end);
  end;

  -- 07 · ohne Rolle
  delete from role_assignment where person_id = v_pid;
  begin
    perform board_search_people(v_ev, 'Zaphodine');
    insert into t_res values ('07_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('07_ohne_rolle', 'abgewiesen ' || sqlstate);
  end;

  -- 08 · Lead einer anderen Veranstaltung
  select st.id, st.event_id into v_fremd_stage, v_fremd_ev from stage st where st.event_id <> v_ev limit 1;
  if v_fremd_stage is null then
    insert into event (name, slug, is_edition, format_tag)
    select 'Testevent 019', 'test-019-' || substr(gen_random_uuid()::text, 1, 6), false, e.format_tag
      from event e where e.id = v_ev returning id into v_fremd_ev;
    insert into stage (event_id, name, slug) values (v_fremd_ev, 'Fremdbühne', 'fremd-019')
      returning id into v_fremd_stage;
  end if;
  insert into role_assignment (person_id, role, scope_type, scope_id)
  values (v_pid, 'speaker_manager', 'stage', v_fremd_stage);
  begin
    perform board_search_partners(v_ev, 'Zaphodine');
    insert into t_res values ('08_fremder_lead', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('08_fremder_lead', 'abgewiesen ' || sqlstate);
  end;
  delete from role_assignment where person_id = v_pid;
end $$;
select * from t_res order by step;
rollback;
