-- Smoke-Test „Weg zur Wallet" (SPK-037). Belegt:
--   01 das eigene, ausgestellte Ticket liefert Id und Secret;
--   02 ein fremdes Ticket nicht (42501) — der Link ist der Zugang zum Ticket;
--   03 ein Ticket ohne vivenu-Id ⇒ P0002 ticket_not_issued (Freiticket, das
--      noch nicht ausgestellt ist);
--   04 ein Ticket mit Id, aber ohne Secret ⇒ ebenfalls P0002;
--   05 eine erfundene Id ⇒ P0002 ticket_not_found;
--   06 Grants: anon gesperrt, authenticated erlaubt;
--   07 `ticket_secret` bleibt ohne Grants — die Tabelle selbst ist weiter zu.
--
-- Probelauf der Build-Session am 23.09.2026 gegen die Live-Datenbank
-- (`sh scripts/db.sh dry-run`, alles zurueckgerollt): 8 von 8 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_fremd uuid; v_t uuid; v_t_ohne uuid; v_t_fremd uuid;
  v_json jsonb; v_n integer; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  select p.id into v_fremd from person p where p.id <> v_pid limit 1;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';

  insert into ticket (event_id, person_id, vivenu_ticket_id, barcode, status)
    values (v_ed, v_pid, 'vv-eigen-1', 'BC-1', 'valid') returning id into v_t;
  insert into ticket_secret (ticket_id, secret) values (v_t, 'geheim-eins');

  insert into ticket (event_id, person_id, status) values (v_ed, v_pid, 'valid')
    returning id into v_t_ohne;

  insert into ticket (event_id, person_id, vivenu_ticket_id, status)
    values (v_ed, v_fremd, 'vv-fremd-1', 'valid') returning id into v_t_fremd;
  insert into ticket_secret (ticket_id, secret) values (v_t_fremd, 'geheim-fremd');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · eigenes Ticket
  v_json := my_ticket_wallet_link(v_t);
  insert into t_res values ('01_eigenes',
    case when v_json->>'vivenu_ticket_id' = 'vv-eigen-1' and v_json->>'secret' = 'geheim-eins'
         then 'ok' else 'FEHLER ' || coalesce(v_json::text, 'null') end);

  -- 02 · fremdes Ticket
  begin
    perform my_ticket_wallet_link(v_t_fremd);
    insert into t_res values ('02_fremdes', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('02_fremdes', 'abgewiesen ' || sqlstate);
  end;

  -- 03 · ohne vivenu-Id
  begin
    perform my_ticket_wallet_link(v_t_ohne);
    insert into t_res values ('03_ohne_vivenu_id', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('03_ohne_vivenu_id', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 04 · mit Id, ohne Secret
  delete from ticket_secret where ticket_id = v_t;
  begin
    perform my_ticket_wallet_link(v_t);
    insert into t_res values ('04_ohne_secret', 'ERLAUBT (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('04_ohne_secret', 'abgewiesen ' || sqlstate || ' / ' || coalesce(v_detail, '-'));
  end;

  -- 05 · erfundene Id
  begin
    perform my_ticket_wallet_link('00000000-0000-4000-8000-000000000000');
    insert into t_res values ('05_unbekannt', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_unbekannt', 'abgewiesen ' || sqlstate);
  end;

  -- 06 · Grants der Funktion
  insert into t_res values ('06_anon_gesperrt',
    case when has_function_privilege('anon', 'my_ticket_wallet_link(uuid)', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);
  insert into t_res values ('06_authenticated_erlaubt',
    case when has_function_privilege('authenticated', 'my_ticket_wallet_link(uuid)', 'execute')
         then 'ok' else 'FEHLER' end);

  -- 07 · die Tabelle selbst bleibt zu
  select count(*)::integer into v_n from information_schema.role_table_grants
   where table_name = 'ticket_secret' and grantee in ('anon', 'authenticated');
  insert into t_res values ('07_tabelle_ohne_grants',
    case when v_n = 0 then 'keine' else 'FEHLER ' || v_n::text end);
end $$;
select * from t_res order by step;
rollback;
