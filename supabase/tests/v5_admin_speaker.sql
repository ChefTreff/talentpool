-- Smoke-Test 0103 (Admin-Speaker: Detailblatt, Übergabe). Belegt:
--   01 eine Lead-Person kann `owner_person_id` nicht mehr über `update_speaker`
--      setzen ⇒ `team_only_fields`. Das war das Loch: sie konnte sich damit
--      einen fremden Speaker zuschreiben;
--   02 das Team darf das Feld weiterhin über `update_speaker` pflegen;
--   03 wer heute selbst betreut, darf weiterreichen;
--   04 wer nicht betreut, darf nicht — auch wenn er den Speaker verwalten darf;
--   05 ein Empfänger ohne Lead-Rolle wird mit `invalid_owner` abgewiesen,
--      sonst zeigt die Betreuung auf jemanden ohne Portalzugang;
--   06 eine unbekannte Person ⇒ `person_not_found`;
--   07 freigeben (`null`) darf nur das Team;
--   08 jede Übergabe steht mit Vorher und Nachher im Protokoll;
--   09 das Team sieht `internal_notes` im Detailblatt;
--   10 eine Lead-Person bekommt das Feld **gar nicht** — und erfährt das über
--      `internal_notes_visible`, statt ein leeres Feld angeboten zu bekommen;
--   11 ohne Verwaltungsrecht kein Detailblatt ⇒ 42501;
--   12 `speaker_managers` nennt nur aktive Lead-Personen (abgelaufen zählt nicht);
--   13 ohne Rolle keine Liste der Lead-Personen ⇒ 42501;
--   14 das Lead-Board gibt die interne Notiz wieder heraus — 0099 hatte sie
--      aus dem Rückgabetyp verloren, das Notizfeld stand seither leer.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid;
  v_other uuid; v_fremd uuid; v_alt uuid; v_owner uuid; v_txt text; v_det jsonb; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from speaker_profile where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- Drei Gegenüber: eine echte Lead-Person, eine ohne Rolle, eine mit abgelaufener.
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Lea', 'Leadsen', 'de', 'test', 'lead') returning id into v_other;
  insert into person_email (person_id, email, is_primary, verified)
    values (v_other, 'lea.leadsen@example.test', true, false);
  insert into role_assignment (person_id, role, scope_type) values (v_other, 'speaker_manager', 'global');
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Ohne', 'Rolle', 'de', 'test', 'lead') returning id into v_fremd;
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Abge', 'Laufen', 'de', 'test', 'lead') returning id into v_alt;
  insert into role_assignment (person_id, role, scope_type, valid_from, valid_to)
    values (v_alt, 'speaker_manager', 'global', now() - interval '2 days', now() - interval '1 day');

  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status, owner_person_id, internal_notes)
    values (v_fremd, v_ed, 'keynote', 'contacted', v_pid, 'Honorarwunsch offen') returning id into v_sp;

  -- 01 · Lead-Person, betreut den Speaker selbst.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'speaker_manager', 'global');
  begin
    perform update_speaker(v_sp, jsonb_build_object('owner_person_id', v_other::text));
    insert into t_res values ('01_lead_setzt_owner', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_lead_setzt_owner', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 02 · Team darf.
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform update_speaker(v_sp, jsonb_build_object('owner_person_id', v_other::text));
  select owner_person_id into v_owner from speaker_profile where id = v_sp;
  insert into t_res values ('02_team_setzt_owner',
    case when v_owner = v_other then 'gesetzt (richtig)' else 'unerwartet ' || coalesce(v_owner::text, 'null') end);

  -- 03 · Weiterreichen, was man hat.
  delete from role_assignment where person_id = v_pid and role = 'area_lead_speaker';
  update speaker_profile set owner_person_id = v_pid where id = v_sp;
  perform handover_speaker(v_sp, v_other);
  select owner_person_id into v_owner from speaker_profile where id = v_sp;
  insert into t_res values ('03_weitergeben',
    case when v_owner = v_other then 'uebergeben (richtig)' else 'unerwartet ' || coalesce(v_owner::text, 'null') end);

  -- 04 · Verwalten darf sie (Edition-Scope), abgeben nicht — sie betreut ihn nicht.
  insert into role_assignment (person_id, role, scope_type, edition_id)
    values (v_pid, 'speaker_manager', 'edition', v_ed);
  begin
    perform handover_speaker(v_sp, v_pid);
    insert into t_res values ('04_fremden_ziehen', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_fremden_ziehen', 'abgewiesen ' || sqlstate); end;

  -- 05 · Empfänger ohne Lead-Rolle.
  update speaker_profile set owner_person_id = v_pid where id = v_sp;
  begin
    perform handover_speaker(v_sp, v_alt);
    insert into t_res values ('05_empfaenger_ohne_rolle', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('05_empfaenger_ohne_rolle', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 06 · Unbekannte Person.
  begin
    perform handover_speaker(v_sp, gen_random_uuid());
    insert into t_res values ('06_unbekannt', 'ANGENOMMEN (BUG)');
  exception when others then
    insert into t_res values ('06_unbekannt', 'abgewiesen ' || sqlstate || ' ' || sqlerrm); end;

  -- 07 · Freigeben darf nur das Team.
  begin
    perform handover_speaker(v_sp, null);
    insert into t_res values ('07_lead_gibt_frei', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('07_lead_gibt_frei', 'abgewiesen ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  perform handover_speaker(v_sp, null);
  select owner_person_id into v_owner from speaker_profile where id = v_sp;
  insert into t_res values ('07b_team_gibt_frei',
    case when v_owner is null then 'freigegeben (richtig)' else 'unerwartet ' || v_owner::text end);

  -- 08 · Protokoll.
  select count(*) into v_n from audit_log
   where action = 'speaker.handover' and object_id = v_sp::text
     and before ? 'owner_person_id' and after ? 'owner_person_id';
  insert into t_res values ('08_protokoll',
    case when v_n >= 2 then v_n || ' Eintraege mit Vorher/Nachher (richtig)' else 'nur ' || v_n || ' (BUG)' end);

  -- 09 · Detailblatt fuers Team.
  v_det := speaker_detail(v_sp);
  insert into t_res values ('09_detail_team',
    case when v_det->>'internal_notes' = 'Honorarwunsch offen'
          and (v_det->>'internal_notes_visible')::boolean
          and v_det->'person' ? 'salutation_de' and v_det ? 'tech_rider' and v_det ? 'sessions'
         then 'vollstaendig inkl. Notiz (richtig)'
         else 'unerwartet ' || coalesce(v_det->>'internal_notes', 'null') end);

  -- 10 · Dieselbe Seite als Lead-Person: die Notiz fehlt, und das ist sichtbar.
  delete from role_assignment where person_id = v_pid and role = 'area_lead_speaker';
  update speaker_profile set owner_person_id = v_pid where id = v_sp;
  v_det := speaker_detail(v_sp);
  insert into t_res values ('10_detail_lead',
    case when not (v_det ? 'internal_notes') and not (v_det->>'internal_notes_visible')::boolean
         then 'ohne Notiz, Grund benannt (richtig)'
         else 'Notiz sichtbar (BUG)' end);

  -- 11 · Ohne Verwaltungsrecht.
  delete from role_assignment where person_id = v_pid;
  update speaker_profile set owner_person_id = v_other where id = v_sp;
  begin
    perform speaker_detail(v_sp);
    insert into t_res values ('11_detail_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('11_detail_ohne_recht', 'abgewiesen ' || sqlstate); end;

  -- 12/13 · Auswahlliste der Lead-Personen.
  begin
    perform speaker_managers();
    insert into t_res values ('13_liste_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('13_liste_ohne_rolle', 'abgewiesen ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  select string_agg(m.display_name, ',' order by m.display_name) into v_txt
    from speaker_managers() m where m.person_id in (v_other, v_alt, v_fremd);
  insert into t_res values ('12_liste',
    case when v_txt = 'Lea Leadsen' then 'nur aktive Lead-Person (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);
  -- 14 · Nachtrag zu 0099: die Notiz steht wieder im Board.
  select m.internal_notes into v_txt from manager_speakers(v_ed) m where m.id = v_sp;
  insert into t_res values ('14_board_notiz',
    case when v_txt = 'Honorarwunsch offen' then 'Notiz im Board (richtig)'
         else 'unerwartet ' || coalesce(v_txt, 'null') end);
end $$;
select * from t_res order by step;
rollback;
