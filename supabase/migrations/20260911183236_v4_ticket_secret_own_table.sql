-- 0072 · Ticket-Secret raus aus `ticket` (eigener Fund unmittelbar nach 0071).
-- `authenticated` hat einen **Tabellen**-Grant `select` auf `ticket`; ein Spalten-Revoke greift dagegen nicht
-- (docs/db-konventionen.md §5, Fund aus 0032). Mit 0071 wäre das vivenu-Ticket-Secret damit für die eigene Person
-- über die API lesbar gewesen — ein Secret, das die Personalisierung bei vivenu autorisiert, gehört nie in den Browser.
-- Den fremden Tabellen-Grant fasse ich in der Pause nicht an (Arbeitsauftrag Welle 4, Abschnitt E); stattdessen liegt
-- das Secret jetzt in einer eigenen Tabelle **ohne jeden Grant**. Die Spalte war leer (0 von 4 Tickets), es gehen keine Daten verloren.
-- Abweichungen: keine. `meta`, `extra_fields` und `vivenu_discount_id` bleiben an `ticket` — das sind Daten der eigenen
-- Person; der Tabellen-Grant selbst steht als Vorschlag in supabase/migrations/vorschlag/ticket-spalten-grants.sql.
set search_path = public, extensions;

create table if not exists ticket_secret (
  ticket_id  uuid primary key references ticket(id) on delete cascade,
  secret     text not null,
  updated_at timestamptz not null default now()
);
alter table ticket_secret enable row level security;
revoke all on ticket_secret from anon, authenticated;
comment on table ticket_secret is 'vivenu-Ticket-Secrets für die Personalisierung. Keine Grants, keine Policy — nur service_role.';

alter table ticket drop column if exists secret;

/** Secret ablegen. Nur service_role; die Personalisierungs-Route liest es serverseitig. */
create or replace function set_ticket_secret(p_ticket_id uuid, p_secret text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_secret, '')), '') is null then return; end if;
  insert into ticket_secret (ticket_id, secret) values (p_ticket_id, btrim(p_secret))
  on conflict (ticket_id) do update set secret = excluded.secret, updated_at = now();
end $$;
revoke execute on function set_ticket_secret(uuid, text) from public, anon, authenticated;

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
    insert into ticket (event_id, ticket_type_map_id, pass_type, barcode, vivenu_ticket_id, vivenu_transaction_id,
                        vivenu_customer_id, buyer_email, holder_email, holder_first_name, holder_last_name, holder_company,
                        status, personalization_status, addons, meta, extra_fields, vivenu_discount_id,
                        price_cents, currency, source, person_id, purchased_at)
    values (v_event, v_map.id, coalesce(v_map.pass_type, 'professional'), nullif(p_data->>'barcode', ''),
            p_data->>'_id', nullif(p_data->>'transactionId', ''),
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

  -- Secret in die eigene Tabelle, nie an `ticket`.
  perform set_ticket_secret(v_id, p_data->>'secret');

  if v_discount is not null then
    select a.id into v_alloc from org_ticket_allocation a where a.vivenu_coupon_id = v_discount limit 1;
    if v_alloc is not null then perform recount_allocation_usage(v_alloc); end if;
  end if;

  return jsonb_build_object('ticket_id', v_id, 'outcome', v_outcome);
end $$;
revoke execute on function ingest_vivenu_ticket(jsonb) from public, anon, authenticated;

select harden_definer_functions();
