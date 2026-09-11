-- Smoke-Test 0071–0078: vivenu-Ticket-Ingest. Belegt: ein Ticket wird angelegt (Status und Personalisierung auf
-- unsere Werte abgebildet, Pass-Typ aus `ticket_type_map`, Person über die Inhaber-Mail aus dem Extra-Feld);
-- das Secret landet in `ticket_secret`, nicht an `ticket`; Coupon-Einlösungen werden **neu gezählt** und sind damit
-- idempotent (vivenu wiederholt bis zu siebenmal); ein Storno senkt die Zählung wieder; ein unbekannter Status lässt
-- den alten stehen statt abzubrechen; ein unbekanntes Event endet als `unknown_event`; als angemeldete Person 42501;
-- keine Grants auf Funktionen und Secret-Tabelle.
-- 0075–0078: ein älterer Stand (`updatedAt`) wird als `stale` verworfen; ein unbekannter Tickettyp lässt `pass_type` leer
-- statt zu raten und meldet das in der Antwort; `backfill_ticket_pass_types()` trägt nach, sobald die Zuordnung steht;
-- ein karges Ticket ohne addons/currency/personalizationStatus läuft durch (NOT-NULL-Spalten mit Rückfall).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_ed uuid; v_org uuid; v_oe uuid; v_alloc uuid; v_map uuid; v_pid uuid; v_uid uuid; v_email text;
        v_res jsonb; v_tid uuid; v_payload jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  -- Wegwerf-Zustand; der Rollback stellt die echte vivenu-Event-Id wieder her.
  update event set vivenu_event_id = 'evt_test_0071' where id = v_ed;
  insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type)
  values (v_ed, 'tt_test', 'Testticket', 'student') returning id into v_map;
  insert into organization (legal_name, communication_name, type) values ('Ingest Test GmbH', 'Ingest', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into org_ticket_allocation (org_id, event_id, org_edition_id, pass_type, quantity, status, vivenu_coupon_id)
  values (v_org, v_ed, v_oe, 'partner', 10, 'active', 'cpn_test') returning id into v_alloc;

  v_payload := jsonb_build_object(
    '_id', 'tkt_test_1', 'eventId', 'evt_test_0071', 'ticketTypeId', 'tt_test', 'transactionId', 'trx_1',
    'barcode', 'BARCODE-1', 'secret', 'geheim-1', 'status', 'DETAILSREQUIRED', 'personalizationStatus', 'DETAILSREQUIRED',
    'email', 'kauf@example.org', 'firstname', 'Mia', 'lastname', 'Muster', 'realPrice', 4900, 'currency', 'EUR',
    'createdAt', '2027-01-05T10:00:00Z', 'addOns', jsonb_build_array(jsonb_build_object('name','Hotel')),
    'meta', jsonb_build_object('person_id','p-1'), 'extraFields', jsonb_build_object('email', v_email),
    'holderEmail', v_email, 'appliedDiscountInfo', jsonb_build_array(jsonb_build_object('discountId','cpn_test')));

  v_res := ingest_vivenu_ticket(v_payload);
  v_tid := (v_res->>'ticket_id')::uuid;
  insert into t_res values ('01_anlegen', v_res->>'outcome'
    || ' status=' || (select status from ticket where id = v_tid)
    || ' pers=' || coalesce((select personalization_status from ticket where id = v_tid), '-')
    || ' pass=' || (select pass_type from ticket where id = v_tid)
    || ' person=' || (select (person_id = v_pid)::text from ticket where id = v_tid));
  insert into t_res values ('02_secret_eigene_tabelle',
    'zeilen=' || (select count(*)::text from ticket_secret where ticket_id = v_tid)
    || ' wert=' || (select secret from ticket_secret where ticket_id = v_tid));
  insert into t_res values ('03_einloesungen', (select used_count::text from org_ticket_allocation where id = v_alloc));

  -- vivenu wiederholt bis zu siebenmal: dreimal dasselbe darf nichts verdoppeln.
  perform ingest_vivenu_ticket(v_payload);
  perform ingest_vivenu_ticket(v_payload);
  insert into t_res values ('04_idempotent',
    'tickets=' || (select count(*)::text from ticket where vivenu_ticket_id = 'tkt_test_1')
    || ' einloesungen=' || (select used_count::text from org_ticket_allocation where id = v_alloc));

  v_res := ingest_vivenu_ticket(v_payload || jsonb_build_object('personalizationStatus','COMPLETED','firstname','Mia-Sophie'));
  insert into t_res values ('05_aktualisieren', v_res->>'outcome'
    || ' pers=' || (select personalization_status from ticket where id = v_tid)
    || ' name=' || (select holder_first_name from ticket where id = v_tid));

  v_res := ingest_vivenu_ticket(v_payload || jsonb_build_object('status','CANCELLED'));
  insert into t_res values ('06_storno',
    'status=' || (select status from ticket where id = v_tid)
    || ' einloesungen=' || (select used_count::text from org_ticket_allocation where id = v_alloc));

  v_res := ingest_vivenu_ticket(v_payload || jsonb_build_object('status','WAS_AUCH_IMMER'));
  insert into t_res values ('07_unbekannter_status',
    v_res->>'outcome' || ' status=' || (select status from ticket where id = v_tid));

  insert into t_res values ('08_unbekanntes_event',
    (ingest_vivenu_ticket(jsonb_build_object('_id','tkt_x','eventId','evt_gibtsnicht')))->>'outcome');

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  begin
    perform ingest_vivenu_ticket(v_payload);
    insert into t_res values ('09_als_nutzer', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_als_nutzer', 'rejected ' || sqlstate); end;

  -- 11–16: die Nachträge aus 0075–0078
  perform set_config('request.jwt.claims', null, true);
  declare v_ed2 uuid; v_map2 uuid; v_tid2 uuid; v_karg jsonb; v_n integer;
  begin
    select e.id into v_ed2 from event e where e.is_edition and e.slug = 'fls27';
    v_karg := jsonb_build_object('_id','tkt_karg','eventId','evt_test_0071','ticketTypeId','tt_unbekannt',
                                 'barcode','B-KARG','status','VALID','updatedAt','2027-01-05T12:00:00Z','firstname','Alt');
    v_res := ingest_vivenu_ticket(v_karg);
    v_tid2 := (v_res->>'ticket_id')::uuid;
    insert into t_res values ('11_karges_ticket',
      v_res->>'outcome' || ' fehlt=' || (v_res->>'pass_type_missing')
      || ' pass=' || coalesce((select pass_type from ticket where id = v_tid2), 'null')
      || ' pers=' || (select personalization_status from ticket where id = v_tid2)
      || ' addons=' || (select addons::text from ticket where id = v_tid2)
      || ' waehrung=' || (select currency from ticket where id = v_tid2));
    v_res := ingest_vivenu_ticket(v_karg || jsonb_build_object('updatedAt','2027-01-05T10:00:00Z','firstname','Aelter'));
    insert into t_res values ('12_veraltet_verworfen',
      v_res->>'outcome' || ' name=' || (select holder_first_name from ticket where id = v_tid2));
    v_res := ingest_vivenu_ticket(v_karg || jsonb_build_object('updatedAt','2027-01-06T10:00:00Z','firstname','Neuer'));
    insert into t_res values ('13_neuer_greift',
      v_res->>'outcome' || ' name=' || (select holder_first_name from ticket where id = v_tid2));
    insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type)
    values (v_ed2, 'tt_unbekannt', 'Nachgetragen', 'investor') returning id into v_map2;
    v_n := backfill_ticket_pass_types();
    insert into t_res values ('14_nachgetragen',
      'gefuellt=' || v_n::text || ' pass=' || coalesce((select pass_type from ticket where id = v_tid2), 'null'));
    insert into t_res values ('15_backfill_idempotent', backfill_ticket_pass_types()::text);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  insert into t_res values ('10_grants',
    'ingest=' || has_function_privilege('authenticated','ingest_vivenu_ticket(jsonb)','execute')::text ||
    ' secret_fn=' || has_function_privilege('authenticated','set_ticket_secret(uuid,text)','execute')::text ||
    ' recount=' || has_function_privilege('authenticated','recount_allocation_usage(uuid)','execute')::text ||
    ' secret_tabelle=' || has_table_privilege('authenticated','ticket_secret','select')::text ||
    ' ticket_secret_spalte=' || (exists (select 1 from information_schema.columns
                                          where table_schema='public' and table_name='ticket' and column_name='secret'))::text ||
    ' backfill=' || has_function_privilege('authenticated','backfill_ticket_pass_types()','execute')::text);
end $$;
select * from t_res order by step;
rollback;
