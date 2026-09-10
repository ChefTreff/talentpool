-- Smoke-Test 0022: Admin-Lesewege (Bewerbungs-Queue, Rollen vergeben/entziehen, Personensuche).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_other uuid; v_ra uuid; v_ed uuid; v_ev uuid; v_sess uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  insert into person (first_name, last_name) values ('Anna', 'Testperson') returning id into v_other;
  insert into person_email (person_id, email, is_primary) values (v_other, 'anna-' || v_other::text || '@example.com', true);

  begin
    perform count(*) from search_people('Anna');
    insert into t_res values ('01_search_without_staff', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('01_search_without_staff', 'rejected ' || sqlstate); end;
  begin
    perform assign_role(v_other, 'speaker_manager', 'global');
    insert into t_res values ('02_assign_without_admin', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('02_assign_without_admin', 'rejected ' || sqlstate); end;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_ra := assign_role(v_other, 'speaker_manager', 'global', null, null, null, null, null, 'test');
  insert into t_res values ('03_assign_ok', (v_ra is not null)::text);
  insert into t_res values ('04_assign_idempotent', (assign_role(v_other, 'speaker_manager', 'global') = v_ra)::text);
  begin
    perform assign_role(v_other, 'nicht_existent', 'global');
    insert into t_res values ('05_invalid_role', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('05_invalid_role', 'rejected ' || sqlstate); end;
  begin
    perform assign_role(v_other, 'speaker_manager', 'edition');
    insert into t_res values ('06_edition_without_id', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_edition_without_id', 'rejected ' || sqlstate); end;
  insert into t_res values ('07_roles_of_person_active', (select count(*)::text from roles_of_person(v_other) where active));
  insert into t_res values ('08_search_as_admin', (select count(*)::text || ' email_sichtbar=' || coalesce(bool_and(email is not null)::text, '-') from search_people('testperson')));
  perform revoke_role(v_ra, 'test');
  insert into t_res values ('09_revoked_inactive', (select (not active)::text from roles_of_person(v_other) where id = v_ra));
  begin
    perform revoke_role((select id from role_assignment where person_id = v_pid and role = 'admin' and scope_type = 'global'));
    insert into t_res values ('10_last_admin_guard', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10_last_admin_guard', 'rejected ' || sqlerrm); end;

  insert into event (name, format_tag, is_edition, slug) values ('R Ed', 'edition', true, 'r-ed') returning id into v_ed;
  insert into event (name, format_tag, edition_id, slug) values ('R Summit', 'summit', v_ed, 'r-summit') returning id into v_ev;
  insert into session (event_id, title_de, format, access_mode, capacity) values (v_ev, 'MC Q', 'masterclass', 'application', 5) returning id into v_sess;
  insert into application (session_id, person_id, status, answers) values (v_sess, v_other, 'applied', '{"motivation": "x"}');
  insert into t_res values ('11_queue_as_admin', (select count(*)::text || ' name=' || coalesce(max(display_name), 'NULL') || ' profile=' || coalesce(max(profile::text), 'NULL') from applications_for_session(v_sess)));
  delete from role_assignment where person_id = v_pid;
  begin
    perform count(*) from applications_for_session(v_sess);
    insert into t_res values ('12_queue_without_role', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('12_queue_without_role', 'rejected ' || sqlstate); end;
  insert into t_res values ('13_overview_without_role', (select count(*)::text from applications_overview(v_ev)));
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'programme_team', 'edition', v_ed);
  insert into t_res values ('14_overview_as_team', (select count(*)::text || ' counts=' || coalesce(max(counts::text), '-') || ' released=' || coalesce(bool_or(released)::text, '-') from applications_overview(v_ev)));
  insert into t_res values ('15_audit_role_rows', (select count(*)::text from audit_log where action in ('role.assign', 'role.revoke')));
end $$;
select * from t_res order by step;
rollback;
