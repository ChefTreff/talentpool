-- 0044 · Mehrere HubSpot-Deals je Partner × Edition (Nachbuchungen): partner_deal hält jeden verarbeiteten Deal, die Idempotenz des Ingests
-- und der Sweep-Abgleich laufen darüber; org_edition.hubspot_deal_id bleibt der erste Deal. Team sieht die Deals einer Org über partner_deals().
set search_path = public, extensions;

create table if not exists partner_deal (
  hubspot_deal_id text primary key,
  org_edition_id  uuid not null references org_edition (id) on delete cascade,
  deal_name       text,
  ingested_at     timestamptz not null default now(),
  payload         jsonb
);
comment on table partner_deal is 'Verarbeitete HubSpot-Deals je Partner × Edition (Idempotenz des Ingests, Sweep-Abgleich). Kein Personenbezug im payload.';
create index if not exists partner_deal_oe_idx on partner_deal (org_edition_id);
alter table partner_deal enable row level security;
revoke all on partner_deal from anon, authenticated;
grant all on partner_deal to service_role;
insert into partner_deal (hubspot_deal_id, org_edition_id) select oe.hubspot_deal_id, oe.id from org_edition oe where oe.hubspot_deal_id is not null on conflict do nothing;

create or replace function hubspot_deals_ingested(p_deal_ids text[]) returns text[]
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select array_agg(pd.hubspot_deal_id) from partner_deal pd where pd.hubspot_deal_id = any(p_deal_ids)), '{}'::text[]);
end $$;

