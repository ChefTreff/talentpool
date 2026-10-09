-- Test zu `v6_team_zugaenge_zusammen` (ADM-094). Belegt:
--   01 `team_members()` gibt es nicht mehr;
--   02 der Abschnitt `team` ist aus `admin_section_role` verschwunden, `has_admin_section('team')` scheitert laut (22023);
--   03 es liegt keine Ausnahme mehr auf `team`;
--   04 der Abschnitt `access` ist unverändert: admin darf, `talent_team` nicht (42501 an `team_access_list`);
--   05 `team_access_list` mit Filter `team` liefert weiter die Teamrolle (Ersatz der alten Liste) — mit Gesperrten.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_me uuid; v_uid uuid; v_email text; v_n integer; v_a uuid; v_b uuid; v_ua uuid := gen_random_uuid();
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'admin', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into t_res values ('01_team_members_weg',
    case when to_regprocedure('team_members()') is null then 'Funktion entfallen (richtig)' else 'noch da (BUG)' end);

  select count(*)::integer into v_n from admin_section_role where section = 'team';
  begin
    perform has_admin_section('team');
    insert into t_res values ('02_abschnitt_team', 'ERLAUBT (BUG) / Zeilen ' || v_n);
  exception when others then
    insert into t_res values ('02_abschnitt_team',
      case when sqlstate = '22023' and v_n = 0 then 'entfallen, laut abgewiesen 22023 (richtig)'
           else 'unerwartet ' || sqlstate || ' / Zeilen ' || v_n end);
  end;

  select count(*)::integer into v_n from admin_section_override where section = 'team';
  insert into t_res values ('03_keine_ausnahme', case when v_n = 0 then 'keine Ausnahme auf team (richtig)' else 'Ausnahmen übrig ' || v_n end);

  insert into t_res values ('04a_access_admin',
    case when has_admin_section('access') then 'admin öffnet access (richtig)' else 'zu (BUG)' end);

  -- 05 · Ersatz der alten Liste: Teamrolle sichtbar, auch gesperrt.
  insert into auth.users (id, email, aud, role) values (v_ua, 'anna@zzteamz.test', 'authenticated', 'authenticated');
  insert into person (first_name, last_name, auth_user_id, access_blocked_at) values ('Anna', 'Zzteamz', v_ua, now()) returning id into v_a;
  insert into person_email (person_id, email, is_primary) values (v_a, 'anna@zzteamz.test', true);
  insert into role_assignment (person_id, role, scope_type) values (v_a, 'talent_team', 'global');
  select count(*)::integer into v_n from team_access_list('zzteamz', 'team', 50, 0) l where l.person_id = v_a and l.blocked_at is not null;
  insert into t_res values ('05_ersatz_liste',
    case when v_n = 1 then 'Team-Filter zeigt die gesperrte Teamperson (richtig)' else 'unerwartet ' || v_n end);

  -- 04b · ohne Abschnittsrecht
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'talent_team', 'global');
  begin
    perform team_access_list(null, 'team', 5, 0);
    insert into t_res values ('04b_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04b_ohne_recht', 'abgewiesen ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
