-- Smoke-Test zu 0079 (Kontingente über den Undershop).
-- Läuft in `begin … rollback`, hinterlässt nichts. Pass-Typ `crew`, weil
-- (event, org, pass_type) eindeutig ist und partner/talent/investor belegt sind.
--
--   1. `ingest_vivenu_ticket` schreibt `underShopId` in `ticket.vivenu_undershop_id`.
--   2. `recount_allocation_usage` zählt über Undershop + Pass-Typ, ohne Coupon.
--   3. `appliedDiscountInfo` in der Objektform wird gelesen.
--   4. `ticket_allocations_of_orgs` liefert auch bereits aktive Zeilen.
begin;

do $$
declare v_event uuid; v_org uuid; v_alloc uuid; v_res jsonb; v_used integer; v_n integer;
        v_shop text := 'zztest-undershop'; v_type text := 'zztest-typ'; v_vivenu text;
begin
  select id, vivenu_event_id into v_event, v_vivenu from event where is_edition and vivenu_event_id is not null limit 1;
  if v_event is null then raise exception 'keine Edition mit vivenu_event_id'; end if;
  select org_id into v_org from org_ticket_allocation where event_id = v_event limit 1;

  insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type)
  values (v_event, v_type, 'ZZTEST Typ', 'crew');

  insert into org_ticket_allocation (org_id, event_id, pass_type, quantity, status, vivenu_undershop_id)
  values (v_org, v_event, 'crew', 3, 'active', v_shop) returning id into v_alloc;

  v_res := ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'zztest-ticket-1', 'eventId', v_vivenu, 'ticketTypeId', v_type, 'underShopId', v_shop,
    'barcode', 'zztestbarcode', 'status', 'VALID', 'email', 'delivered+zztest@resend.dev',
    'appliedDiscountInfo', jsonb_build_object('discounts', jsonb_build_array(jsonb_build_object('discountId', 'zztest-coupon')))));

  if v_res->>'outcome' <> 'created' then raise exception '1 fehlgeschlagen: %', v_res; end if;

  select vivenu_undershop_id, (vivenu_discount_id = 'zztest-coupon')::int into strict v_shop, v_n
    from ticket where vivenu_ticket_id = 'zztest-ticket-1';
  if v_shop <> 'zztest-undershop' then raise exception '1 fehlgeschlagen: underShopId nicht gespeichert'; end if;
  if v_n <> 1 then raise exception '3 fehlgeschlagen: discountId aus der Objektform nicht gelesen'; end if;

  select used_count into v_used from org_ticket_allocation where id = v_alloc;
  if v_used <> 1 then raise exception '2 fehlgeschlagen: used_count ist %, erwartet 1', v_used; end if;

  select count(*) into v_n from ticket_allocations_of_orgs(v_event, array[v_org])
   where status = 'active' and pass_type = 'crew';
  if v_n < 1 then raise exception '4 fehlgeschlagen: aktive Zeile fehlt im vollständigen Bild'; end if;

  raise notice 'alle vier Prüfungen grün';
end $$;

rollback;