create or replace function partner_deals(p_org_id uuid)
returns table (hubspot_deal_id text, deal_name text, ingested_at timestamptz, org_edition_id uuid, edition_id uuid, line_items jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select pd.hubspot_deal_id, pd.deal_name, pd.ingested_at, pd.org_edition_id, oe.edition_id, pd.payload->'line_items'
    from partner_deal pd join org_edition oe on oe.id = pd.org_edition_id
    where oe.org_id = p_org_id order by pd.ingested_at desc;
end $$;

create or replace function ingest_partner_deal(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_deal jsonb := coalesce(p->'deal', '{}'::jsonb); v_co jsonb := coalesce(p->'company', '{}'::jsonb);
  v_contacts jsonb := coalesce(p->'contacts', '[]'::jsonb); v_items jsonb := coalesce(p->'line_items', '[]'::jsonb);
  v_errors text[] := '{}'; v_ed event%rowtype; v_org_id uuid; v_oe_id uuid; v_new_org boolean := false;
  c jsonb; li jsonb; v_roles text[]; v_role text; v_primaries integer := 0; v_primary_email text; v_existing_primary text;
  v_n_contacts integer := 0; v_n_products integer := 0; v_n_alloc integer := 0; v_n_roles integer := 0; v_cnt integer;
  v_deal_id text := nullif(btrim(coalesce(v_deal->>'id', '')), ''); v_company_id text := nullif(btrim(coalesce(v_co->>'id', '')), '');
  v_invoice text := nullif(lower(btrim(coalesce(v_co->>'invoice_email', ''))), ''); v_acc_email text;
  v_err_id bigint; v_owner_pid uuid; v_notified integer := 0; v_vars jsonb; v_valid_to timestamptz; v_grant text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_deal_id is null then raise exception 'deal_id_required' using errcode = '22023'; end if;

  select pd.org_edition_id, oe.org_id into v_oe_id, v_org_id from partner_deal pd join org_edition oe on oe.id = pd.org_edition_id where pd.hubspot_deal_id = v_deal_id;
  if found then return jsonb_build_object('ok', true, 'already', true, 'org_id', v_org_id, 'org_edition_id', v_oe_id); end if;

  -- Gate: Edition
  select e.* into v_ed from event e where e.is_edition and e.hubspot_pipeline_id = v_deal->>'pipeline';
  if not found then v_errors := array_append(v_errors, 'pipeline_unknown'); end if;
  -- Gate: Firma
  if nullif(btrim(coalesce(v_co->>'legal_name', '')), '') is null then v_errors := array_append(v_errors, 'legal_name_missing'); end if;
  if nullif(btrim(coalesce(v_co->>'communication_name', '')), '') is null then v_errors := array_append(v_errors, 'communication_name_missing'); end if;
  if nullif(btrim(coalesce(v_co->>'street', '')), '') is null or nullif(btrim(coalesce(v_co->>'zip', '')), '') is null or nullif(btrim(coalesce(v_co->>'city', '')), '') is null then
    v_errors := array_append(v_errors, 'address_missing');
  end if;
  if nullif(v_co->>'type', '') is not null and not is_vocab_key('organization_type', v_co->>'type') then v_errors := array_append(v_errors, 'invalid_type:' || (v_co->>'type')); end if;
  if nullif(v_co->>'partner_category', '') is not null and not is_vocab_key('partner_category', v_co->>'partner_category') then v_errors := array_append(v_errors, 'invalid_partner_category'); end if;
  -- Gate: Kontakte
  for c in select * from jsonb_array_elements(v_contacts) loop
    v_roles := coalesce((select array_agg(x) from jsonb_array_elements_text(c->'roles') x), '{}'::text[]);
    foreach v_role in array v_roles loop
      if v_role <> 'accounting' and not is_vocab_key('contact_role', v_role) then v_errors := array_append(v_errors, 'invalid_role:' || v_role); end if;
    end loop;
    if 'accounting' = any(v_roles) and v_acc_email is null then v_acc_email := nullif(lower(btrim(coalesce(c->>'email', ''))), ''); end if;
    if array_remove(v_roles, 'accounting') = '{}'::text[] then continue; end if;
    if coalesce(c->>'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_errors := array_append(v_errors, 'contact_email_invalid:' || coalesce(c->>'id', '?'));
    elsif is_suppressed(lower(btrim(c->>'email'))) then
      v_errors := array_append(v_errors, 'contact_suppressed:' || coalesce(c->>'id', '?'));
    end if;
    if 'primary_ops' = any(v_roles) then
      v_primaries := v_primaries + 1; v_primary_email := lower(btrim(coalesce(c->>'email', '')));
      if nullif(btrim(coalesce(c->>'first_name', '')), '') is null or nullif(btrim(coalesce(c->>'last_name', '')), '') is null then v_errors := array_append(v_errors, 'primary_contact_name_missing'); end if;
    end if;
  end loop;
  if v_primaries = 0 then v_errors := array_append(v_errors, 'primary_contact_missing');
  elsif v_primaries > 1 then v_errors := array_append(v_errors, 'primary_contact_multiple'); end if;
  -- bestehende Org mit anderem Hauptkontakt ⇒ Team klärt (kein stiller Wechsel)
  if v_company_id is not null then select o.id into v_org_id from organization o where o.hubspot_id = v_company_id; end if;
  if v_org_id is not null and v_primary_email is not null then
    select pe.email::text into v_existing_primary from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary
     where om.org_id = v_org_id and om.roles @> '{primary_ops}' limit 1;
    if v_existing_primary is not null and v_existing_primary <> v_primary_email then v_errors := array_append(v_errors, 'primary_conflict'); end if;
  end if;
  v_invoice := coalesce(v_invoice, v_acc_email);
  if v_invoice is null then v_errors := array_append(v_errors, 'invoice_email_missing');
  elsif v_invoice !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_errors := array_append(v_errors, 'invoice_email_invalid'); end if;
  -- Gate: Leistungen
  if jsonb_array_length(v_items) = 0 then v_errors := array_append(v_errors, 'line_items_missing'); end if;
  for li in select * from jsonb_array_elements(v_items) loop
    if not exists (select 1 from product pr where pr.sku = li->>'sku') then v_errors := array_append(v_errors, 'unknown_sku:' || coalesce(li->>'sku', '?'));
    elsif not exists (select 1 from product pr where pr.sku = li->>'sku' and pr.active) then v_errors := array_append(v_errors, 'inactive_sku:' || (li->>'sku')); end if;
  end loop;

  if cardinality(v_errors) > 0 then
    insert into integration.sync_error (job_id, object_type, object_id, message, payload)
    values (nullif(p->>'job_id', '')::bigint, 'hubspot_deal', v_deal_id, array_to_string(v_errors, ', '),
            jsonb_build_object('errors', to_jsonb(v_errors), 'deal_name', v_deal->>'name', 'deal_url', v_deal->>'url', 'pipeline', v_deal->>'pipeline', 'stage', v_deal->>'stage',
                               'company_id', v_company_id, 'company_name', coalesce(v_co->>'communication_name', v_co->>'legal_name'), 'owner_email', v_deal->>'owner_email'))
    returning id into v_err_id;
    v_vars := jsonb_build_object('deal_name', coalesce(v_deal->>'name', v_deal_id), 'company_name', coalesce(v_co->>'communication_name', v_co->>'legal_name', '–'),
                                 'errors', (select string_agg('- ' || e, E'\n') from unnest(v_errors) e), 'deal_url', coalesce(v_deal->>'url', ''));
    if nullif(v_deal->>'owner_email', '') is not null then
      select pe.person_id into v_owner_pid from person_email pe join person pp on pp.id = pe.person_id
       where pe.email = lower(btrim(v_deal->>'owner_email'))::citext and pp.deleted_at is null limit 1;
    end if;
    if v_owner_pid is not null and queue_mail('partner_gate_failed', v_owner_pid, v_vars, 'hubspot_deal', null) is not null then
      v_notified := 1;
    else
      v_notified := notify_partner_leads('partner_gate_failed', v_vars, 'hubspot_deal', null);
    end if;
    return jsonb_build_object('ok', false, 'errors', to_jsonb(v_errors), 'sync_error_id', v_err_id, 'notified', v_notified, 'owner_found', v_owner_pid is not null);
  end if;

  -- Erfolg: Organisation (bestehende wird nur ergänzt, nie überschrieben — das Portal ist danach Quelle)
  if v_org_id is null then
    insert into organization (legal_name, communication_name, type, address_street, address_zip, address_city, address_country, website, description, hubspot_id, partner_category, active)
    values (btrim(v_co->>'legal_name'), btrim(v_co->>'communication_name'), coalesce(nullif(v_co->>'type', ''), 'corporate'), btrim(v_co->>'street'), btrim(v_co->>'zip'), btrim(v_co->>'city'),
            nullif(btrim(coalesce(v_co->>'country', '')), ''), nullif(btrim(coalesce(v_co->>'website', '')), ''), nullif(btrim(coalesce(v_co->>'description', '')), ''),
            v_company_id, nullif(v_co->>'partner_category', ''), true)
    returning id into v_org_id;
    v_new_org := true;
  else
    update organization set
      legal_name = coalesce(legal_name, btrim(v_co->>'legal_name')), communication_name = coalesce(communication_name, btrim(v_co->>'communication_name')),
      address_street = coalesce(address_street, btrim(v_co->>'street')), address_zip = coalesce(address_zip, btrim(v_co->>'zip')), address_city = coalesce(address_city, btrim(v_co->>'city')),
      address_country = coalesce(address_country, nullif(btrim(coalesce(v_co->>'country', '')), '')), website = coalesce(website, nullif(btrim(coalesce(v_co->>'website', '')), '')),
      description = coalesce(description, nullif(btrim(coalesce(v_co->>'description', '')), '')), partner_category = coalesce(partner_category, nullif(v_co->>'partner_category', '')), active = true
    where id = v_org_id;
  end if;

  v_valid_to := edition_valid_to(v_ed.id);
  insert into org_edition (org_id, edition_id, onboarding_status, invited_at, description_de, invoice_email, invoice_name, vat_id, po_number, sponsoring_level, hubspot_deal_id)
  values (v_org_id, v_ed.id, 'invited', now(), nullif(btrim(coalesce(v_co->>'description', '')), ''), v_invoice::citext, nullif(btrim(coalesce(v_co->>'invoice_name', '')), ''),
          nullif(btrim(coalesce(v_co->>'vat_id', '')), ''), nullif(btrim(coalesce(v_co->>'po_number', '')), ''), nullif(btrim(coalesce(v_co->>'sponsoring_level', '')), ''), v_deal_id)
  on conflict (org_id, edition_id) do update set
    hubspot_deal_id = coalesce(org_edition.hubspot_deal_id, excluded.hubspot_deal_id), invited_at = coalesce(org_edition.invited_at, excluded.invited_at),
    onboarding_status = case when org_edition.onboarding_status = 'none' then 'invited' else org_edition.onboarding_status end,
    description_de = coalesce(org_edition.description_de, excluded.description_de), invoice_email = coalesce(org_edition.invoice_email, excluded.invoice_email),
    invoice_name = coalesce(org_edition.invoice_name, excluded.invoice_name), vat_id = coalesce(org_edition.vat_id, excluded.vat_id),
    po_number = coalesce(org_edition.po_number, excluded.po_number), sponsoring_level = coalesce(org_edition.sponsoring_level, excluded.sponsoring_level)
  returning id into v_oe_id;

  insert into partner_deal (hubspot_deal_id, org_edition_id, deal_name, payload)
  values (v_deal_id, v_oe_id, v_deal->>'name', jsonb_build_object('deal', v_deal - 'owner_email' - 'owner_name', 'line_items', v_items, 'company_id', v_company_id));

  for li in select * from jsonb_array_elements(v_items) loop
    if coalesce((li->>'qty')::numeric, 1) <= 0 then continue; end if;
    insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, hubspot_line_item_id, status)
    values (v_oe_id, li->>'sku', coalesce((li->>'qty')::numeric, 1), (li->>'unit_price_cents')::integer, nullif(li->>'id', ''), 'booked')
    on conflict (org_edition_id, product_sku, hubspot_line_item_id) do update set qty = excluded.qty, unit_price_cents = excluded.unit_price_cents, status = 'booked';
    v_n_products := v_n_products + 1;
  end loop;

  insert into org_ticket_allocation (event_id, org_id, pass_type, quantity)
  select v_ed.id, v_org_id, pr.pass_type, sum(op.qty)::integer
  from org_product op join product pr on pr.sku = op.product_sku
  where op.org_edition_id = v_oe_id and op.status = 'booked' and pr.pass_type is not null
  group by pr.pass_type
  on conflict (event_id, org_id, pass_type) do update set quantity = excluded.quantity;
  get diagnostics v_n_alloc = row_count;

  for c in select * from jsonb_array_elements(v_contacts) loop
    v_roles := array_remove(coalesce((select array_agg(x) from jsonb_array_elements_text(c->'roles') x), '{}'::text[]), 'accounting');
    if v_roles = '{}'::text[] then continue; end if;
    perform partner_contact_upsert_internal(v_org_id, c->>'email', c->>'first_name', c->>'last_name', v_roles, c->>'position', v_ed.id, null, 'hubspot');
    v_n_contacts := v_n_contacts + 1;
  end loop;

  for v_grant in select distinct pr.grants_role from org_product op join product pr on pr.sku = op.product_sku
                 where op.org_edition_id = v_oe_id and op.status = 'booked' and pr.grants_role is not null loop
    insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_to, note)
    select om.person_id, v_grant, 'org', v_org_id, v_ed.id, v_valid_to, 'hubspot'
    from org_membership om
    where om.org_id = v_org_id and om.roles @> '{primary_ops}'
      and not exists (select 1 from role_assignment ra where ra.person_id = om.person_id and ra.role = v_grant and ra.scope_type = 'org' and ra.scope_id = v_org_id
                        and (ra.valid_to is null or ra.valid_to > now()));
    get diagnostics v_cnt = row_count; v_n_roles := v_n_roles + v_cnt;
  end loop;

  perform log_audit('partner.ingest', 'organization', v_org_id::text, null,
                    jsonb_build_object('deal_id', v_deal_id, 'org_edition_id', v_oe_id, 'new_org', v_new_org, 'contacts', v_n_contacts, 'products', v_n_products, 'allocations', v_n_alloc, 'roles', v_n_roles));
  return jsonb_build_object('ok', true, 'already', false, 'org_id', v_org_id, 'org_edition_id', v_oe_id, 'new_org', v_new_org, 'contacts', v_n_contacts, 'products', v_n_products,
                            'allocations', v_n_alloc, 'roles', v_n_roles, 'deliverables', (select count(*) from deliverable d where d.org_edition_id = v_oe_id and d.status <> 'not_required'));
end $$;
revoke execute on function ingest_partner_deal(jsonb) from public, anon, authenticated;

select harden_definer_functions();
