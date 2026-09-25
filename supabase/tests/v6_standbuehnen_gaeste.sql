-- Smoke-Test (Standbühnen-Speaker als Gäste, PART-081). Nummer offen. Belegt:
--   01 ohne Einwilligung kein Gast (22023 `stage_guest_consent_required`);
--   02 ein Partner legt einen Gast an: `stage_guest`, zugesagt mit `confirmed_at`, Einwilligung mit Zeitstempel,
--      keine Lounge, anlegende Organisation, pflegbar; **keine** Rolle `speaker`, **kein** Freiticket —
--      Vorbedingung: ein regulär zugesagter Speaker bekommt über denselben Trigger eins;
--   03 CHECK: ein Gast mit Lounge geht nicht (23514);
--   04 `invite_speaker` weist einen Gast ab (P0001 `stage_guest`);
--   05 `upsert_speaker` gibt einem Gast keine Rolle — Vorbedingung: einem regulären Speaker schon;
--   06 `speaker_ticket_create` weist einen Gast ab (`not_eligible`, detail `stage_guest`);
--   07 Swapcard: ohne veröffentlichte Session mit Slot fehlt der Gast im Export, mit ihr steht er drin;
--   08 `partner_speakers` zeigt den Gast nicht — Vorbedingung: einen regulären Partner-Speaker schon;
--   09 `partner_add_speaker` weist einen Gast als Talk-Speaker ab (P0001 `stage_guest`);
--   10 wer regulär spricht, wird kein Gast (P0001 `already_speaker`);
--   11 Gäste einer fremden Organisation: lesen, ändern, entfernen, zuordnen ⇒ 42501;
--   12 der eigene Gast lässt sich nicht an eine Session der fremden Standbühne hängen (42501);
--   12b PART-088: an einen gebuchten Talk der eigenen Organisation schon, an den einer fremden nicht (42501);
--   13 Porträt: der Partner darf den Foto-Pfad seines Gastes, nicht dessen Präsentations-Pfad, nicht den Foto-Pfad
--      eines fremden Gastes;
--   14 bearbeiten: Name (selbst angelegt), leere Position ⇒ `fields_required`;
--   15 entfernen: Gastprofil und Zuordnung weg, Person bleibt;
--   16 Rechte: `anon` darf die RPCs nicht, `authenticated` schon; der Helfer ist intern.
-- Probelauf der Build-Session am 25.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`, nach 0186,
-- alles zurückgerollt, Wegwerf-Organisationen und -Bühnen): 17 von 17 Schritten grün (mit 12b, PART-088). Bestehende Funktionen
-- aus dem aktuellen Snapshot (event_app_speakers mit QS-049), fn-diff nur mit den markierten Erweiterungen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_summit uuid; v_day uuid; v_datum date; v_tz text;
  v_org uuid; v_fremd uuid; v_buehne uuid; v_fremde_buehne uuid; v_slot uuid; v_slot_fremd uuid;
  v_se uuid; v_se_fremd uuid; v_talk uuid; v_res jsonb; v_gast uuid; v_gast_person uuid; v_fremd_gast uuid;
  v_regulaer uuid; v_regulaer_person uuid; v_mail_gast text; v_mail_regulaer text; v_sp speaker_profile;
  v_n integer; v_m integer; v_b boolean; v_txt text; v_det text; v_fremd_person uuid; v_claims text; v_talk_fremd uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id, e.timezone into v_summit, v_tz from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select ed.id, ed.day_date into v_day, v_datum from event_day ed where ed.event_id = v_summit order by ed.day_date limit 1;
  v_mail_gast := 'zz.gast.' || replace(gen_random_uuid()::text, '-', '') || '@example.org';
  v_mail_regulaer := 'zz.speaker.' || replace(gen_random_uuid()::text, '-', '') || '@example.org';

  insert into organization (legal_name) values ('ZZ Gast GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Gast GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_fremd, v_ed, 'invited');
  -- Die Person ist Hauptkontakt und Standbühnen-Editor der eigenen Organisation.
  insert into org_membership (org_id, person_id, roles) values (v_org, v_pid, array['primary_ops']);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'standbuehne_editor', 'org', v_org);
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Gast-Standbühne', 'partner_booth', v_org, true) returning id into v_buehne;
  insert into stage (event_id, name, type, partner_org_id, active)
    values (v_summit, 'ZZ Fremde Standbühne', 'partner_booth', v_fremd, true) returning id into v_fremde_buehne;
  insert into slot (stage_id, event_day_id, start_at, end_at)
    values (v_buehne, v_day, (v_datum + time '11:00') at time zone v_tz, (v_datum + time '11:30') at time zone v_tz)
    returning id into v_slot;
  insert into slot (stage_id, event_day_id, start_at, end_at)
    values (v_fremde_buehne, v_day, (v_datum + time '11:00') at time zone v_tz, (v_datum + time '11:30') at time zone v_tz)
    returning id into v_slot_fremd;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, host_org_id, publish_status, tags)
    values (v_summit, v_slot, 'talk', 'ZZ Standtalk', 'ZZ stand talk', 'Beschreibung', v_org, 'draft', '{}') returning id into v_se;
  insert into session (event_id, slot_id, format, title_de, host_org_id, publish_status, tags)
    values (v_summit, v_slot_fremd, 'talk', 'ZZ Fremder Standtalk', v_fremd, 'draft', '{}') returning id into v_se_fremd;
  insert into session (event_id, format, title_de, partner_org_id, publish_status, tags)
    values (v_summit, 'talk', 'ZZ Talk des Partners', v_org, 'draft', '{}') returning id into v_talk;
  insert into session (event_id, format, title_de, partner_org_id, publish_status, tags)
    values (v_summit, 'talk', 'ZZ Talk der Fremden', v_fremd, 'draft', '{}') returning id into v_talk_fremd;
  v_claims := json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text;
  perform set_config('request.jwt.claims', v_claims, true);

  -- 01 Ohne Einwilligung
  begin
    perform partner_add_stage_guest(v_org, 'ZZ', 'Gast', 'Leitung Einkauf', 'ZZ Firma', v_mail_gast, false);
    insert into t_res values ('01_ohne_einwilligung', 'ALLOWED (BUG): Gast ohne Einwilligung angelegt');
  exception
    when sqlstate '22023' then insert into t_res values ('01_ohne_einwilligung',
      case when sqlerrm = 'stage_guest_consent_required' then 'stage_guest_consent_required (richtig)' else '22023 ' || sqlerrm end);
    when others then insert into t_res values ('01_ohne_einwilligung', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 08 (Vorbedingung für 02/05): ein regulärer Partner-Speaker über den Talk
  v_regulaer := partner_add_speaker(v_talk, v_mail_regulaer, 'ZZ', 'Speakerin');
  select person_id into v_regulaer_person from speaker_profile where id = v_regulaer;

  -- 02 Gast anlegen
  v_res := partner_add_stage_guest(v_org, 'ZZ', 'Gast', 'Leitung Einkauf', 'ZZ Firma', v_mail_gast, true);
  v_gast := (v_res->>'profile_id')::uuid;
  select * into v_sp from speaker_profile where id = v_gast;
  v_gast_person := v_sp.person_id;
  select count(*)::integer into v_n from role_assignment where person_id = v_gast_person and role = 'speaker';
  select count(*)::integer into v_m from ticket where speaker_profile_id = v_gast;
  -- Vorbedingung: derselbe Trigger stellt einem regulär zugesagten Speaker ein Freiticket aus.
  update speaker_profile set pipeline_status = 'confirmed' where id = v_regulaer;
  select exists (select 1 from ticket where speaker_profile_id = v_regulaer) into v_b;
  insert into t_res values ('02_gast_angelegt',
    case when v_sp.stage_guest and v_sp.pipeline_status = 'confirmed' and v_sp.confirmed_at is not null
              and v_sp.stage_guest_consent_at is not null and not v_sp.lounge_access and v_sp.created_by_org_id = v_org
              and v_sp.partner_editable_until_login and (v_res->>'edition_id')::uuid = v_ed
              and v_n = 0 and v_m = 0 and v_b
         then 'Gast zugesagt, Einwilligung gesetzt, keine Rolle, kein Ticket; regulär: Ticket (richtig)'
         else 'unerwartet: gast=' || coalesce(v_sp.stage_guest::text, 'null') || ' rollen=' || v_n || ' tickets=' || v_m
              || ' vorbedingung_ticket=' || coalesce(v_b::text, 'null') end);

  -- 03 CHECK
  begin
    update speaker_profile set lounge_access = true where id = v_gast;
    insert into t_res values ('03_check', 'ALLOWED (BUG): Gast mit Lounge');
  exception
    when sqlstate '23514' then insert into t_res values ('03_check', '23514 (richtig)');
    when others then insert into t_res values ('03_check', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04–06 als Team
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  begin
    perform invite_speaker(v_gast);
    insert into t_res values ('04_einladung', 'ALLOWED (BUG): Gast eingeladen');
  exception
    when sqlstate 'P0001' then insert into t_res values ('04_einladung',
      case when sqlerrm = 'stage_guest' then 'stage_guest (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('04_einladung', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  perform upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_gast_person, 'job_title', 'Leitung Einkauf'));
  perform upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_regulaer_person, 'job_title', 'Speakerin'));
  select count(*)::integer into v_n from role_assignment where person_id = v_gast_person and role = 'speaker';
  select count(*)::integer into v_m from role_assignment where person_id = v_regulaer_person and role = 'speaker';
  insert into t_res values ('05_upsert_ohne_rolle',
    case when v_n = 0 and v_m = 1 then 'Gast ohne Rolle, regulärer Speaker mit (richtig)'
         else 'unerwartet: gast=' || v_n || ' regulaer=' || v_m end);

  begin
    perform speaker_ticket_create(v_gast);
    insert into t_res values ('06_ticket', 'ALLOWED (BUG): Freiticket für Gast');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_det = pg_exception_detail;
      insert into t_res values ('06_ticket',
        case when sqlerrm = 'not_eligible' and v_det = 'stage_guest' then 'not_eligible/stage_guest (richtig)' else 'P0001 ' || sqlerrm || '/' || coalesce(v_det, '') end);
    when others then insert into t_res values ('06_ticket', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  delete from role_assignment where person_id = v_pid and role = 'admin';

  -- 07 Swapcard: erst mit veröffentlichter Session am Slot. Den Export ruft der Server-Lauf ohne Konto auf.
  perform set_config('request.jwt.claims', '', true);
  select count(*)::integer into v_n from event_app_speakers(v_ed) x where x.profile_id = v_gast;
  perform set_config('request.jwt.claims', v_claims, true);
  perform partner_assign_stage_guest(v_se, v_gast, true);
  perform set_config('request.jwt.claims', '', true);
  select count(*)::integer into v_m from event_app_speakers(v_ed) x where x.profile_id = v_gast;
  update session set publish_status = 'published' where id = v_se;
  select exists (select 1 from event_app_speakers(v_ed) x where x.profile_id = v_gast) into v_b;
  perform set_config('request.jwt.claims', v_claims, true);
  insert into t_res values ('07_swapcard',
    case when v_n = 0 and v_m = 0 and v_b then 'ohne veröffentlichte Session nicht, mit ihr schon (richtig)'
         else 'unerwartet: vorher=' || v_n || ' zugeordnet=' || v_m || ' veroeffentlicht=' || coalesce(v_b::text, 'null') end);
  update session set publish_status = 'draft' where id = v_se;

  -- 08 partner_speakers
  select count(*)::integer into v_n from partner_speakers(v_org) x where x.profile_id = v_gast;
  select count(*)::integer into v_m from partner_speakers(v_org) x where x.profile_id = v_regulaer;
  insert into t_res values ('08_partner_speakers',
    case when v_n = 0 and v_m > 0 then 'Gast nicht in der Talk-Liste, regulärer Speaker schon (richtig)'
         else 'unerwartet: gast=' || v_n || ' regulaer=' || v_m end);

  -- 09 Gast als Talk-Speaker
  begin
    perform partner_add_speaker(v_talk, v_mail_gast, 'ZZ', 'Gast');
    insert into t_res values ('09_gast_als_talk', 'ALLOWED (BUG): Gast als Talk-Speaker');
  exception
    when sqlstate 'P0001' then insert into t_res values ('09_gast_als_talk',
      case when sqlerrm = 'stage_guest' then 'stage_guest (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('09_gast_als_talk', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 10 Regulärer Speaker wird kein Gast
  begin
    perform partner_add_stage_guest(v_org, 'ZZ', 'Speakerin', 'Vorstand', 'ZZ Firma', v_mail_regulaer, true);
    insert into t_res values ('10_schon_speaker', 'ALLOWED (BUG): regulärer Speaker als Gast');
  exception
    when sqlstate 'P0001' then insert into t_res values ('10_schon_speaker',
      case when sqlerrm = 'already_speaker' then 'already_speaker (richtig)' else 'P0001 ' || sqlerrm end);
    when others then insert into t_res values ('10_schon_speaker', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 11 Fremde Organisation (Gast der fremden Organisation direkt angelegt)
  insert into person (first_name, last_name) values ('ZZ', 'Fremdgast') returning id into v_fremd_person;
  v_txt := '';
  begin perform partner_stage_guests(v_fremd); v_txt := v_txt || ' lesen'; exception when sqlstate '42501' then null; end;
  insert into speaker_profile (person_id, edition_id, pipeline_status, confirmed_at, stage_guest, stage_guest_consent_at,
                               lounge_access, created_by_org_id)
    values (v_fremd_person, v_ed, 'confirmed', now(), true, now(), false, v_fremd) returning id into v_fremd_gast;
  begin perform partner_update_stage_guest(v_fremd_gast, p_job_title => 'X'); v_txt := v_txt || ' ändern'; exception when sqlstate '42501' then null; end;
  begin perform partner_remove_stage_guest(v_fremd_gast); v_txt := v_txt || ' entfernen'; exception when sqlstate '42501' then null; end;
  begin perform partner_assign_stage_guest(v_se, v_fremd_gast, true); v_txt := v_txt || ' zuordnen'; exception when sqlstate '42501' then null; end;
  begin perform partner_stage_guest_files(v_fremd_gast); v_txt := v_txt || ' dateien'; exception when sqlstate '42501' then null; end;
  insert into t_res values ('11_fremde_org', case when v_txt = '' then 'alles 42501 (richtig)' else 'ALLOWED (BUG):' || v_txt end);

  -- 12 Eigener Gast an fremder Standbühne
  begin
    perform partner_assign_stage_guest(v_se_fremd, v_gast, true);
    insert into t_res values ('12_fremde_buehne', 'ALLOWED (BUG): an fremder Standbühne');
  exception
    when sqlstate '42501' then insert into t_res values ('12_fremde_buehne', '42501 (richtig)');
    when others then insert into t_res values ('12_fremde_buehne', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 12b Talk der eigenen Organisation (PART-088) ja, Talk einer fremden nein
  perform partner_assign_stage_guest(v_talk, v_gast, true);
  select count(*)::integer into v_n from session_speaker where session_id = v_talk and person_id = v_gast_person;
  begin
    perform partner_assign_stage_guest(v_talk_fremd, v_gast, true);
    v_txt := 'ALLOWED';
  exception when sqlstate '42501' then v_txt := '42501';
  end;
  insert into t_res values ('12b_talk',
    case when v_n = 1 and v_txt = '42501' then 'eigener Talk ja, fremder Talk 42501 (richtig)'
         else 'unerwartet: eigener=' || v_n || ' fremder=' || v_txt end);

  -- 13 Porträt-Pfade
  insert into t_res values ('13_portraet',
    case when speaker_asset_path_allowed(v_ed::text || '/' || v_gast::text || '/photo/zz.jpg')
              and not speaker_asset_path_allowed(v_ed::text || '/' || v_gast::text || '/presentation/zz.pdf')
              and not speaker_asset_path_allowed(v_ed::text || '/' || v_fremd_gast::text || '/photo/zz.jpg')
         then 'eigenes Foto ja, Präsentation nein, fremdes Foto nein (richtig)'
         else 'unerwartet: foto=' || speaker_asset_path_allowed(v_ed::text || '/' || v_gast::text || '/photo/zz.jpg')::text
              || ' praes=' || speaker_asset_path_allowed(v_ed::text || '/' || v_gast::text || '/presentation/zz.pdf')::text
              || ' fremd=' || speaker_asset_path_allowed(v_ed::text || '/' || v_fremd_gast::text || '/photo/zz.jpg')::text end);

  -- 14 Bearbeiten
  perform partner_update_stage_guest(v_gast, p_first_name => 'ZZneu', p_job_title => 'Leitung Vertrieb');
  select p.first_name, sp.job_title into v_txt, v_det from speaker_profile sp join person p on p.id = sp.person_id where sp.id = v_gast;
  begin
    perform partner_update_stage_guest(v_gast, p_job_title => '  ');
    insert into t_res values ('14_bearbeiten', 'ALLOWED (BUG): leere Position');
  exception
    when sqlstate '22023' then insert into t_res values ('14_bearbeiten',
      case when sqlerrm = 'fields_required' and v_txt = 'ZZneu' and v_det = 'Leitung Vertrieb'
           then 'Name und Position geändert, leere Position abgewiesen (richtig)' else '22023 ' || sqlerrm || ' / ' || coalesce(v_txt, '') end);
    when others then insert into t_res values ('14_bearbeiten', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 15 Entfernen
  select count(*)::integer into v_n from session_speaker where session_id = v_se and person_id = v_gast_person;
  perform partner_remove_stage_guest(v_gast);
  select count(*)::integer into v_m from session_speaker where session_id = v_se and person_id = v_gast_person;
  insert into t_res values ('15_entfernen',
    case when v_n = 1 and v_m = 0 and not exists (select 1 from speaker_profile where id = v_gast)
              and exists (select 1 from person where id = v_gast_person)
         then 'Gastprofil und Zuordnung weg, Person bleibt (richtig)'
         else 'unerwartet: vorher=' || v_n || ' nachher=' || v_m end);

  -- 16 Rechte
  insert into t_res values ('16_rechte',
    case when not has_function_privilege('anon', 'partner_add_stage_guest(uuid, text, text, text, text, text, boolean, uuid)', 'execute')
              and not has_function_privilege('anon', 'partner_stage_guests(uuid, uuid)', 'execute')
              and not has_function_privilege('anon', 'partner_assign_stage_guest(uuid, uuid, boolean)', 'execute')
              and has_function_privilege('authenticated', 'partner_add_stage_guest(uuid, text, text, text, text, text, boolean, uuid)', 'execute')
              and has_function_privilege('authenticated', 'partner_remove_stage_guest(uuid)', 'execute')
              and not has_function_privilege('authenticated', 'partner_manages_stage_guest(uuid)', 'execute')
         then 'anon gesperrt, authenticated darf, Helfer intern (richtig)' else 'unerwartet' end);
end $$;
select * from t_res order by step;
rollback;
