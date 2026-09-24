-- 0175 · Speaker-Ticket ausstellen: Lesefunktion und Wettlaufschutz (SPK-068)
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924192658.
-- (Nummer vergibt die Architektur-Session.)
--
-- Konrad will Freitickets fuer Speaker aus dem Admin ausstellen koennen. Die
-- Server-Action legt das Ticket bei vivenu an und schreibt es hier zurueck.
-- Diese Migration liefert dafuer zwei Dinge.
--
-- **1 · Was die Action wissen muss**, um das Ticket anzulegen: Inhaberin,
-- vivenu-Event der Edition und der Tickettyp aus `ticket_type_map` zum
-- Pass-Typ. Als eigene Lesefunktion statt vieler Einzelabfragen im Anwendungs-
-- code — und mit denselben Statusregeln, die `set_ticket_issued` gleich danach
-- noch einmal prueft: Wer hier „nicht dran" liest, bekommt gar nicht erst einen
-- vivenu-Aufruf.
--
-- **2 · Der Wettlauf mit dem Webhook.** `ticket.created` trifft oft ein, bevor
-- `set_ticket_issued` gelaufen ist. `ingest_vivenu_ticket` sucht bisher nur
-- ueber `vivenu_ticket_id` — die steht zu dem Zeitpunkt noch nicht bei uns.
-- Folge (am Schema geprueft, nicht vermutet): der Ingest legt eine **zweite**
-- Zeile an, und `set_ticket_issued` scheitert danach am eindeutigen Index
-- `ticket_vivenu_ticket_id_key` mit 23505 — nachdem das Ticket bei vivenu schon
-- existiert. Der Ingest erkennt unsere Tickets jetzt zusaetzlich an `batch`
-- (dort steht unsere Ticket-Kennung) und **aktualisiert** die vorhandene Zeile.
--
-- Abweichungen: keine.

set search_path = public, extensions;

-- 1 · Was die Action zum Ausstellen braucht ---------------------------------------

