-- Smoke-Test 0030: Hospitality — Freischaltung (Status + Consent), Tier-Regel, Kapazität/Warteliste, Storno mit Nachrücken, Team-Bestätigung + Mail.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_sp uuid; v_q_std uuid; v_q_vip uuid; v_q_shuttle uuid; v_json jsonb; v_b1 uuid; v_b2 uuid; v_other uuid; v_sp2 uuid; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  select id into v_q_std from hospitality_quota where edition_id = v_ed and tier = 'standard';
  select id into v_q_vip from hospitality_quota where edition_id = v_ed and tier = 'vip';
  select id into v_q_shuttle from hospitality_quota where edition_id = v_ed and kind = 'shuttle' order by sort_order limit 1;
  insert into t_res values ('01_seed', (select count(*)::text || ' aktiv=' || count(*) filter (where active)::text from hospitality_quota where edition_id = v_ed));

  -- Testperson als Speaker (Standard-Tier), noch nicht freigeschaltet
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_sp := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_pid, 'speaker_type', 'keynote'));
  delete from role_assignment where person_id = v_pid and role = 'admin';
  insert into t_res values ('02_options_blocked_status', (select count(*)::text || ' eligible=' || coalesce(bool_and(eligible)::text, '-') || ' reason=' || coalesce(max(block_reason), '-') from hospitality_options()));
  begin
    perform book_hospitality(v_q_std, '{"check_in": "2027-04-15", "check_out": "2027-04-18"}'::jsonb);
    insert into t_res values ('03_book_without_status', 'ALLOWED (BUG)');
  exception when others then get stacked diagnostics v_detail = pg_exception_detail; insert into t_res values ('03_book_without_status', 'rejected ' || sqlerrm || ' detail=' || coalesce(v_detail, '')); end;
  update speaker_profile set hospitality_status = 'eligible' where id = v_sp;
  begin
    perform book_hospitality(v_q_std, '{}'::jsonb);
    insert into t_res values ('04_book_without_consent', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_book_without_consent', 'rejected ' || sqlerrm); end;
  insert into consent_record (person_id, consent_type, version, granted, source) values (v_pid, 'hospitality_data', 'test', true, 'portal');
  insert into t_res values ('05_options_visible', (select count(*)::text || ' tiers=' || string_agg(coalesce(tier, kind), ',' order by tier) from hospitality_options()));
  begin
    perform book_hospitality(v_q_vip, '{}'::jsonb);
    insert into t_res values ('06_vip_for_standard', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_vip_for_standard', 'rejected ' || sqlstate); end;
  v_json := book_hospitality(v_q_std, '{"check_in": "2027-04-15", "check_out": "2027-04-18", "room_type": "single"}'::jsonb, 1);
  v_b1 := (v_json->>'id')::uuid;
  insert into t_res values ('07_booked', (v_json->>'status') || ' profile=' || (select hospitality_status from speaker_profile where id = v_sp));
  begin
    perform book_hospitality(v_q_std, '{}'::jsonb);
    insert into t_res values ('08_second_hotel', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_second_hotel', 'rejected ' || sqlerrm); end;
  insert into t_res values ('09_my_hospitality', (select count(*)::text || ' status=' || max(status) from my_hospitality()));

  -- Warteliste: Kapazität auf 1 senken, zweiter Speaker bucht
  update hospitality_quota set capacity = 1 where id = v_q_std;
  insert into person (first_name, last_name) values ('Zweiter', 'Speaker') returning id into v_other;
  insert into person_email (person_id, email, is_primary) values (v_other, 'zweiter-' || v_other::text || '@example.com', true);
  insert into speaker_profile (person_id, edition_id, speaker_type, hospitality_status, created_by) values (v_other, v_ed, 'panelist', 'eligible', v_pid) returning id into v_sp2;
  insert into consent_record (person_id, consent_type, version, granted, source) values (v_other, 'hospitality_data', 'test', true, 'portal');
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q_std, v_sp2, 'hotel', 'waitlisted', 1, v_other) returning id into v_b2;
  insert into t_res values ('10_used_free', (select used::text || '/' || capacity::text || ' free=' || free::text from hospitality_options() where quota_id = v_q_std));

  -- Storno: Wartender rückt nach (requested), Status zurück auf eligible
  perform cancel_hospitality(v_b1);
  insert into t_res values ('11_cancel_promotes', (select status from hospitality_booking where id = v_b2) || ' mine=' || (select status from hospitality_booking where id = v_b1) || ' profile=' || (select hospitality_status from speaker_profile where id = v_sp));

  -- Team bestätigt (Speaker darf nicht)
  begin
    perform confirm_hospitality(v_b2, 'ok');
    insert into t_res values ('12_confirm_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('12_confirm_as_speaker', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  perform confirm_hospitality(v_b2, 'Zimmer 101');
  insert into t_res values ('13_confirmed', (select status || ' note=' || coalesce(team_note, '-') from hospitality_booking where id = v_b2) || ' profile=' || (select hospitality_status from speaker_profile where id = v_sp2));
  insert into t_res values ('14_mail_queued', (select count(*)::text || ' locale=' || max(locale) || ' label=' || max(meta->'vars'->>'quota_label') from mail_log where template_key = 'hospitality_confirmed' and related_id = v_b2));
  insert into t_res values ('15_admin_overview', (select count(*)::text || ' bookings_std=' || (select jsonb_array_length(bookings) from hospitality_admin_overview(v_ed) where quota_id = v_q_std)::text from hospitality_admin_overview(v_ed)));
  perform upsert_hospitality_quota(jsonb_build_object('id', v_q_shuttle, 'active', true, 'capacity', 2));
  insert into t_res values ('16_shuttle_active', (select active::text || ' cap=' || capacity::text from hospitality_quota where id = v_q_shuttle));
  v_json := book_hospitality(v_q_shuttle, '{"pickup_location": "Radisson"}'::jsonb, 2);
  insert into t_res values ('17_shuttle_booked', (v_json->>'status'));
  insert into hospitality_booking (quota_id, profile_id, kind, status, guests, created_by) values (v_q_shuttle, v_sp2, 'shuttle', 'requested', 1, v_other);
  insert into t_res values ('18_shuttle_over_capacity_counts_guests', (select used::text || '/' || capacity::text from hospitality_options() where quota_id = v_q_shuttle));
  insert into t_res values ('19_audit', (select count(*)::text from audit_log where action like 'hospitality.%'));
end $$;
select * from t_res order by step;
rollback;
