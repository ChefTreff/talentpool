-- Test „Schichtmodell Volunteers“ (VOL-002, v6_volunteers_schichtmodell.sql). Belegt:
--   01 Tabellen ohne Grants; die 15 Bereiche aus S1 stehen im Vokabular; anon ohne EXECUTE;
--   02 Vorlagen: Team legt an, Fremde 42501, unbekannter Bereich 22023, gleiche Zeiten 22023
--      invalid_times, Löschen einer unbekannten Vorlage P0002; Audit;
--   03 Anwenden: eine Schicht je Vorlage und Tag (Vorlage mit anderem Wochentag entsteht nicht), zweites Anwenden legt nichts doppelt an;
--      Ende vor Beginn ⇒ Folgetag; Zeiten in der Zone des Events; Fremdtag ⇒ P0002;
--   04 Sicherheitsunterweisung: Bestätigen der Schicht ohne Unterweisung ⇒ P0001
--      safety_ack_required, danach geht es; nicht angenommen ⇒ not_accepted; Audit ohne E-Mail;
--   05 Wünsche: 0 ⇒ wish_required, 6 ⇒ too_many_wishes, fremde Schicht ⇒ shift_not_found, nicht
--      angenommen ⇒ not_accepted; Rangfolge bleibt; Team sieht Wünsche, Bereichstreffer und
--      „ohne Wunsch“; Volunteer sieht den eigenen Rang in wishable_shifts, Fremde keine Team-Listen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_me uuid; v_uid uuid; v_staff uuid; v_staff_uid uuid; v_other uuid; v_other_uid uuid;
        v_ed uuid; v_day uuid; v_zone text; v_date date; v_fremd uuid; v_fremdtag uuid;
        v_t1 uuid; v_t2 uuid; v_t3 uuid; v_s text; v_n integer; r record; v_a uuid; v_ids uuid[] := '{}'; v_sid uuid; i integer;
