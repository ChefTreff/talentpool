-- Test „Ticketmail und Erinnerung“ (TAL-019 Teil 3, vorschlag/v6_ticket_versand_erinnerung.sql). Belegt:
--   01 `remind_ticket_personalization`: je Käufer und Bestellung eine Mail für die offenen Tickets (pending/partial) über sieben Tage;
--      ein vollständiges, ein junges und ein Ticket einer vergangenen Edition bleiben außen vor; die Mail trägt Zahl und Pfad; Ticket-Zeitstempel gesetzt;
--   02 ein zweiter Lauf reiht nichts mehr ein (einmal je Ticket);
--   03 `tickets_mail_pending`: nur gültig, vollständig im Portal personalisiert, Rückschreiben erledigt, mit Inhaber-Adresse, ohne Versandmarke;
--   04 beide Funktionen nur für den Server: mit Anmeldung 42501, anon/authenticated ohne EXECUTE;
--   05 die Vorlage gibt es in DE und EN und im Verzeichnis mit den Platzhaltern.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_old uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid; v_t7 uuid; v_t8 uuid;
  v_n integer; v_s text; v_m record; v_before integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null and not is_suppressed(pe.email::text) limit 1;
  insert into event (name, format_tag, is_edition, slug, start_date, end_date) values ('Erinnerung-Test-Edition', 'edition', true, 'erinnerung-test-ed', current_date + 30, current_date + 31) returning id into v_ed;
  insert into event (name, format_tag, is_edition, slug, start_date, end_date) values ('Erinnerung-Alt-Edition', 'edition', true, 'erinnerung-alt-ed', current_date - 40, current_date - 39) returning id into v_old;
  select count(*) into v_before from mail_log where template_key = 'ticket_personalization_reminder';

  insert into ticket (event_id, buyer_email, status, source, barcode, personalization_status, vivenu_transaction_id, purchased_at, vivenu_ticket_id)
    values (v_ed, v_email, 'valid', 'vivenu', 'BC-E1', 'pending', 'tx-erinnerung', now() - interval '8 days', 'vv-e1') returning id into v_t1;
  insert into ticket (event_id, buyer_email, status, source, barcode, personalization_status, vivenu_transaction_id, purchased_at, vivenu_ticket_id)
    values (v_ed, v_email, 'valid', 'vivenu', 'BC-E2', 'partial', 'tx-erinnerung', now() - interval '9 days', 'vv-e2') returning id into v_t2;
  insert into ticket (event_id, buyer_email, status, source, barcode, personalization_status, vivenu_transaction_id, purchased_at, vivenu_ticket_id)
    values (v_ed, v_email, 'valid', 'vivenu', 'BC-E3', 'complete', 'tx-erinnerung', now() - interval '9 days', 'vv-e3') returning id into v_t3;
  insert into ticket (event_id, buyer_email, status, source, barcode, personalization_status, vivenu_transaction_id, purchased_at, vivenu_ticket_id)
    values (v_ed, v_email, 'valid', 'vivenu', 'BC-E4', 'pending', 'tx-jung', now() - interval '3 days', 'vv-e4') returning id into v_t4;
  insert into ticket (event_id, buyer_email, status, source, barcode, personalization_status, vivenu_transaction_id, purchased_at, vivenu_ticket_id)
    values (v_old, v_email, 'valid', 'vivenu', 'BC-E5', 'pending', 'tx-alt', now() - interval '60 days', 'vv-e5') returning id into v_t5;

  -- 01
  v_n := remind_ticket_personalization();
  select * into v_m from mail_log where template_key = 'ticket_personalization_reminder' and person_id = v_pid order by id desc limit 1;
  insert into t_res values ('01_erinnerung',
    case when v_n >= 1
          and (select count(*) from mail_log where template_key = 'ticket_personalization_reminder') = v_before + v_n
          and (v_m.meta -> 'vars' ->> 'n') = '2'
          and (v_m.meta -> 'vars' ->> 'link_path') = '/tickets/bestaetigung?transactionId=tx-erinnerung'
          and (select count(*) from ticket where id in (v_t1, v_t2) and personalization_reminded_at is not null) = 2
          and (select count(*) from ticket where id in (v_t3, v_t4, v_t5) and personalization_reminded_at is not null) = 0
         then 'ok' else 'n=' || v_n || ' ' || coalesce(v_m.meta::text, 'keine Mail') end);

  -- 02
  insert into t_res values ('02_einmal', case when remind_ticket_personalization() = 0 then 'ok' else 'ZWEITER LAUF REIHT EIN' end);

  -- 03
  insert into ticket (event_id, holder_email, status, source, barcode, personalization_status, personalized_at, vivenu_ticket_id, vivenu_writeback_pending)
    values (v_ed, 'a@example.org', 'valid', 'vivenu', 'BC-M1', 'complete', now(), 'vv-m1', false) returning id into v_t6;
  insert into ticket (event_id, holder_email, status, source, barcode, personalization_status, personalized_at, vivenu_ticket_id, vivenu_writeback_pending)
    values (v_ed, 'b@example.org', 'valid', 'vivenu', 'BC-M2', 'complete', now(), 'vv-m2', true) returning id into v_t7;
  insert into ticket (event_id, holder_email, status, source, barcode, personalization_status, personalized_at, vivenu_ticket_id, vivenu_mailed_at)
    values (v_ed, 'c@example.org', 'valid', 'vivenu', 'BC-M3', 'complete', now(), 'vv-m3', now()) returning id into v_t8;
  insert into t_res values ('03_versand_offen',
    case when exists (select 1 from tickets_mail_pending(500) x where x.ticket_id = v_t6)
          and not exists (select 1 from tickets_mail_pending(500) x where x.ticket_id in (v_t7, v_t8, v_t3))
         then 'ok' else 'FEHLER' end);

  -- 04
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_s := '';
  begin perform remind_ticket_personalization(); v_s := 'ALLOWED (BUG)'; exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  begin perform * from tickets_mail_pending(1); v_s := v_s || '/ALLOWED (BUG)'; exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  perform set_config('request.jwt.claims', null, true);
  insert into t_res values ('04_nur_server',
    case when v_s = 'ok/ok'
          and not has_function_privilege('anon', 'remind_ticket_personalization()', 'execute')
          and not has_function_privilege('authenticated', 'remind_ticket_personalization()', 'execute')
          and not has_function_privilege('authenticated', 'tickets_mail_pending(integer)', 'execute')
         then 'ok' else v_s end);

  -- 05
  insert into t_res values ('05_vorlage',
    case when (select count(*) from mail_template where key = 'ticket_personalization_reminder' and active and locale in ('de', 'en')) = 2
          and exists (select 1 from mail_template_key where key = 'ticket_personalization_reminder' and 'link_path' = any(variables))
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
