-- Test „Eigene Tickets" (TAL-015, vorschlag/v6_my_tickets.sql). Belegt:
--   01 Vorbedingung: das eigene gültige Ticket der Edition erscheint mit Pass-Typ, Code und
--      Editionsname;
--   02 ein Ticket, das nur über Käufer-Mail an mir hängt (person_id fremd), erscheint nicht;
--   03 storniert erscheint nicht; `requested` erscheint ohne Code;
--   04 Wallet verfügbar nur mit vivenu-Id **und** Secret;
--   05 Spaltenliste ohne Preis, Mail, Notiz, Secret; ohne Person 28000; anon ohne EXECUTE.
--
-- Probelauf der Build-Session am 25.09.2026 gegen die Live-Datenbank (`sh scripts/db.sh dry-run`,
-- alles zurueckgerollt, Wegwerf-Edition): 5 von 5 Schritten gruen. Keine bestehende Funktion geaendert.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_other uuid; v_ed uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; r record; v_s text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select p.id into v_other from person p where p.id <> v_pid and p.deleted_at is null limit 1;
  insert into event (name, format_tag, is_edition, slug) values ('Ticket-Test-Edition', 'edition', true, 'ticket-test-ed')
    returning id into v_ed;

  insert into ticket (event_id, person_id, status, pass_type, barcode, holder_first_name, vivenu_ticket_id)
    values (v_ed, v_pid, 'valid', 'business', 'BC-EIGEN', 'Eigen', 'vv-eigen') returning id into v_t1;
  insert into ticket_secret (ticket_id, secret) values (v_t1, 'geheim');
  insert into ticket (event_id, person_id, status, barcode, buyer_email)
    values (v_ed, v_other, 'valid', 'BC-FREMD', v_email) returning id into v_t2;
  insert into ticket (event_id, person_id, status, barcode) values (v_ed, v_pid, 'cancelled', 'BC-STORNO') returning id into v_t3;
  insert into ticket (event_id, person_id, status, barcode, vivenu_ticket_id)
    values (v_ed, v_pid, 'requested', 'BC-NOCH-NICHT', 'vv-ohne-secret') returning id into v_t4;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01
  select * into r from my_tickets() m where m.ticket_id = v_t1;
  insert into t_res values ('01_eigenes_ticket',
    case when r.pass_type = 'business' and r.barcode = 'BC-EIGEN' and r.edition_name = 'Ticket-Test-Edition'
         then 'ok' else coalesce(r::text, 'leer') end);
  -- 02
  select count(*) into v_n from my_tickets() m where m.ticket_id = v_t2;
  insert into t_res values ('02_nur_person_id', case when v_n = 0 then 'ok' else 'ALLOWED (BUG)' end);
  -- 03
  select count(*) into v_n from my_tickets() m where m.ticket_id = v_t3;
  select m.barcode into v_s from my_tickets() m where m.ticket_id = v_t4;
  insert into t_res values ('03_status',
    case when v_n = 0 and v_s is null and exists (select 1 from my_tickets() m where m.ticket_id = v_t4)
         then 'ok' else 'FEHLER n=' || v_n || ' code=' || coalesce(v_s, 'null') end);
  -- 04
  insert into t_res values ('04_wallet',
    case when (select wallet_available from my_tickets() m where m.ticket_id = v_t1)
          and not (select wallet_available from my_tickets() m where m.ticket_id = v_t4)
         then 'ok' else 'FEHLER' end);
  -- 05
  v_s := pg_get_function_result('my_tickets()'::regprocedure);
  perform set_config('request.jwt.claims', null, true);
  begin perform * from my_tickets(); v_n := -1;
  exception when others then v_n := case when sqlstate = '28000' then 0 else -2 end; end;
  insert into t_res values ('05_spalten_grants',
    case when v_s !~* '(price|mail|note|secret)' and v_n = 0
          and not has_function_privilege('anon', 'my_tickets()', 'execute')
          and has_function_privilege('authenticated', 'my_tickets()', 'execute')
         then 'ok' else v_s || ' / ' || v_n end);
end $$;
select * from t_res order by step;
rollback;
