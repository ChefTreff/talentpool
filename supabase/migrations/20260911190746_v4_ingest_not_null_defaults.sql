-- 0078 · Ingest: alle NOT-NULL-Spalten von `ticket` auf einmal absichern (Abschluss der Kette 0075–0077).
-- Ich habe die Constraints einzeln erraten und mir damit zwei Runden eingehandelt. Diesmal alle auf einmal:
-- `addons`, `currency`, `personalization_status`, `status` und `source` sind NOT NULL **mit Default** — ein ausdrückliches
-- NULL im Insert sticht den Default aus. Bei einem Webhook, dem ein Feld fehlt, wäre der Insert mit 23502 gescheitert,
-- vivenu hätte siebenmal wiederholt und das Ticket wäre verloren gewesen. Jetzt trägt jede dieser Spalten ihren Rückfall.
-- Abweichungen: keine.
set search_path = public, extensions;

create or replace function ingest_vivenu_ticket(p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_event uuid; v_map ticket_type_map; v_existing ticket; v_id uuid; v_person uuid; v_alloc uuid;
        v_holder text; v_buyer text; v_discount text; v_outcome text; v_status text; v_pers text;
        v_updated timestamptz; v_type text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;

  select e.id into v_event from event e where e.vivenu_event_id = nullif(p_data->>'eventId', '');
  if v_event is null then
    return jsonb_build_object('ticket_id', null, 'outcome', 'unknown_event');
  end if;

  v_type := nullif(p_data->>'ticketTypeId', '');
  select * into v_map from ticket_type_map m where m.event_id = v_event and m.vivenu_ticket_type_id = v_type;

  v_holder := lower(nullif(btrim(coalesce(p_data->>'holderEmail', p_data->'extraFields'->>'email', '')), ''));
  v_buyer := lower(nullif(btrim(coalesce(p_data->>'email', '')), ''));
  select pe.person_id into v_person from person_email pe
   where pe.email::text = coalesce(v_holder, v_buyer) limit 1;
  v_discount := nullif(p_data->'appliedDiscountInfo'->0->>'discountId', '');
  v_status := vivenu_ticket_status(p_data->>'status');
  v_pers := vivenu_personalization_status(p_data->>'personalizationStatus');
  v_updated := nullif(p_data->>'updatedAt', '')::timestamptz;

  select * into v_existing from ticket where vivenu_ticket_id = p_data->>'_id';
  if found then
    -- Out-of-order: ein älterer Stand darf einen neueren nicht überschreiben.
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
    insert into ticket (event_id, ticket_type_map_id, vivenu_ticket_type_id, pass_type, barcode, vivenu_ticket_id,
                        vivenu_transaction_id, vivenu_customer_id, buyer_email, holder_email, holder_first_name,
                        holder_last_name, holder_company, status, personalization_status, addons, meta, extra_fields,
                        vivenu_discount_id, price_cents, currency, source, person_id, purchased_at, vivenu_updated_at)
    values (v_event, v_map.id, v_type, v_map.pass_type, nullif(p_data->>'barcode', ''), p_data->>'_id',
            nullif(p_data->>'transactionId', ''), nullif(p_data->>'customerId', ''), v_buyer::citext, v_holder::citext,
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

  if v_discount is not null then
    select a.id into v_alloc from org_ticket_allocation a where a.vivenu_coupon_id = v_discount limit 1;
    if v_alloc is not null then perform recount_allocation_usage(v_alloc); end if;
  end if;

  return jsonb_build_object('ticket_id', v_id, 'outcome', v_outcome,
                            'ticket_type_id', v_type,
                            'pass_type_missing', v_map.id is null and v_type is not null);
end $$;
revoke execute on function ingest_vivenu_ticket(jsonb) from public, anon, authenticated;

select harden_definer_functions();