begin
  select p.id, p.auth_user_id into v_me, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_staff, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  select p.id, p.auth_user_id into v_other, v_other_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 2 limit 1;
  delete from role_assignment where person_id in (v_me, v_staff, v_other);
  insert into role_assignment (person_id, role, scope_type) values (v_staff, 'area_lead_volunteers', 'global');
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select d.id, d.day_date, coalesce(e.timezone, 'Europe/Berlin') into v_day, v_date, v_zone
    from event_day d join event e on e.id = d.event_id where e.id = v_ed or e.edition_id = v_ed order by d.day_date, d.sort_order limit 1;
  if v_day is null then
    insert into event_day (event_id, day_date, label_de, label_en, sort_order) values (v_ed, current_date + 30, 'Testtag', 'Test day', 99)
    returning id, day_date into v_day, v_date;
    v_zone := coalesce((select timezone from event where id = v_ed), 'Europe/Berlin');
  end if;
  insert into event (name, slug, format_tag, is_edition, start_date) values ('Fremd (Test)', 'fremd-vol002', 'club_event', false, current_date) returning id into v_fremd;
  insert into event_day (event_id, day_date, label_de, label_en, sort_order) values (v_fremd, current_date, 'Fremdtag', 'Foreign day', 1) returning id into v_fremdtag;

  insert into volunteer_profile (person_id, edition_id, status, areas) values (v_me, v_ed, 'accepted', array['stage_management'])
  on conflict (person_id, edition_id) do update set status = 'accepted', areas = array['stage_management'], safety_ack_at = null, safety_ack_version = null;
  insert into volunteer_profile (person_id, edition_id, status, areas) values (v_other, v_ed, 'accepted', array['accreditation'])
  on conflict (person_id, edition_id) do update set status = 'accepted', areas = array['accreditation'], safety_ack_at = null, safety_ack_version = null;
  delete from shift_wish where person_id in (v_me, v_other);
  delete from shift_assignment where person_id in (v_me, v_other);

  -- 01
  insert into t_res values ('01_grants_vokabular',
    case when not has_table_privilege('authenticated', 'shift_template', 'select')
          and not has_table_privilege('authenticated', 'shift_wish', 'select')
          and (select count(*) from vocab_term where vocabulary = 'volunteer_area' and key in
               ('stage_management','accreditation','access_control','construction','sustainability','speakers_care','speaker_lounge',
                'cloakroom','info_point','marketing','masterclasses','hackathon','afterparty','production_help','event_operations')) = 15
          and not has_function_privilege('anon', 'upsert_shift_template(jsonb)', 'execute')
          and not has_function_privilege('anon', 'set_my_shift_wishes(uuid[],uuid)', 'execute')
          and not has_function_privilege('anon', 'ack_volunteer_safety(text,uuid)', 'execute')
         then 'ok' else 'FEHLER' end);

  -- 02 Vorlagen
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform upsert_shift_template(jsonb_build_object('edition_id', v_ed, 'area', 'stage_management', 'position', 'ZZ Pos', 'start_time', '09:00', 'end_time', '13:00'));
    v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform shift_templates(v_ed); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform upsert_shift_template(jsonb_build_object('edition_id', v_ed, 'area', 'gibt_es_nicht', 'position', 'ZZ', 'start_time', '09:00', 'end_time', '13:00'));
    v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '22023' and sqlerrm = 'invalid_area' then '/ok' else '/' || sqlstate end; end;
  begin perform upsert_shift_template(jsonb_build_object('edition_id', v_ed, 'area', 'stage_management', 'position', 'ZZ', 'start_time', '09:00', 'end_time', '09:00'));
    v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlerrm = 'invalid_times' then '/ok' else '/' || sqlstate end; end;
  begin perform delete_shift_template(gen_random_uuid());
    v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  v_t1 := upsert_shift_template(jsonb_build_object('edition_id', v_ed, 'area', 'stage_management', 'position', 'ZZ Bühne A', 'start_time', '09:00', 'end_time', '13:00', 'capacity', 4, 'briefing_md', 'ZZ Briefing'));
  v_t2 := upsert_shift_template(jsonb_build_object('edition_id', v_ed, 'area', 'afterparty', 'position', 'ZZ Nacht', 'start_time', '22:00', 'end_time', '02:00', 'capacity', 2,
                                                  'weekday', extract(isodow from v_date)::integer));
  v_t3 := upsert_shift_template(jsonb_build_object('edition_id', v_ed, 'area', 'afterparty', 'position', 'ZZ Anderer Tag', 'start_time', '10:00', 'end_time', '12:00',
                                                  'weekday', (extract(isodow from v_date)::integer % 7) + 1));
  insert into t_res values ('02_vorlagen',
    case when v_s = 'ok/ok/ok/ok/ok'
          and (select count(*) from shift_templates(v_ed) t where t.position like 'ZZ%') = 3
          and exists (select 1 from audit_log a where a.action = 'volunteer.upsert_shift_template' and a.object_id = v_t1::text)
         then 'ok' else v_s end);

  -- 03 Anwenden
  v_n := apply_shift_templates(array[v_t1, v_t2, v_t3], array[v_day], v_ed);
  select s.* into r from shift s where s.template_id = v_t2 and s.event_day_id = v_day;
  v_s := '';
  begin perform apply_shift_templates(array[v_t1], array[v_fremdtag], v_ed); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = 'P0002' then 'ok' else sqlstate end; end;
  insert into t_res values ('03_anwenden',
    case when v_n = 2 and apply_shift_templates(array[v_t1, v_t2, v_t3], array[v_day], v_ed) = 0
          and (select count(*) from shift where template_id in (v_t1, v_t2, v_t3)) = 2
          and r.start_at = (v_date + time '22:00') at time zone v_zone
          and r.end_at = (v_date + time '02:00' + interval '1 day') at time zone v_zone
          and (select briefing_md from shift where template_id = v_t1) = 'ZZ Briefing'
          and (select capacity from shift where template_id = v_t1) = 4
          and v_s = 'ok'
          and exists (select 1 from audit_log a where a.action = 'volunteer.apply_shift_templates' and a.object_id = v_ed::text)
         then 'ok' else 'n=' || v_n || ' ' || v_s end);

  -- 04 Sicherheitsunterweisung
  select s.id into v_sid from shift s where s.template_id = v_t1;
  v_a := assign_shift(v_sid, v_me, 'assigned');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform confirm_shift(v_a); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlerrm = 'safety_ack_required' then 'ok' else sqlstate || sqlerrm end; end;
  perform ack_volunteer_safety('2027-1', v_ed);
  perform confirm_shift(v_a);
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform ack_volunteer_safety('2027-1', v_ed); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlerrm = 'not_accepted' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('04_unterweisung',
    case when v_s = 'ok/ok'
          and (select status from shift_assignment where id = v_a) = 'confirmed'
          and (select safety_ack_version from volunteer_profile where person_id = v_me and edition_id = v_ed) = '2027-1'
          and exists (select 1 from audit_log a where a.action = 'volunteer.safety_ack' and a.actor_person_id = v_me
                       and a.after::text not like '%@%')
         then 'ok' else v_s end);

  -- 05 Wünsche: sechs aktive Schichten
  for i in 1..6 loop
    insert into shift (edition_id, event_day_id, area, position, start_at, end_at, capacity, active)
    values (v_ed, v_day, 'hackathon', 'ZZ Wunsch ' || i, now() + (i || ' hours')::interval + interval '400 days', now() + ((i + 1) || ' hours')::interval + interval '400 days', 2, true)
    returning id into v_sid;
    v_ids := v_ids || v_sid;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform set_my_shift_wishes('{}'::uuid[], v_ed); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlerrm = 'wish_required' then 'ok' else sqlstate end; end;
  begin perform set_my_shift_wishes(v_ids, v_ed); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlerrm = 'too_many_wishes' then '/ok' else '/' || sqlstate end; end;
  begin perform set_my_shift_wishes(array[gen_random_uuid()], v_ed); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  perform set_my_shift_wishes(array[v_ids[3], v_ids[1], v_ids[3]], v_ed);                 -- doppelte Id zählt einmal
  select count(*) into v_n from shift_wish where person_id = v_me;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform set_my_shift_wishes(array[v_ids[1]], v_ed); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlerrm = 'not_accepted' then '/ok' else '/' || sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  insert into t_res values ('05_wuensche',
    case when v_s = 'ok/ok/ok/ok' and v_n = 2
          and (select wish_rank from wishable_shifts(v_ed) w where w.id = v_ids[3]) = 1
          and (select wish_rank from wishable_shifts(v_ed) w where w.id = v_ids[1]) = 2
          and (select wish_rank from wishable_shifts(v_ed) w where w.id = v_ids[2]) is null
         then 'ok' else v_s || ' n=' || v_n end);

  -- 06 Team-Sicht
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  select count(*) into v_n from shift_wishes(v_ed) w where w.person_id = v_me;
  insert into t_res values ('06_team_sicht',
    case when v_n = 2
          and (select rank from shift_wishes(v_ed) w where w.person_id = v_me and w.shift_id = v_ids[3]) = 1
          and exists (select 1 from volunteers_without_wish(v_ed) x where x.person_id = v_other)
          and not exists (select 1 from volunteers_without_wish(v_ed) x where x.person_id = v_me)
          and exists (select 1 from volunteers_without_safety_ack(v_ed) x where x.person_id = v_other)
          and not exists (select 1 from volunteers_without_safety_ack(v_ed) x where x.person_id = v_me)
          and (select assignment_status from shift_wishes(v_ed) w where w.person_id = v_me limit 1) is null
         then 'ok' else 'n=' || v_n end);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform shift_wishes(v_ed); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform volunteers_without_wish(v_ed); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  begin perform apply_shift_templates(array[v_t1], array[v_day], v_ed); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  begin perform volunteers_without_safety_ack(v_ed); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('07_fremde_ohne_team_rechte', case when v_s = 'ok/ok/ok/ok' then 'ok' else v_s end);
end $$;
select * from t_res order by step;
rollback;
