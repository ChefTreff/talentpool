-- 0071 · vivenu-Ticket-Ingest (Arbeitsauftrag Welle 4, PR 23; ergänzt Welle 1 A7b nach den vivenu-Antworten vom 11.09.).
-- Webhook und Sweep schreiben Tickets über eine einzige Funktion, damit beide Wege dasselbe tun.
-- Neu an `ticket`: `meta` und `extra_fields` (Join-Key und Zusatzfelder aus dem Checkout), `vivenu_discount_id`
-- (eingelöster Coupon). Letzteres macht die Zählung der Einlösungen idempotent: `used_count` wird **neu gezählt**,
-- nicht hochgezählt — vivenu wiederholt einen Webhook bis zu siebenmal.
-- ACHTUNG: diese Migration legte zusätzlich `ticket.secret` an. Das war ein Fehler (siehe 0072): `authenticated` hat
-- einen Tabellen-Grant auf `ticket`, ein Spalten-Revoke greift dagegen nicht. 0072 zieht das Secret in eine eigene Tabelle.
-- Angewendete Fassung, unverändert dokumentiert; Korrektur ausschliesslich über 0072.
-- Abweichungen: keine. Personen werden hier **nicht** angelegt; die Zuordnung passiert über eine vorhandene Mailadresse.
set search_path = public, extensions;

alter table ticket add column if not exists secret text;
alter table ticket add column if not exists meta jsonb;
alter table ticket add column if not exists extra_fields jsonb;
alter table ticket add column if not exists vivenu_discount_id text;

comment on column ticket.secret is 'vivenu-Ticket-Secret für die Personalisierung. Nur service_role — nie an den Browser.';
comment on column ticket.vivenu_discount_id is 'Eingelöster Coupon (appliedDiscountInfo[].discountId), Grundlage für org_ticket_allocation.used_count.';


create index if not exists ticket_discount_idx on ticket (vivenu_discount_id) where vivenu_discount_id is not null;

/**
 * Einlösungen eines Kontingents neu zählen.
 *
 * Gezählt werden gültige Tickets mit dem Coupon dieses Kontingents. Neu zählen
 * statt hochzählen: der Webhook kommt bis zu siebenmal, und der Sweep läuft
 * ohnehin regelmässig über dieselben Tickets.
 */
create or replace function recount_allocation_usage(p_allocation_id uuid) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_a org_ticket_allocation; v_n integer;
begin
  select * into v_a from org_ticket_allocation where id = p_allocation_id;
  if not found or v_a.vivenu_coupon_id is null then return 0; end if;
  select count(*)::integer into v_n from ticket t
   where t.vivenu_discount_id = v_a.vivenu_coupon_id and t.status <> 'cancelled';
  update org_ticket_allocation set used_count = v_n where id = p_allocation_id;
  return v_n;
end $$;
revoke execute on function recount_allocation_usage(uuid) from public, anon, authenticated;

/**
 * Ein vivenu-Ticket übernehmen. Nur service_role (Webhook-Route und Sweep).
 *
 * `p_data` ist das Ticket-Objekt von vivenu, ergänzt um `transactionId`.
 * Antwort: `{ticket_id, outcome}` mit `created` | `updated` | `unknown_event`.
 *
 * Die Person wird **nicht** angelegt: gibt es zur Inhaber-Adresse schon eine,
 * wird verknüpft, sonst bleibt `person_id` leer und die Zuordnung passiert,
 * sobald sich die Person anmeldet (`claim_or_create_person`).
 */
