-- Smoke-Test zu 0080. Läuft in `begin … rollback`.
--   1. `personalized: true` ohne `personalizationStatus` ⇒ `partial`.
--   2. Ein bereits erreichtes `complete` wird davon nicht zurückgestuft.
--   3. Ein ausdrückliches `COMPLETE` von vivenu gilt weiterhin.
begin;

do $$
declare v_event uuid; v_vivenu text; v_type text := 'zztest-pers-typ'; v_res jsonb; v_pers text;
begin
  select id, vivenu_event_id into v_event, v_vivenu from event where is_edition and vivenu_event_id is not null limit 1;
  insert into ticket_type_map (event_id, vivenu_ticket_type_id, vivenu_ticket_name, pass_type)
  values (v_event, v_type, 'ZZTEST Pers', 'crew');

  v_res := ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'zztest-pers-1', 'eventId', v_vivenu, 'ticketTypeId', v_type,
    'barcode', 'zztestpers1', 'status', 'VALID'));
  select personalization_status into v_pers from ticket where vivenu_ticket_id = 'zztest-pers-1';
  if v_pers <> 'pending' then raise exception 'Ausgangslage falsch: %', v_pers; end if;

  perform ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'zztest-pers-1', 'eventId', v_vivenu, 'ticketTypeId', v_type,
    'barcode', 'zztestpers1', 'status', 'VALID', 'personalized', true,
    'firstname', 'ZZTEST', 'lastname', 'Personalisiert'));
  select personalization_status into v_pers from ticket where vivenu_ticket_id = 'zztest-pers-1';
  if v_pers <> 'partial' then raise exception '1 fehlgeschlagen: % statt partial', v_pers; end if;

  update ticket set personalization_status = 'complete' where vivenu_ticket_id = 'zztest-pers-1';
  perform ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'zztest-pers-1', 'eventId', v_vivenu, 'ticketTypeId', v_type,
    'barcode', 'zztestpers1', 'status', 'VALID', 'personalized', true));
  select personalization_status into v_pers from ticket where vivenu_ticket_id = 'zztest-pers-1';
  if v_pers <> 'complete' then raise exception '2 fehlgeschlagen: % statt complete', v_pers; end if;

  update ticket set personalization_status = 'pending' where vivenu_ticket_id = 'zztest-pers-1';
  perform ingest_vivenu_ticket(jsonb_build_object(
    '_id', 'zztest-pers-1', 'eventId', v_vivenu, 'ticketTypeId', v_type,
    'barcode', 'zztestpers1', 'status', 'VALID', 'personalizationStatus', 'COMPLETE'));
  select personalization_status into v_pers from ticket where vivenu_ticket_id = 'zztest-pers-1';
  if v_pers <> 'complete' then raise exception '3 fehlgeschlagen: % statt complete', v_pers; end if;
end $$;

rollback;