create or replace function speaker_ticket_for_issue(p_ticket_id uuid)
 RETURNS TABLE(ticket_id uuid, source text, status text, pass_type text, lounge_access boolean,
               holder_first_name text, holder_last_name text, holder_email text,
               vivenu_event_id text, vivenu_ticket_type_id text, ticket_type_map_id uuid,
               vivenu_ticket_id text, speaker_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  -- Beide Kontexte: das Team im Admin, der Server ohne Anmeldung (Lehre 0120).
  if auth.uid() is not null and not is_speaker_team(v_sp.edition_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.source not in ('speaker', 'speaker_companion') then
    raise exception 'not_a_free_ticket' using errcode = 'P0001', detail = v_t.source;
  end if;
  return query
    select v_t.id, v_t.source, v_t.status, v_t.pass_type, coalesce(v_t.lounge_access, false),
           coalesce(v_t.holder_first_name, p.first_name),
           coalesce(v_t.holder_last_name, p.last_name),
           coalesce(v_t.holder_email::text, pe.email::text),
           e.vivenu_event_id,
           m.vivenu_ticket_type_id, m.id,
           v_t.vivenu_ticket_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from event e
      left join person p on p.id = v_sp.person_id and p.deleted_at is null
      left join person_email pe on pe.person_id = p.id and pe.is_primary
      -- Der Tickettyp haengt am Pass-Typ des Tickets; ohne Zuordnung bleibt die
      -- Spalte leer und die Action bricht mit einem eigenen Schluessel ab,
      -- statt vivenu einen leeren Typ zu schicken.
      --
      -- **Genau eine** Zuordnung: `ticket_type_map` kann mehrere aktive Zeilen
      -- je Pass-Typ tragen (verschiedene vivenu-Typen). Ein gewoehnlicher Join
      -- gaebe dann mehrere Zeilen zurueck, und die Action naehme willkuerlich
      -- die erste — im Test zweimal derselbe Speaker mit zwei Typen.
      left join lateral (
        select m2.id, m2.vivenu_ticket_type_id
          from ticket_type_map m2
         where m2.event_id = e.id and m2.active
           and m2.pass_type = coalesce(v_t.pass_type, 'speaker')
         order by m2.created_at, m2.id
         limit 1) m on true
     where e.id = v_sp.edition_id;
end $$;

-- 2 · Der Ingest erkennt unsere eigenen Freitickets -----------------------------------
-- Basis: supabase/snapshot/functions/ingest_vivenu_ticket.sql. Geaendert ist nur
-- die Suche nach der vorhandenen Zeile.

create or replace function ingest_vivenu_ticket(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_map ticket_type_map; v_existing ticket; v_id uuid; v_person uuid; v_alloc uuid;
        v_holder text; v_buyer text; v_discount text; v_outcome text; v_status text; v_pers text;
        v_updated timestamptz; v_type text; v_shop text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;

  select e.id into v_event from event e where e.vivenu_event_id = nullif(p_data->>'eventId', '');
  if v_event is null then
    return jsonb_build_object('ticket_id', null, 'outcome', 'unknown_event');
  end if;

  v_type := nullif(p_data->>'ticketTypeId', '');
  v_shop := nullif(p_data->>'underShopId', '');
  select * into v_map from ticket_type_map m where m.event_id = v_event and m.vivenu_ticket_type_id = v_type;

  v_holder := lower(nullif(btrim(coalesce(p_data->>'holderEmail', p_data->'extraFields'->>'email', '')), ''));
  v_buyer := lower(nullif(btrim(coalesce(p_data->>'email', '')), ''));
  select pe.person_id into v_person from person_email pe
   where pe.email::text = coalesce(v_holder, v_buyer) limit 1;
  -- Objekt, nicht Array: erst die Zusammenfassung, sonst die Position des Tickets.
  v_discount := coalesce(
    nullif(p_data->'appliedDiscountInfo'->'discounts'->0->>'discountId', ''),
    nullif(p_data->'appliedDiscountInfo'->'items'->0->'varDiscounts'->0->>'discountId', ''),
    nullif(p_data->'appliedDiscountInfo'->0->>'discountId', ''));
  v_status := vivenu_ticket_status(p_data->>'status');
  -- vivenu schickt am `ticket.updated` **kein** `personalizationStatus`, sondern
  -- `personalized: true`. Ohne diesen Rückfall bliebe ein personalisiertes
  -- Ticket bei uns auf `pending` stehen.
  v_pers := coalesce(
    vivenu_personalization_status(p_data->>'personalizationStatus'),
    case when coalesce((p_data->>'personalized')::boolean, false) then 'partial' end);
  v_updated := nullif(p_data->>'updatedAt', '')::timestamptz;

  select * into v_existing from ticket where vivenu_ticket_id = p_data->>'_id';
  -- SPK-068: Freitickets, die **wir** anlegen, tragen unsere Ticket-Kennung als
  -- `batch` (vivenu `POST /api/tickets/free`, Feld `batchId`). Der Webhook
  -- `ticket.created` kommt dafuer oft an, **bevor** die Server-Action
  -- `set_ticket_issued` die vivenu-Kennung bei uns eingetragen hat. Ohne diesen
  -- zweiten Weg faende der Ingest nichts, legte eine **zweite** Zeile an
  -- (`source = 'vivenu'`) — und `set_ticket_issued` scheiterte danach am
  -- eindeutigen Index `ticket_vivenu_ticket_id_key` (23505), nachdem das Ticket
  -- bei vivenu bereits existiert. Ein zweiter Klick haette dann ein zweites
  -- Ticket erzeugt.
  if not found and nullif(p_data->>'batch', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_existing from ticket
     where id = (p_data->>'batch')::uuid
       and source in ('speaker', 'speaker_companion')
       and vivenu_ticket_id is null;
  end if;
  if v_existing.id is not null then
    if v_updated is not null and v_existing.vivenu_updated_at is not null
       and v_updated < v_existing.vivenu_updated_at then
      return jsonb_build_object('ticket_id', v_existing.id, 'outcome', 'stale',
                                'ticket_type_id', v_type,
                                'pass_type_missing', v_map.id is null and v_type is not null);
    end if;
    update ticket set
      event_id = v_event,
      -- Ueber `batch` gefunden heisst: die Kennung steht bei uns noch **nicht**.
      -- Ohne diese Zeile bliebe sie leer, der naechste Webhook fiele wieder auf
      -- den `batch`-Weg zurueck und `set_ticket_issued` fände nie ein Ticket,
      -- das schon ausgestellt ist.
      vivenu_ticket_id = coalesce(nullif(p_data->>'_id', ''), vivenu_ticket_id),
      ticket_type_map_id = coalesce(v_map.id, ticket_type_map_id),
      vivenu_ticket_type_id = coalesce(v_type, vivenu_ticket_type_id),
      vivenu_undershop_id = coalesce(v_shop, vivenu_undershop_id),
      pass_type = coalesce(v_map.pass_type, pass_type),
      barcode = coalesce(nullif(p_data->>'barcode', ''), barcode),
      vivenu_transaction_id = coalesce(nullif(p_data->>'transactionId', ''), vivenu_transaction_id),
      vivenu_customer_id = coalesce(nullif(p_data->>'customerId', ''), vivenu_customer_id),
      buyer_email = coalesce(v_buyer::citext, buyer_email),
      holder_email = coalesce(v_holder::citext, holder_email),
      holder_first_name = coalesce(nullif(p_data->>'firstname', ''), holder_first_name),
      holder_last_name = coalesce(nullif(p_data->>'lastname', ''), holder_last_name),
      holder_company = coalesce(nullif(p_data->>'company', ''), holder_company),
      status = coalesce(v_status, status),
      -- Nie zurückstufen: unser `complete` heisst „Badge-Angaben vollständig",
      -- davon weiss vivenu nichts. `partial` von dort darf das nicht überschreiben.
      personalization_status = case when personalization_status = 'complete' then 'complete'
                                    else coalesce(v_pers, personalization_status) end,
      addons = coalesce(p_data->'addOns', addons),
      meta = coalesce(p_data->'meta', meta),
      extra_fields = coalesce(p_data->'extraFields', extra_fields),
      vivenu_discount_id = coalesce(v_discount, vivenu_discount_id),
      price_cents = coalesce((p_data->>'realPrice')::numeric::integer, price_cents),
      currency = coalesce(nullif(p_data->>'currency', ''), currency),
      person_id = coalesce(person_id, v_person),
      purchased_at = coalesce(nullif(p_data->>'createdAt', '')::timestamptz, purchased_at),
      vivenu_updated_at = coalesce(v_updated, vivenu_updated_at),
      updated_at = now()
    where id = v_existing.id
    returning id into v_id;
    v_outcome := 'updated';
  else
    insert into ticket (event_id, ticket_type_map_id, vivenu_ticket_type_id, vivenu_undershop_id, pass_type, barcode,
                        vivenu_ticket_id, vivenu_transaction_id, vivenu_customer_id, buyer_email, holder_email,
                        holder_first_name, holder_last_name, holder_company, status, personalization_status, addons,
                        meta, extra_fields, vivenu_discount_id, price_cents, currency, source, person_id, purchased_at,
                        vivenu_updated_at)
    values (v_event, v_map.id, v_type, v_shop, v_map.pass_type, nullif(p_data->>'barcode', ''),
            p_data->>'_id', nullif(p_data->>'transactionId', ''), nullif(p_data->>'customerId', ''),
            v_buyer::citext, v_holder::citext,
            nullif(p_data->>'firstname', ''), nullif(p_data->>'lastname', ''), nullif(p_data->>'company', ''),
            -- Jede NOT-NULL-Spalte mit Default braucht hier ihren Rückfall: ein
            -- ausdrückliches NULL sticht den Default aus.
            coalesce(v_status, 'valid'),
            coalesce(v_pers, 'pending'),
            coalesce(p_data->'addOns', '[]'::jsonb),
            p_data->'meta', p_data->'extraFields', v_discount,
            (p_data->>'realPrice')::numeric::integer,
            coalesce(nullif(p_data->>'currency', ''), 'EUR'),
            'vivenu', v_person,
            nullif(p_data->>'createdAt', '')::timestamptz, v_updated)
    returning id into v_id;
    v_outcome := 'created';
  end if;

  perform set_ticket_secret(v_id, p_data->>'secret');

  -- Kontingent über den Undershop, sonst über den Coupon.
  v_alloc := null;
  if v_shop is not null and v_map.pass_type is not null then
    select a.id into v_alloc from org_ticket_allocation a
     where a.vivenu_undershop_id = v_shop and a.pass_type = v_map.pass_type and a.event_id = v_event limit 1;
  end if;
  if v_alloc is null and v_discount is not null then
    select a.id into v_alloc from org_ticket_allocation a where a.vivenu_coupon_id = v_discount limit 1;
  end if;
  if v_alloc is not null then perform recount_allocation_usage(v_alloc); end if;

  return jsonb_build_object('ticket_id', v_id, 'outcome', v_outcome,
                            'ticket_type_id', v_type,
                            'pass_type_missing', v_map.id is null and v_type is not null);
end $$;

-- 3 · Ausstellen bleibt idempotent ---------------------------------------------------
-- Basis: supabase/snapshot/functions/set_ticket_issued.sql. Neu ist genau die
-- Abkuerzung fuer den Fall, dass der Webhook schneller war.

create or replace function set_ticket_issued(p_ticket_id uuid, p_vivenu_ticket_id text, p_barcode text, p_vivenu_transaction_id text DEFAULT NULL::text, p_ticket_type_map_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if auth.uid() is not null and not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.source not in ('speaker', 'speaker_companion') then raise exception 'not_a_free_ticket' using errcode = 'P0001', detail = v_t.source; end if;
  -- SPK-068: Der Webhook `ticket.created` kann schneller sein als die
  -- Server-Action und das Ticket bereits auf `valid` gesetzt haben. Traegt die
  -- Zeile dieselbe vivenu-Kennung, ist nichts mehr zu tun — ein Fehler hier
  -- hiesse: das Ticket existiert bei vivenu, die Oberflaeche meldet aber einen
  -- Fehlschlag, und der naechste Klick legte ein zweites an. Schuetzt zugleich
  -- gegen den Doppelklick.
  if v_t.vivenu_ticket_id is not null and v_t.vivenu_ticket_id = btrim(coalesce(p_vivenu_ticket_id, '')) then
    -- Still zurueckkehren, aber nicht spurlos: die Admin-Aktion hat stattgefunden
    -- und gehoert ins Audit-Log, auch wenn der Webhook die Zeile schon gefuellt hat.
    perform log_audit('ticket.issued', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                      jsonb_build_object('status', v_t.status, 'source', v_t.source,
                                         'vivenu_ticket_id', v_t.vivenu_ticket_id, 'via', 'webhook_first'));
    return;
  end if;
  if v_t.source = 'speaker' and v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  if v_t.source = 'speaker_companion' and v_t.status <> 'approved' then raise exception 'not_approved' using errcode = 'P0001', detail = v_t.status; end if;
  if nullif(btrim(coalesce(p_barcode, '')), '') is null or nullif(btrim(coalesce(p_vivenu_ticket_id, '')), '') is null then
    raise exception 'barcode_required' using errcode = '22023';
  end if;
  update ticket set status = 'valid', barcode = btrim(p_barcode), vivenu_ticket_id = btrim(p_vivenu_ticket_id),
                    vivenu_transaction_id = coalesce(nullif(btrim(p_vivenu_transaction_id), ''), vivenu_transaction_id),
                    ticket_type_map_id = coalesce(p_ticket_type_map_id, ticket_type_map_id), purchased_at = now()
   where id = p_ticket_id;
  perform log_audit('ticket.issued', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'valid', 'source', v_t.source, 'vivenu_ticket_id', btrim(p_vivenu_ticket_id)));
end $$;

select harden_definer_functions();
