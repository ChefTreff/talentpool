-- Smoke-Test 0107 (Admin-Bereich hängt an der Rolle). Belegt:
--   01 mit aktiver Admin-Rolle ist `is_staff()` wahr — auch ohne `staff_user`-Zeile;
--   02 **der Schnitt:** eine `staff_user`-Zeile allein reicht nicht mehr;
--   03 ohne beides sowieso nicht;
--   04 eine RPC, die `is_staff()` prüft, folgt derselben Grenze (`search_people`);
--   05 `session_context()` meldet dasselbe — daran hängt die Oberfläche;
--   06 eine abgelaufene Admin-Rolle zählt nicht;
--   07 die Schutzprüfung findet ein Konto, das beim Schnitt draussen stünde;
--   08 und schweigt, sobald die Rolle vergeben ist.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_n integer; v_b boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 03 · Weder noch.
  insert into t_res values ('03_nichts',
    case when not is_staff() then 'kein Team (richtig)' else 'Team ohne alles (BUG)' end);

  -- 02 · Nur die alte Liste. Das ist der Punkt der Migration.
  insert into staff_user (auth_user_id, email) values (v_uid, v_email::citext);
  insert into t_res values ('02_nur_liste',
    case when not is_staff() then 'staff_user allein reicht nicht (richtig)'
         else 'alte Liste oeffnet noch (BUG)' end);

  -- 04 · Eine RPC hinter derselben Grenze.
  begin
    perform search_people('mus', 5);
    insert into t_res values ('04_rpc', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_rpc', 'abgewiesen ' || sqlstate); end;

  -- 07 · Die Schutzprüfung der Migration.
  select count(*)::integer into v_n from staff_users_without_admin();
  insert into t_res values ('07_schutzpruefung',
    case when v_n = 1 then 'findet das Konto ohne Rolle (richtig)' else 'unerwartet ' || v_n end);

  -- 06 · Abgelaufene Rolle.
  insert into role_assignment (person_id, role, scope_type, valid_from, valid_to)
    values (v_pid, 'admin', 'global', now() - interval '2 days', now() - interval '1 day');
  insert into t_res values ('06_abgelaufen',
    case when not is_staff() then 'abgelaufen zaehlt nicht (richtig)' else 'zaehlt noch (BUG)' end);

  -- 01/05/08 · Mit aktiver Rolle.
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into t_res values ('01_rolle',
    case when is_staff() then 'Rolle genuegt, ohne Liste (richtig)' else 'Rolle reicht nicht (BUG)' end);
  select (session_context()->>'is_staff')::boolean into v_b;
  insert into t_res values ('05_session_context',
    case when v_b then 'meldet Team (richtig)' else 'meldet kein Team (BUG)' end);
  insert into staff_user (auth_user_id, email) values (v_uid, v_email::citext);
  select count(*)::integer into v_n from staff_users_without_admin();
  insert into t_res values ('08_schutzpruefung_still',
    case when v_n = 0 then 'nichts zu melden (richtig)' else 'unerwartet ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
