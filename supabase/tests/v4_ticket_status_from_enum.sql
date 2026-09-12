-- Smoke-Test zu 0081. Läuft in `begin … rollback`.
--   1. Die fünf echten vivenu-Status bilden richtig ab.
--   2. Ein storniertes Ticket gibt den Kontingentplatz frei.
--   3. Ein reserviertes Ticket belegt gar keinen.
begin;

do $$
declare v_event uuid; v_org uuid; v_vivenu text; v_alloc uuid; v_type text := 'zztest-status-typ'; v_used integer;
begin
  if vivenu_ticket_status('INVALID') <> 'cancelled' then raise exception 'INVALID falsch'; end if;
  if vivenu_ticket_status('RESERVED') <> 'requested' then raise exception 'RESERVED falsch'; end if;
  if vivenu_ticket_status('BLANK') <> 'requested' then raise exception 'BLANK falsch'; end if;
  if vivenu_ticket_status('VALID') <> 'valid' then raise exception 'VALID falsch'; end if;
  if vivenu_ticket_status('DETAILSREQUIRED') <> 'valid' then raise exception 'DETAILSREQUIRED falsch'; end if;
  if vivenu_ticket_status('WASAUCHIMMER') is not null then raise exception 'Unbekanntes darf NULL bleiben'; end if;

  select id, vivenu_event_id into v_event, v_vivenu from event where is_edition and vivenu_event_id is not null limit 1;
  select org_id into v_org from org_ticket_allocation where event_id = v_event limit 1;
  insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type)
  values (v_event, v_type, 'ZZTEST Status', 'crew');
  insert into org_ticket_allocation (org_id, event_id, pass_type, quantity, status, vivenu_undershop_id)
  values (v_org, v_event, 'crew', 3, 'active', 'zztest-shop-status') returning id into v_alloc;

  perform ingest_vivenu_ticket(jsonb_build_object('_id', 'zztest-st-1', 'eventId', v_vivenu, 'ticketTypeId', v_type,
    'underShopId', 'zztest-shop-status', 'barcode', 'zzteststat1', 'status', 'VALID'));
  select used_count into v_used from org_ticket_allocation where id = v_alloc;
  if v_used <> 1 then raise exception 'Ausgangslage: % statt 1', v_used; end if;

  perform ingest_vivenu_ticket(jsonb_build_object('_id', 'zztest-st-1', 'eventId', v_vivenu, 'ticketTypeId', v_type,
    'underShopId', 'zztest-shop-status', 'barcode', 'zzteststat1', 'status', 'INVALID'));
  select used_count into v_used from org_ticket_allocation where id = v_alloc;
  if v_used <> 0 then raise exception '2 fehlgeschlagen: Storno gibt den Platz nicht frei (%)', v_used; end if;

  perform ingest_vivenu_ticket(jsonb_build_object('_id', 'zztest-st-2', 'eventId', v_vivenu, 'ticketTypeId', v_type,
    'underShopId', 'zztest-shop-status', 'barcode', 'zzteststat2', 'status', 'RESERVED'));
  select used_count into v_used from org_ticket_allocation where id = v_alloc;
  if v_used <> 0 then raise exception '3 fehlgeschlagen: Reservierung belegt einen Platz (%)', v_used; end if;
end $$;

rollback;
