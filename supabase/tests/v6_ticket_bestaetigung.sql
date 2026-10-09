-- Test „Ticket-Bestätigung“ (TAL-019, v6_ticket_bestaetigung.sql). Belegt:
--   01 my_transaction_tickets: der Käufer sieht alle Tickets seiner Transaktion (ohne Barcode/Secret in der Spaltenliste);
--      eine fremde Adresse sieht 0 Zeilen (auch bei existierender Transaktion); fremde Transaktion ⇒ 0 Zeilen;
--      stornierte Tickets fehlen; ohne Sitzung 28000;
--   02 claim_or_create_person: ein Ticket mit holder_email = Adresse und leerem person_id wird verknüpft, ein Ticket mit
--      buyer_email ohne Inhaber ebenfalls; ein Ticket mit person_id bleibt bei seiner Person (nie umhängen); ein Ticket mit
--      Inhaber-Adresse einer anderen Person und buyer_email = Adresse bleibt unverknüpft; Audit ohne Adresse;
--   03 Server-Funktionen: mit Sitzung 42501, ohne Sitzung Daten und Marke; Pending-Liste enthält die markierte Zeile;
--   04 Rechte: anon ohne EXECUTE auf alle neuen Funktionen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_other uuid; v_ev uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid;
  v_s text; v_n integer; v_mail text := 'zz-tal019-käufer@example.org'; v_cnt integer;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id into v_other from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  insert into event (name, format_tag, is_edition, slug, vivenu_event_id) values ('TEST Ed T19', 'edition', true, 't-ed-t19', 'zz-viv-ev-t19') returning id into v_ev;
  -- Käufer-Adresse = Adresse des ersten Kontos
  select pe.email::text into v_mail from person_email pe where pe.person_id = v_pid and pe.verified order by pe.is_primary desc limit 1;
  if v_mail is null then v_mail := 'zz-tal019@example.org'; insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_mail, false, true); end if;
  update ticket set person_id = null where person_id = v_pid and false;
  insert into ticket (event_id, vivenu_ticket_id, vivenu_transaction_id, buyer_email, status) values (v_ev, 'zz-t19-1', 'zz-tx-19', v_mail, 'valid') returning id into v_t1;
  insert into ticket (event_id, vivenu_ticket_id, vivenu_transaction_id, buyer_email, status) values (v_ev, 'zz-t19-2', 'zz-tx-19', v_mail, 'valid') returning id into v_t2;
  insert into ticket (event_id, vivenu_ticket_id, vivenu_transaction_id, buyer_email, status) values (v_ev, 'zz-t19-3', 'zz-tx-19', v_mail, 'cancelled') returning id into v_t3;
  insert into ticket (event_id, vivenu_ticket_id, vivenu_transaction_id, buyer_email, status) values (v_ev, 'zz-t19-4', 'zz-tx-other', 'zz-fremd@example.org', 'valid') returning id into v_t4;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_mail)::text, true);
  select count(*) into v_n from my_transaction_tickets('zz-tx-19');
  select count(*) into v_cnt from my_transaction_tickets('zz-tx-other');
  insert into t_res values ('01a_kaeufer_sieht_seine',
    case when v_n = 2 and v_cnt = 0 and not exists (select 1 from my_transaction_tickets('zz-tx-19') x where x.ticket_id = v_t3)
         then 'ok' else 'n=' || v_n || ' fremd=' || v_cnt end);

  -- fremde Adresse: gleiche Transaktion, 0 Zeilen
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', 'zz-nicht-der-kaeufer@example.org')::text, true);
  update ticket set person_id = null where id in (v_t1, v_t2);
  select count(*) into v_n from my_transaction_tickets('zz-tx-19') where ticket_id in (v_t1, v_t2);
  insert into t_res values ('01b_fremde_adresse', case when v_n = 0 then 'ok' else 'n=' || v_n end);

  perform set_config('request.jwt.claims', null, true);
  v_s := '';
  begin perform * from my_transaction_tickets('zz-tx-19'); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '28000' then 'ok' else sqlstate end; end;
  insert into t_res values ('01c_ohne_sitzung', v_s);

  -- 02 Verknüpfung
  update ticket set person_id = null where id in (v_t1, v_t2, v_t4);
  insert into ticket (event_id, vivenu_ticket_id, buyer_email, holder_email, status) values (v_ev, 'zz-t19-5', 'zz-fremd@example.org', v_mail, 'valid') returning id into v_t5;
  insert into ticket (event_id, vivenu_ticket_id, buyer_email, holder_email, status) values (v_ev, 'zz-t19-6', v_mail, 'zz-andere-inhaberin@example.org', 'valid') returning id into v_t6;
  update ticket set person_id = v_other where id = v_t2;                       -- gehört schon jemandem: nie umhängen
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_mail)::text, true);
  perform claim_or_create_person();
  insert into t_res values ('02_verknuepfung',
    case when (select person_id from ticket where id = v_t1) = v_pid            -- buyer_email ohne Inhaber
          and (select person_id from ticket where id = v_t5) = v_pid            -- holder_email = Adresse
          and (select person_id from ticket where id = v_t2) = v_other          -- nicht umgehängt
          and (select person_id from ticket where id = v_t6) is null            -- Inhaberin ist eine andere Person
          and (select person_id from ticket where id = v_t4) is null
          and exists (select 1 from audit_log a where a.action = 'ticket.claim' and a.object_id = v_pid::text and a.after::text not like '%@%')
         then 'ok' else 'FEHLER' end);
  -- zweiter Aufruf ändert nichts mehr
  select count(*) into v_n from audit_log where action = 'ticket.claim' and object_id = v_pid::text;
  perform claim_or_create_person();
  insert into t_res values ('02b_idempotent', case when (select count(*) from audit_log where action = 'ticket.claim' and object_id = v_pid::text) = v_n then 'ok' else 'FEHLER' end);

  -- 03 Server-Funktionen
  v_s := '';
  begin perform ticket_writeback_data(v_t1); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform mark_ticket_writeback(v_t1, true); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  begin perform tickets_writeback_pending(5); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  perform set_config('request.jwt.claims', null, true);
  insert into ticket_secret (ticket_id, secret) values (v_t1, 'zz-geheim');
  update ticket set holder_first_name = 'Ada', holder_last_name = 'Test', holder_company = 'ZZ', holder_position = 'Lead' where id = v_t1;
  perform mark_ticket_writeback(v_t1, true);
  insert into t_res values ('03_server',
    case when v_s = 'ok/ok/ok'
          and (select count(*) from ticket_writeback_data(v_t1) d where d.vivenu_ticket_id = 'zz-t19-1' and d.secret = 'zz-geheim' and d.first_name = 'Ada' and d.vivenu_event_id = 'zz-viv-ev-t19') = 1
          and exists (select 1 from tickets_writeback_pending(500) q where q.ticket_id = v_t1)
          and (select vivenu_writeback_pending from ticket where id = v_t1)
         then 'ok' else v_s end);
  perform mark_ticket_writeback(v_t1, false);
  insert into t_res values ('03b_zurueckgesetzt', case when not exists (select 1 from tickets_writeback_pending(500) q where q.ticket_id = v_t1) then 'ok' else 'FEHLER' end);

  -- 04 Rechte
  insert into t_res values ('04_rechte',
    case when not has_function_privilege('anon', 'my_transaction_tickets(text)', 'execute')
          and not has_function_privilege('anon', 'ticket_writeback_data(uuid)', 'execute')
          and not has_function_privilege('anon', 'mark_ticket_writeback(uuid,boolean)', 'execute')
          and not has_function_privilege('anon', 'tickets_writeback_pending(integer)', 'execute')
          and not has_function_privilege('authenticated', 'ticket_writeback_data(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'mark_ticket_writeback(uuid,boolean)', 'execute')
          and not has_function_privilege('authenticated', 'tickets_writeback_pending(integer)', 'execute')
          and has_function_privilege('service_role', 'ticket_writeback_data(uuid)', 'execute')
          and not has_function_privilege('anon', 'link_tickets_to_person(uuid,citext)', 'execute')
          and not has_function_privilege('authenticated', 'link_tickets_to_person(uuid,citext)', 'execute')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
