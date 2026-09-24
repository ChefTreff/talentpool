-- Test „Format-Details für Teilnehmende" (TAL-002/003, vorschlag/v6_format_details_public.sql).
-- Belegt:
--   01 Side-Event: Ort, Gastgeber, Bildpfad (Partner-Datei); abgelehntes Bild fehlt;
--   02 Interview Table: Stellentitel, Link, Modus, gesuchte Profile;
--   03 Company Tour über company_tour.session_id: Sammelpunkt und Stopps mit Adresse und
--      Hinweisen — **ohne** contact_* und ohne interne Notiz;
--   04 Entwurfs-Session und Keynote erscheinen nicht;
--   05 ohne Person 28000; anon ohne EXECUTE; company_tour.session_id eindeutig.
--
-- Probelauf der Build-Session am 25.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurueckgerollt, Wegwerf-Edition): 5 von 5 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ed uuid; v_org uuid; v_oe uuid; v_img uuid; v_img2 uuid;
  v_se uuid; v_se2 uuid; v_it uuid; v_ct uuid; v_draft uuid; v_key uuid; v_tour uuid; r record; v_s text;
  v_day uuid; v_st uuid; v_i integer := 0; v_sid uuid;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null limit 1;
  insert into event (name, format_tag, is_edition, slug) values ('Format-Test-Edition', 'edition', true, 'format-test-ed') returning id into v_ed;
  insert into organization (legal_name, communication_name, type) values ('Format Test GmbH', 'FormatTest', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into partner_asset (org_edition_id, kind, storage_path, filename, status)
    values (v_oe, 'side_event_image', v_ed || '/' || v_org || '/side_event_image/bild.jpg', 'bild.jpg', 'accepted') returning id into v_img;
  insert into partner_asset (org_edition_id, kind, storage_path, filename, status)
    values (v_oe, 'side_event_image', v_ed || '/' || v_org || '/side_event_image/abgelehnt.jpg', 'abgelehnt.jpg', 'rejected') returning id into v_img2;

  insert into session (event_id, title_de, title_en, description_de, format, access_mode, host_org_id, format_details)
    values (v_ed, 'Side', 'Side', 'x', 'side_event', 'application', v_org,
            jsonb_build_object('location_text', 'Hafen 1', 'image_asset_id', v_img)) returning id into v_se;
  insert into session (event_id, title_de, title_en, description_de, format, access_mode, host_org_id, format_details)
    values (v_ed, 'Side 2', 'Side 2', 'x', 'side_event', 'application', v_org,
            jsonb_build_object('image_asset_id', v_img2)) returning id into v_se2;
  insert into session (event_id, title_de, title_en, description_de, format, access_mode, host_org_id, format_details)
    values (v_ed, 'Tisch', 'Table', 'x', 'interview_table', 'application', v_org,
            jsonb_build_object('job_title', 'Werkstudent Data', 'job_posting_url', 'https://example.com/job',
                               'interview_mode', 'single', 'target_profile', jsonb_build_object('occupation_status', jsonb_build_array('master')))) returning id into v_it;
  insert into session (event_id, title_de, title_en, description_de, format, access_mode)
    values (v_ed, 'Tour', 'Tour', 'x', 'company_tour', 'application') returning id into v_ct;
  insert into session (event_id, title_de, format, access_mode) values (v_ed, 'Entwurf', 'masterclass', 'application') returning id into v_draft;
  insert into session (event_id, title_de, title_en, description_de, format, access_mode)
    values (v_ed, 'Keynote', 'Keynote', 'x', 'keynote', 'open') returning id into v_key;
  -- Veröffentlichen braucht einen Slot: je Session einer auf der Wegwerf-Bühne.
  insert into event_day (event_id, day_date) values (v_ed, date '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug) values (v_ed, 'Format-Bühne', 'format-buehne-test') returning id into v_st;
  foreach v_sid in array array[v_se, v_se2, v_it, v_ct, v_key] loop
    v_i := v_i + 1;
    insert into slot (stage_id, event_day_id, start_at, end_at)
      values (v_st, v_day, timestamptz '2027-04-16 09:00+02' + v_i * interval '1 hour',
              timestamptz '2027-04-16 09:30+02' + v_i * interval '1 hour')
      returning id into r;
  end loop;
  v_i := 0;
  for r in select sl.id, row_number() over (order by sl.start_at) as n from slot sl where sl.stage_id = v_st loop
    update session set slot_id = r.id where id = (array[v_se, v_se2, v_it, v_ct, v_key])[r.n];
  end loop;
  update session set publish_status = 'published' where id in (v_se, v_se2, v_it, v_ct, v_key);

  insert into company_tour (edition_id, name, session_id, notes) values (v_ed, 'Finance-Test', v_ct, 'INTERN') returning id into v_tour;
  insert into company_tour_stop (tour_id, sort_order, host_org_id, address, contact_name, contact_email, notes_public)
    values (v_tour, 1, v_org, 'Jungfernstieg 1', 'Geheim Kontakt', 'kontakt@example.com', 'Bitte Ausweis mitbringen');

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01
  select * into r from programme_format_details() d where d.session_id = v_se;
  v_s := case when r.location_text = 'Hafen 1' and r.host_name = 'FormatTest' and r.image_path like '%/bild.jpg' then 'ok' else coalesce(r::text, 'leer') end;
  select * into r from programme_format_details() d where d.session_id = v_se2;
  insert into t_res values ('01_side_event', case when v_s = 'ok' and r.image_path is null then 'ok' else v_s || ' / abgelehnt: ' || coalesce(r.image_path, 'null') end);

  -- 02
  select * into r from programme_format_details() d where d.session_id = v_it;
  insert into t_res values ('02_interview_table',
    case when r.job_title = 'Werkstudent Data' and r.job_posting_url = 'https://example.com/job' and r.interview_mode = 'single'
          and r.target_profile->'occupation_status' ? 'master' then 'ok' else coalesce(r::text, 'leer') end);

  -- 03
  select * into r from programme_format_details() d where d.session_id = v_ct;
  insert into t_res values ('03_company_tour',
    case when r.tour->>'name' = 'Finance-Test'
          and r.tour->'stops'->0->>'address' = 'Jungfernstieg 1'
          and r.tour->'stops'->0->>'notes_public' = 'Bitte Ausweis mitbringen'
          and r.tour::text !~* '(contact|kontakt@|Geheim|INTERN)'
         then 'ok' else coalesce(r.tour::text, 'leer') end);

  -- 04
  insert into t_res values ('04_nur_veroeffentlicht_und_formate',
    case when not exists (select 1 from programme_format_details() d where d.session_id in (v_draft, v_key)) then 'ok' else 'ALLOWED (BUG)' end);

  -- 05
  perform set_config('request.jwt.claims', null, true);
  begin perform * from programme_format_details(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '28000' then 'ok' else sqlstate end; end;
  begin
    insert into company_tour (edition_id, name, session_id) values (v_ed, 'Zweite Tour', v_ct);
    v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '23505' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('05_grants_eindeutig',
    case when v_s = 'ok/ok' and not has_function_privilege('anon', 'programme_format_details()', 'execute') then 'ok' else v_s end);
end $$;
select * from t_res order by step;
rollback;
