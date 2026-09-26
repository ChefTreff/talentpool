-- Smoke-Test (Masterclass: Goodies einsenden ja/nein, PART-054). Nummer offen.
-- Wegwerf-Organisationen und -Sessions, echte Partnerrolle des angemeldeten Kontos, alles
-- zurückgerollt. Belegt:
--   01 der Partner setzt `goodies_planned` an seiner veröffentlichten Masterclass — gespeichert,
--      und die Session bleibt veröffentlicht (keine erneute Freigabe);
--   02 `false` wird gespeichert, `null` entfernt die Angabe;
--   03 Text statt ja/nein → 22023 `invalid_format_details` (goodies_planned);
--   04 am Side-Event ist der Schlüssel nicht erlaubt (22023), dessen eigene Angaben gehen weiter;
--   05 die Masterclass einer fremden Organisation → 42501;
--   06 das Programm zeigt die Angabe nicht (`programme_format_details` hat keine Spalte dafür);
--   07 `format_detail_keys` und SECURITY DEFINER/search_path von `check_format_details`.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid; v_tz text; v_day uuid; v_datum date;
  v_raum uuid; v_slot uuid;
  v_org uuid; v_fremd uuid; v_mc uuid; v_se uuid; v_mc_fremd uuid;
  v_zurueck boolean; v_det jsonb; v_status text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  if v_pid is null then raise exception 'VORBEDINGUNG: keine Person mit Konto'; end if;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id, e.timezone into v_ev, v_tz from event e where e.edition_id = v_ed and e.format_tag = 'summit' order by e.start_date limit 1;
  select ed.id, ed.day_date into v_day, v_datum from event_day ed where ed.event_id = v_ev order by ed.sort_order limit 1;
  if v_ev is null or v_day is null then raise exception 'VORBEDINGUNG: Summit mit Tagen fehlt'; end if;
  -- Veröffentlichen verlangt einen Slot (Bühne oder Raum).
  insert into stage (event_id, name, type, active) values (v_ev, 'ZZ Goodies-Raum', 'room', true) returning id into v_raum;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
    values (v_raum, v_day, (v_datum + time '10:00') at time zone v_tz, (v_datum + time '11:00') at time zone v_tz, 'content', 'final')
    returning id into v_slot;

  insert into organization (legal_name) values ('ZZ Goodies GmbH') returning id into v_org;
  insert into organization (legal_name) values ('ZZ Fremde Goodies GmbH') returning id into v_fremd;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited'), (v_fremd, v_ed, 'invited');
  insert into org_membership (person_id, org_id, roles) values (v_pid, v_org, '{additional}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pid, 'partner_contact', 'org', v_org);
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, description_en, access_mode, publish_status, tags, partner_org_id, host_org_id, language)
    values (v_ev, v_slot, 'masterclass', 'ZZ Masterclass', 'ZZ Masterclass', 'ZZ Beschreibung', 'ZZ Description', 'application', 'published', '{}', v_org, v_org, 'de')
    returning id into v_mc;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags, partner_org_id, host_org_id)
    values (v_ev, 'side_event', 'ZZ Side-Event', 'application', 'draft', '{}', v_org, v_org) returning id into v_se;
  insert into session (event_id, format, title_de, access_mode, publish_status, tags, partner_org_id, host_org_id)
    values (v_ev, 'masterclass', 'ZZ Fremde Masterclass', 'application', 'draft', '{}', v_fremd, v_fremd) returning id into v_mc_fremd;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  if not partner_can_edit(v_org) then raise exception 'VORBEDINGUNG: Konto darf die Organisation nicht bearbeiten'; end if;

  -- 01 Ja, und die Session bleibt veröffentlicht
  v_zurueck := partner_update_session(v_mc, jsonb_build_object('format_details', jsonb_build_object('goodies_planned', true)));
  select format_details, publish_status into v_det, v_status from session where id = v_mc;
  insert into t_res values ('01_ja',
    case when v_det = '{"goodies_planned": true}'::jsonb and v_zurueck = false and v_status = 'published'
         then 'gespeichert, bleibt veröffentlicht (richtig)'
         else 'unerwartet: ' || coalesce(v_det::text, 'null') || ', zurück ' || v_zurueck || ', ' || v_status end);

  -- 02 Nein, dann keine Angabe
  perform partner_update_session(v_mc, jsonb_build_object('format_details', jsonb_build_object('goodies_planned', false)));
  select format_details into v_det from session where id = v_mc;
  insert into t_res values ('02a_nein',
    case when v_det = '{"goodies_planned": false}'::jsonb then 'false gespeichert (richtig)' else 'unerwartet: ' || coalesce(v_det::text, 'null') end);
  perform partner_update_session(v_mc, '{"format_details": {"goodies_planned": null}}'::jsonb);
  select format_details into v_det from session where id = v_mc;
  insert into t_res values ('02b_keine_angabe',
    case when v_det = '{}'::jsonb then 'null entfernt die Angabe (richtig)' else 'unerwartet: ' || coalesce(v_det::text, 'null') end);

  -- 03 Text statt ja/nein
  begin
    perform partner_update_session(v_mc, '{"format_details": {"goodies_planned": "ja"}}'::jsonb);
    insert into t_res values ('03_text', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then
      insert into t_res values ('03_text', case when sqlerrm = 'invalid_format_details' then '22023 invalid_format_details (richtig)' else '22023 ' || sqlerrm end);
    when others then insert into t_res values ('03_text', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 Side-Event: Schlüssel nicht erlaubt, eigene Angaben gehen weiter
  begin
    perform partner_update_session(v_se, '{"format_details": {"goodies_planned": true}}'::jsonb);
    insert into t_res values ('04a_side_event', 'ALLOWED (BUG)');
  exception
    when sqlstate '22023' then insert into t_res values ('04a_side_event', '22023 (richtig)');
    when others then insert into t_res values ('04a_side_event', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
  perform partner_update_session(v_se, '{"format_details": {"location_text": "ZZ Halle 2"}}'::jsonb);
  select format_details into v_det from session where id = v_se;
  insert into t_res values ('04b_side_event_ort',
    case when v_det->>'location_text' = 'ZZ Halle 2' then 'Ort gespeichert (richtig)' else 'BUG: ' || coalesce(v_det::text, 'null') end);

  -- 05 fremde Organisation
  begin
    perform partner_update_session(v_mc_fremd, '{"format_details": {"goodies_planned": true}}'::jsonb);
    insert into t_res values ('05_fremd', 'ALLOWED (BUG)');
  exception
    when sqlstate '42501' then insert into t_res values ('05_fremd', '42501 (richtig)');
    when others then insert into t_res values ('05_fremd', 'UNERWARTET: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

insert into t_res
select '06_programm',
       case when pg_get_function_result('programme_format_details()'::regprocedure) like '%goodies%'
            then 'BUG: Programm zeigt die Angabe'
            else 'keine Spalte im Programm (richtig)' end;

insert into t_res
select '07_funktionen',
       case when format_detail_keys('masterclass') <> array['goodies_planned'] then 'BUG: format_detail_keys ' || format_detail_keys('masterclass')::text
            when format_detail_keys('side_event') <> array['location_text', 'image_asset_id'] then 'BUG: side_event verändert'
            when not p.prosecdef then 'BUG: check_format_details nicht SECURITY DEFINER'
            when not coalesce(p.proconfig::text like '%search_path=public, extensions%', false) then 'BUG: search_path nicht fest'
            else 'Schlüssel und Rechte stimmen (richtig)' end
  from pg_proc p
 where p.oid = 'check_format_details(text, jsonb, uuid)'::regprocedure;

select * from t_res order by step;
rollback;
