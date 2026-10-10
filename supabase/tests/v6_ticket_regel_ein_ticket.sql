-- Test „Ein Ticket je Person und Edition“ (TAL-020, vorschlag/v6_ticket_regel_ein_ticket.sql). Belegt:
--   01 Vorbedingung: das erste Ticket wird „für mich“ gespeichert (nichts gespeichert, also erlaubt);
--   02 „für mich“ auf ein zweites Ticket derselben Edition → P0001 person_has_ticket, nichts geschrieben;
--   03 „andere Person“ auf dem zweiten Ticket geht, mit Käufer-Adresse als Zugriff;
--   04 dasselbe Ticket erneut „für mich“ speichern geht (zählt sich nicht selbst);
--   05 ein storniertes eigenes Ticket und ein nur `pending` hängendes Ticket zählen nicht;
--   06 ein Ticket einer anderen Edition zählt nicht;
--   07 `my_tickets()` liefert Stand und Transaktions-Id; Spalten ohne Preis, Mail, Notiz, Secret; anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ed2 uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_state text; v_s text; v_n integer; v_tx text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;
  insert into event (name, format_tag, is_edition, slug) values ('Regel-Test-Edition', 'edition', true, 'regel-test-ed') returning id into v_ed;
  insert into event (name, format_tag, is_edition, slug) values ('Regel-Test-Edition 2', 'edition', true, 'regel-test-ed2') returning id into v_ed2;

  insert into ticket (event_id, person_id, buyer_email, status, pass_type, barcode, personalization_status, vivenu_transaction_id)
    values (v_ed, v_pid, v_email, 'valid', 'student', 'BC-R1', 'pending', 'tx-regel') returning id into v_t1;
  insert into ticket (event_id, person_id, buyer_email, status, pass_type, barcode, personalization_status, vivenu_transaction_id)
    values (v_ed, v_pid, v_email, 'valid', 'student', 'BC-R2', 'pending', 'tx-regel') returning id into v_t2;
  insert into ticket (event_id, person_id, buyer_email, status, pass_type, barcode, personalization_status)
    values (v_ed, v_pid, v_email, 'cancelled', 'student', 'BC-R3', 'complete') returning id into v_t3;
  insert into ticket (event_id, person_id, buyer_email, status, pass_type, barcode, personalization_status)
    values (v_ed2, v_pid, v_email, 'valid', 'student', 'BC-R4', 'complete') returning id into v_t4;
  insert into ticket (event_id, buyer_email, status, pass_type, barcode, personalization_status)
    values (v_ed, v_email, 'valid', 'student', 'BC-R5', 'pending') returning id into v_t5;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 (storniertes Ticket v_t3 und Ticket der anderen Edition v_t4 stehen schon da und dürfen nicht stören)
  perform personalize_ticket(v_t1, 'Erika', 'Test', 'Firma', 'Rolle', true, null);
  select personalization_status into v_state from ticket where id = v_t1;
  insert into t_res values ('01_erstes_ticket', case when v_state = 'complete' then 'ok' else coalesce(v_state, 'leer') end);

  -- 02
  begin
    perform personalize_ticket(v_t2, 'Erika', 'Test', 'Firma', 'Rolle', true, null);
    v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = 'P0001' and sqlerrm = 'person_has_ticket' then 'ok' else sqlstate || ' ' || sqlerrm end; end;
  select personalization_status into v_state from ticket where id = v_t2;
  insert into t_res values ('02_zweites_fuer_mich', case when v_s = 'ok' and v_state = 'pending' then 'ok' else v_s || ' / ' || v_state end);

  -- 03
  perform personalize_ticket(v_t2, 'Max', 'Muster', 'Firma', 'Rolle', false, 'max.muster@example.org');
  select personalization_status into v_state from ticket where id = v_t2;
  insert into t_res values ('03_andere_person', case when v_state = 'complete' and (select person_id from ticket where id = v_t2) is null then 'ok' else coalesce(v_state, 'leer') end);

  -- 04
  perform personalize_ticket(v_t1, 'Erika', 'Neu', 'Firma', 'Rolle', true, null);
  insert into t_res values ('04_selbst_erneut', case when (select holder_last_name from ticket where id = v_t1) = 'Neu' then 'ok' else 'FEHLER' end);

  -- 05 v_t5 ist nur pending, nicht für mich gespeichert; v_t1 ist bereits für mich gespeichert → für mich auf v_t5 wird abgelehnt (das zählt v_t1);
  -- storniertes v_t3 allein hätte es nicht verhindert: erst v_t1 auf andere Person, dann geht es.
  perform personalize_ticket(v_t1, 'Erika', 'Neu', 'Firma', 'Rolle', false, 'erika.neu@example.org');
  begin
    perform personalize_ticket(v_t5, 'Erika', 'Test', 'Firma', 'Rolle', true, null);
    v_s := 'ok';
  exception when others then v_s := sqlstate || ' ' || sqlerrm; end;
  insert into t_res values ('05_storniert_und_pending_zaehlen_nicht', v_s);

  -- 06 v_t4 (andere Edition, gespeichert) hat das Ticket der Edition 1 nicht verhindert (Schritt 01/05 gingen durch)
  insert into t_res values ('06_andere_edition', case when (select personalization_status from ticket where id = v_t4) = 'complete' and v_s = 'ok' then 'ok' else 'FEHLER' end);

  -- 07
  select m.personalization_status, m.vivenu_transaction_id into v_state, v_tx from my_tickets() m where m.ticket_id = v_t5;
  v_s := pg_get_function_result('my_tickets()'::regprocedure);
  insert into t_res values ('07_stand_und_spalten',
    case when v_state = 'complete' and v_tx is null and v_s ~ 'personalization_status' and v_s ~ 'vivenu_transaction_id'
          and v_s !~* '(price|mail|note|secret)'
          and not has_function_privilege('anon', 'my_tickets()', 'execute')
          and has_function_privilege('authenticated', 'my_tickets()', 'execute')
         then 'ok' else coalesce(v_state, 'leer') || ' / ' || coalesce(v_tx, 'null') || ' / ' || v_s end);
end $$;
select * from t_res order by step;
rollback;