create or replace function ingest_vivenu_ticket(p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_event uuid; v_map ticket_type_map; v_existing ticket; v_id uuid; v_person uuid; v_alloc uuid;
        v_holder text; v_buyer text; v_discount text; v_outcome text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;

  select e.id into v_event from event e where e.vivenu_event_id = nullif(p_data->>'eventId', '');
  if v_event is null then
    return jsonb_build_object('ticket_id', null, 'outcome', 'unknown_event');
  end if;

  select * into v_map from ticket_type_map m
   where m.event_id = v_event and m.vivenu_ticket_type_id = nullif(p_data->>'ticketTypeId', '');

  v_holder := lower(nullif(btrim(coalesce(p_data->>'holderEmail', p_data->'extraFields'->>'email', '')), ''));
  v_buyer := lower(nullif(btrim(coalesce(p_data->>'email', '')), ''));
  -- Erst der Inhaber, dann der Käufer: das Ticket gehört dem, der drauf steht.
  select pe.person_id into v_person from person_email pe
   where pe.email::text = coalesce(v_holder, v_buyer) limit 1;
  v_discount := nullif(p_data->'appliedDiscountInfo'->0->>'discountId', '');

  select * into v_existing from ticket where vivenu_ticket_id = p_data->>'_id';
  if found then
    update ticket set
      event_id = v_event,
      ticket_type_map_id = coalesce(v_map.id, ticket_type_map_id),
      pass_type = coalesce(v_map.pass_type, pass_type),
      barcode = coalesce(nullif(p_data->>'barcode', ''), barcode),
      secret = coalesce(nullif(p_data->>'secret', ''), secret),
      vivenu_transaction_id = coalesce(nullif(p_data->>'transactionId', ''), vivenu_transaction_id),
      vivenu_customer_id = coalesce(nullif(p_data->>'customerId', ''), vivenu_customer_id),
      buyer_email = coalesce(v_buyer::citext, buyer_email),
      holder_email = coalesce(v_holder::citext, holder_email),
      holder_first_name = coalesce(nullif(p_data->>'firstname', ''), holder_first_name),
      holder_last_name = coalesce(nullif(p_data->>'lastname', ''), holder_last_name),
      holder_company = coalesce(nullif(p_data->>'company', ''), holder_company),
      status = coalesce(nullif(lower(p_data->>'status'), ''), status),
      personalization_status = coalesce(nullif(lower(p_data->>'personalizationStatus'), ''), personalization_status),
      addons = coalesce(p_data->'addOns', addons),
      meta = coalesce(p_data->'meta', meta),
      extra_fields = coalesce(p_data->'extraFields', extra_fields),
      vivenu_discount_id = coalesce(v_discount, vivenu_discount_id),
      price_cents = coalesce((p_data->>'realPrice')::numeric::integer, price_cents),
      currency = coalesce(nullif(p_data->>'currency', ''), currency),
      person_id = coalesce(person_id, v_person),
      purchased_at = coalesce(nullif(p_data->>'createdAt', '')::timestamptz, purchased_at),
      updated_at = now()
    where id = v_existing.id
    returning id into v_id;
    v_outcome := 'updated';
  else
    insert into ticket (event_id, ticket_type_map_id, pass_type, barcode, secret, vivenu_ticket_id, vivenu_transaction_id,
                        vivenu_customer_id, buyer_email, holder_email, holder_first_name, holder_last_name, holder_company,
                        status, personalization_status, addons, meta, extra_fields, vivenu_discount_id,
                        price_cents, currency, source, person_id, purchased_at)
    values (v_event, v_map.id, coalesce(v_map.pass_type, 'professional'), nullif(p_data->>'barcode', ''),
            nullif(p_data->>'secret', ''), p_data->>'_id', nullif(p_data->>'transactionId', ''),
            nullif(p_data->>'customerId', ''), v_buyer::citext, v_holder::citext,
            nullif(p_data->>'firstname', ''), nullif(p_data->>'lastname', ''), nullif(p_data->>'company', ''),
            coalesce(nullif(lower(p_data->>'status'), ''), 'valid'),
            nullif(lower(p_data->>'personalizationStatus'), ''),
            p_data->'addOns', p_data->'meta', p_data->'extraFields', v_discount,
            (p_data->>'realPrice')::numeric::integer, nullif(p_data->>'currency', ''), 'vivenu', v_person,
            nullif(p_data->>'createdAt', '')::timestamptz)
    returning id into v_id;
    v_outcome := 'created';
  end if;

  -- Einlösungen des zugehörigen Kontingents neu zählen (idempotent).
  if v_discount is not null then
    select a.id into v_alloc from org_ticket_allocation a where a.vivenu_coupon_id = v_discount limit 1;
    if v_alloc is not null then perform recount_allocation_usage(v_alloc); end if;
  end if;

  return jsonb_build_object('ticket_id', v_id, 'outcome', v_outcome);
end $$;
revoke execute on function ingest_vivenu_ticket(jsonb) from public, anon, authenticated;

/** Editionen mit vivenu-Event — der Sweep braucht sie, Team darf sie sehen. */
create or replace function vivenu_editions()
returns table (edition_id uuid, slug text, name text, vivenu_event_id text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.slug, e.name, e.vivenu_event_id
      from event e where e.is_edition and e.vivenu_event_id is not null
      order by e.start_date desc nulls last;
end $$;

select harden_definer_functions();
