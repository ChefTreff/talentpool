-- 0079 · Kontingente: Undershop als Schlüssel, vollständiges Bild je Partner.
--
-- Zwei Funde aus dem Sandbox-Lauf am 12.09.:
--
-- 1. `appliedDiscountInfo` ist **kein Array am Ticket**. Das Feld hängt an der
--    Transaktion und ist ein Objekt: `{items:[{varDiscounts:[{discountId}]}], discounts:[{discountId}]}`.
--    Am `ticket.created`-Webhook steht es gar nicht. `ingest_vivenu_ticket` las
--    `appliedDiscountInfo->0->>'discountId'` und bekam immer NULL — die Einlösung
--    eines Partner-Kontingents wäre nie gezählt worden, `used_count` bliebe 0 und
--    ein Partner könnte über sein Kontingent hinaus kaufen.
--    Das Ticket führt dafür `underShopId`, und je Partner und Edition gibt es
--    genau einen Undershop. Über ihn und den Pass-Typ ist das Kontingent
--    eindeutig — ohne Umweg über den Coupon und auch dann richtig, wenn jemand
--    den Coupon im Dashboard tauscht.
--
-- 2. `ticket_allocations_pending()` liefert nur offene Zeilen. Der Sync formt
--    daraus aber den **ganzen** Undershop (Kontingent, Obergrenze, welche
--    Tickettypen offen sind). Stand nur eine Zeile einer Org offen, hat der Lauf
--    am 12.09. den Shop des Partners leergeräumt: maxAmount 0, alle Tickettypen
--    inaktiv. `ticket_allocations_of_orgs()` gibt das vollständige Bild je Org;
--    der Sync formt den Shop daraus und schreibt nur die offenen Zeilen fort.
--
-- Abweichungen: keine.
set search_path = public, extensions;

alter table ticket add column if not exists vivenu_undershop_id text;
comment on column ticket.vivenu_undershop_id is
  'Undershop, aus dem das Ticket kam (vivenu `underShopId`) — Schlüssel auf das Partner-Kontingent.';
create index if not exists ticket_undershop_pass_idx
  on ticket (vivenu_undershop_id, pass_type) where vivenu_undershop_id is not null;

-- Kein Grant: `ticket` hat seit 0074 Spalten-Grants, die neue Spalte bleibt
-- absichtlich draussen (authenticated liest nur id, event_id, person_id, status, barcode).

create or replace function ticket_allocations_of_orgs(p_event_id uuid, p_org_ids uuid[])
returns table(id uuid, org_id uuid, org_name text, org_slug text, edition_id uuid, edition_slug text,
              vivenu_event_id text, pass_type text, quantity integer, status text, coupon_code text,
              vivenu_coupon_id text, vivenu_undershop_id text, org_undershop_id text, ticket_type_ids text[])
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), o.slug, a.event_id, e.slug, e.vivenu_event_id,
           a.pass_type, a.quantity, a.status, a.coupon_code, a.vivenu_coupon_id, a.vivenu_undershop_id,
           (select b.vivenu_undershop_id from org_ticket_allocation b
             where b.org_id = a.org_id and b.event_id = a.event_id and b.vivenu_undershop_id is not null limit 1),
           coalesce((select array_agg(m.vivenu_ticket_type_id order by m.vivenu_ticket_type_id) from ticket_type_map m
                     where m.active and m.pass_type = a.pass_type
                       and m.event_id in (select ev.id from event ev where ev.id = a.event_id or ev.edition_id = a.event_id)), '{}'::text[])
      from org_ticket_allocation a join organization o on o.id = a.org_id join event e on e.id = a.event_id
     where a.event_id = p_event_id and a.org_id = any(p_org_ids)
     order by o.id, a.pass_type;
end $$;

comment on function ticket_allocations_of_orgs(uuid, uuid[]) is
  'Alle Kontingente der genannten Orgs einer Edition — das vollständige Bild, aus dem der Sync den Undershop formt.';

create or replace function recount_allocation_usage(p_allocation_id uuid) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_a org_ticket_allocation; v_n integer;
begin
  select * into v_a from org_ticket_allocation where id = p_allocation_id;
  if not found then return 0; end if;
  -- Undershop + Pass-Typ ist der verlässliche Schlüssel; der Coupon bleibt als
  -- zweiter Weg, falls ein Ticket ohne Undershop kommt (Freitickets, POS).
  select count(*)::integer into v_n from ticket t
   where t.status <> 'cancelled'
     and t.event_id = v_a.event_id
     and ((v_a.vivenu_undershop_id is not null
           and t.vivenu_undershop_id = v_a.vivenu_undershop_id
           and t.pass_type is not distinct from v_a.pass_type)
       or (v_a.vivenu_coupon_id is not null and t.vivenu_discount_id = v_a.vivenu_coupon_id));
  update org_ticket_allocation set used_count = v_n where id = p_allocation_id;
  return v_n;
end $$;

create or replace function ingest_vivenu_ticket(p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
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
  v_pers := vivenu_personalization_status(p_data->>'personalizationStatus');
  v_updated := nullif(p_data->>'updatedAt', '')::timestamptz;

  select * into v_existing from ticket where vivenu_ticket_id = p_data->>'_id';
  if found then
    if v_updated is not null and v_existing.vivenu_updated_at is not null
       and v_updated < v_existing.vivenu_updated_at then
      return jsonb_build_object('ticket_id', v_existing.id, 'outcome', 'stale',
                                'ticket_type_id', v_type,
                                'pass_type_missing', v_map.id is null and v_type is not null);
    end if;
    update ticket set
      event_id = v_event,
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
      personalization_status = coalesce(v_pers, personalization_status),
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

select harden_definer_functions();
