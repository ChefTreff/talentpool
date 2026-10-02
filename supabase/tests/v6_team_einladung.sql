-- Test zu `v6_team_einladung` (QS-056). Belegt:
--   01 ohne Abschnitt access 42501 (Teamrolle);
--   02 neues Teammitglied: Person, Adresse, zwei Rollen für die Edition, Audit;
--   03 zweiter Aufruf mit derselben Adresse: keine zweite Person, keine doppelte Rolle,
--      neue Rolle kommt dazu;
--   04 admin über das Formular ⇒ invalid_role; Rolle ausserhalb der Team-Rollen
--      (partner_contact) ⇒ invalid_role; leere Rollen ⇒ roles_required; Name fehlt ⇒
--      name_required; Adresse kaputt ⇒ invalid_email;
--   05 gesperrte Person ⇒ access_blocked, keine Rolle vergeben.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_me uuid; v_uid uuid; v_email text; v_ed uuid; v_j jsonb; v_txt text; v_p uuid; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select id into v_ed from event where is_edition order by start_date desc limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform create_team_member('Ada', 'ZZTEST', 'zztest-team@example.org', array['partner_team'], v_ed); v_txt := 'ERLAUBT';
  exception when sqlstate '42501' then v_txt := '42501'; end;
  insert into t_res values ('01_ohne_access', v_txt || ' (erwartet 42501)');

  perform set_config('request.jwt.claims', '', true);
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  v_j := create_team_member(' Ada ', 'ZZTEST', ' ZZTEST-Team@Example.org ', array['partner_team', 'marketing_team'], v_ed);
  v_p := (v_j->>'person_id')::uuid;
  select string_agg(role, ',' order by role) into v_txt from role_assignment where person_id = v_p and edition_id = v_ed;
  insert into t_res values ('02_neu', 'neu=' || (v_j->>'created') || ' email=' || (v_j->>'email') || ' rollen=' || coalesce(v_txt, '-')
    || ' audit=' || (select count(*) from audit_log where action = 'access.team_member' and object_id = v_p::text)
    || ' (erwartet neu=true email=zztest-team@example.org rollen=marketing_team,partner_team audit=1)');

  v_j := create_team_member('Ada', 'ZZTEST', 'zztest-team@example.org', array['partner_team', 'programme_team'], v_ed);
  select count(*) into v_n from person_email where lower(email::text) = 'zztest-team@example.org';
  select string_agg(role, ',' order by role) into v_txt from role_assignment where person_id = v_p and edition_id = v_ed;
  insert into t_res values ('03_wiederholt', 'personen=' || v_n || ' gleiche=' || ((v_j->>'person_id')::uuid = v_p)::text
    || ' vergeben=' || (v_j->'roles')::text || ' rollen=' || v_txt
    || ' (erwartet personen=1 gleiche=true vergeben=["programme_team"] rollen=marketing_team,partner_team,programme_team)');

  v_txt := '';
  begin perform create_team_member('A', 'Z', 'zztest-x@example.org', array['admin'], v_ed); v_txt := v_txt || 'admin=ANGENOMMEN '; exception when sqlstate '22023' then v_txt := v_txt || 'admin=' || sqlerrm || ' '; end;
  begin perform create_team_member('A', 'Z', 'zztest-x@example.org', array['partner_contact'], v_ed); v_txt := v_txt || 'extern=ANGENOMMEN '; exception when sqlstate '22023' then v_txt := v_txt || 'extern=' || sqlerrm || ' '; end;
  begin perform create_team_member('A', 'Z', 'zztest-x@example.org', array[]::text[], v_ed); v_txt := v_txt || 'leer=ANGENOMMEN '; exception when sqlstate '22023' then v_txt := v_txt || 'leer=' || sqlerrm || ' '; end;
  begin perform create_team_member('', 'Z', 'zztest-x@example.org', array['partner_team'], v_ed); v_txt := v_txt || 'name=ANGENOMMEN '; exception when sqlstate '22023' then v_txt := v_txt || 'name=' || sqlerrm || ' '; end;
  begin perform create_team_member('A', 'Z', 'keine-adresse', array['partner_team'], v_ed); v_txt := v_txt || 'mail=ANGENOMMEN'; exception when sqlstate '22023' then v_txt := v_txt || 'mail=' || sqlerrm; end;
  insert into t_res values ('04_abgewiesen', v_txt || ' x_angelegt=' || (select count(*) from person_email where lower(email::text) = 'zztest-x@example.org')
    || ' (erwartet admin=invalid_role extern=invalid_role leer=roles_required name=name_required mail=invalid_email x_angelegt=0)');

  perform set_config('request.jwt.claims', '', true);
  update person set access_blocked_at = now() where id = v_p;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin perform create_team_member('Ada', 'ZZTEST', 'zztest-team@example.org', array['hackathon_team'], v_ed); v_txt := 'ANGENOMMEN';
  exception when sqlstate 'P0001' then v_txt := sqlerrm; end;
  insert into t_res values ('05_gesperrt', v_txt || ' hackathon=' || (select count(*) from role_assignment where person_id = v_p and role = 'hackathon_team')
    || ' (erwartet access_blocked hackathon=0)');
end $$;
select * from t_res order by step;
rollback;
