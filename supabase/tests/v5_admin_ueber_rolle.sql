-- Smoke-Test 0107 (Admin-Bereich hängt an der Rolle). Belegt:
--   01 mit aktiver Admin-Rolle ist `is_staff()` wahr;
--   03 ohne Rolle nicht;
--   04 eine RPC, die `is_staff()` prüft, folgt derselben Grenze (`search_people`);
--   05 `session_context()` meldet dasselbe — daran hängt die Oberfläche;
--   06 eine abgelaufene Admin-Rolle zählt nicht.
-- Historie: Bis 20260917183022 belegten 02/07/08 den Schnitt gegen die Liste `staff_user`
-- (eine Zeile allein reicht nicht; Schutzprüfung `staff_users_without_admin()`). Tabelle und
-- Prüfung sind seit dem Aufräumen entfernt — die Schritte sind gegenstandslos, die Nummern bleiben.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_uid uuid; v_email text; v_b boolean;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 03 · Ohne Rolle.
  insert into t_res values ('03_nichts',
    case when not is_staff() then 'kein Team (richtig)' else 'Team ohne Rolle (BUG)' end);

  -- 04 · Eine RPC hinter derselben Grenze.
  begin
    perform search_people('mus', 5);
    insert into t_res values ('04_rpc', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_rpc', 'abgewiesen ' || sqlstate); end;

  -- 06 · Abgelaufene Rolle.
  insert into role_assignment (person_id, role, scope_type, valid_from, valid_to)
    values (v_pid, 'admin', 'global', now() - interval '2 days', now() - interval '1 day');
  insert into t_res values ('06_abgelaufen',
    case when not is_staff() then 'abgelaufen zaehlt nicht (richtig)' else 'zaehlt noch (BUG)' end);

  -- 01/05 · Mit aktiver Rolle.
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into t_res values ('01_rolle',
    case when is_staff() then 'Rolle genuegt (richtig)' else 'Rolle reicht nicht (BUG)' end);
  select (session_context()->>'is_staff')::boolean into v_b;
  insert into t_res values ('05_session_context',
    case when v_b then 'meldet Team (richtig)' else 'meldet kein Team (BUG)' end);
end $$;
select * from t_res order by step;
rollback;
