-- Smoke-Test zum Vorschlag v6_session_partner (Korrektur zu 0155). Belegt:
--   01 ein Stage Lead hängt einen Partner der Edition an eine Session seiner
--      Bühne — `partner_org_id` steht, **`host_org_id` bleibt leer** (der
--      Fehler aus #147 war genau diese Verwechslung);
--   02 `board_session_refs` liefert diesen buchenden Partner — und keine
--      Moderation mehr aus der toten Spalte;
--   03 eine Organisation ohne Partnerschaft in der Edition fällt durch;
--   04 steht schon ein anderer ausrichtender Partner, kommt ein Schlüssel
--      statt der rohen 23514;
--   05 der Bühnen-Editor eines Partners darf **nicht** umhängen;
--   06 abnehmen geht;
--   07 ein Lead ohne Recht an der Session bekommt 42501;
--   08 die Moderation geht als `session_speaker` mit der Rolle `moderator`
--      durch und kommt über `session_speakers_public` mit ihrer Rolle zurück —
--      dorthin schreibt der Drawer jetzt statt in `moderation_person_id`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ev uuid; v_ed uuid; v_stage uuid; v_fremd_stage uuid;
  v_org uuid; v_org2 uuid; v_org_ohne uuid; v_se uuid; v_slot uuid; v_host uuid; v_partner uuid;
  v_refs jsonb; v_start timestamptz; v_tz text; v_day event_day%rowtype;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;

  select ev.id, ev.timezone, coalesce(ev.edition_id, ev.id) into v_ev, v_tz, v_ed
    from event ev where exists (select 1 from event_day ed where ed.event_id = ev.id) order by ev.start_date limit 1;
  insert into stage (event_id, name, slug) values (v_ev, 'Testbühne Partner', 'test-partner-' || substr(gen_random_uuid()::text, 1, 6))
    returning id into v_stage;
  insert into stage (event_id, name, slug) values (v_ev, 'Fremdbühne Partner', 'fremd-partner-' || substr(gen_random_uuid()::text, 1, 6))
    returning id into v_fremd_stage;
  select ed.* into v_day from event_day ed where ed.event_id = v_ev order by ed.day_date limit 1;
  v_start := (v_day.day_date + time '11:00') at time zone v_tz;

  insert into organization (communication_name) values ('Testpartner Eins') returning id into v_org;
  insert into organization (communication_name) values ('Testpartner Zwei') returning id into v_org2;
  insert into organization (communication_name) values ('Keine Partnerschaft') returning id into v_org_ohne;
  insert into org_edition (org_id, edition_id) values (v_org, v_ed), (v_org2, v_ed);

  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type)
  values (v_stage, v_day.id, v_start, v_start + interval '30 minutes', 'content') returning id into v_slot;
  insert into session (event_id, format, title_de, slot_id) values (v_ev, 'keynote', 'Gesponserte Keynote', v_slot)
    returning id into v_se;

  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'speaker_manager', 'stage', v_stage);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01 · setzen
  perform set_session_partner(v_se, v_org);
  select host_org_id, partner_org_id into v_host, v_partner from session where id = v_se;
  insert into t_res values ('01_partner_gesetzt_host_leer',
    case when v_partner = v_org and v_host is null then 'ok' else 'FEHLER host=' || coalesce(v_host::text, 'null') end);

  -- 02 · Namen
  v_refs := board_session_refs(v_se);
  insert into t_res values ('02_refs_buchender_partner',
    case when v_refs->'partner'->>'name' = 'Testpartner Eins' and not (v_refs ? 'moderation')
         then 'ok, nur der buchende Partner' else 'FEHLER ' || v_refs::text end);

  -- 03 · ohne Partnerschaft
  begin
    perform set_session_partner(v_se, v_org_ohne);
    insert into t_res values ('03_ohne_partnerschaft', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('03_ohne_partnerschaft', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 · anderer Ausrichter
  update session set host_org_id = v_org, partner_org_id = v_org where id = v_se;
  begin
    perform set_session_partner(v_se, v_org2);
    insert into t_res values ('04_anderer_ausrichter', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_anderer_ausrichter', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;
  update session set host_org_id = null where id = v_se;

  -- 08 · Moderation als Speaker-Rolle
  declare v_mod uuid; v_json jsonb;
  begin
    select p.id into v_mod from person p where p.deleted_at is null and p.id <> v_pid limit 1;
    perform set_session_speakers(v_se, jsonb_build_array(
      jsonb_build_object('person_id', v_mod, 'role', 'moderator', 'sort_order', 0, 'confirmed', false)));
    v_json := session_speakers_public(v_se);
    insert into t_res values ('08_moderation_als_rolle',
      case when jsonb_path_exists(v_json, '$[*] ? (@.role == "moderator")')
           then 'ok, Rolle moderator' else 'FEHLER ' || v_json::text end);
  end;

  -- 06 · abnehmen
  perform set_session_partner(v_se, null);
  select partner_org_id into v_partner from session where id = v_se;
  insert into t_res values ('06_abnehmen', case when v_partner is null then 'ok' else 'FEHLER' end);

  -- 05 · Bühnen-Editor eines Partners
  delete from role_assignment where person_id = v_pid;
  update stage set partner_org_id = v_org, type = 'partner_booth' where id = v_stage;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'standbuehne_editor', 'org', v_org);
  insert into t_res values ('05a_vorbedingung_editor_darf_session',
    case when can_edit_session(v_se) then 'ok' else 'FEHLER: darf die Session gar nicht' end);
  begin
    perform set_session_partner(v_se, v_org2);
    insert into t_res values ('05b_editor_darf_nicht_umhaengen', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05b_editor_darf_nicht_umhaengen', 'abgewiesen ' || sqlstate);
  end;

  -- 07 · Lead einer anderen Bühne
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'speaker_manager', 'stage', v_fremd_stage);
  begin
    perform set_session_partner(v_se, v_org);
    insert into t_res values ('07_fremder_lead', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('07_fremder_lead', 'abgewiesen ' || sqlstate);
  end;
  delete from role_assignment where person_id = v_pid;
end $$;
select * from t_res order by step;
rollback;
