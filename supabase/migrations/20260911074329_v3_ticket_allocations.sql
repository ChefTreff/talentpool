-- 0049 · Welle 3 A6: Ticket-Kontingente und Secret Shop. Kontingente entstehen ausschließlich aus gebuchten Ticket-Produkten (product.pass_type) per Trigger;
-- der Pass-Typ der Talente-Tickets folgt der Wahl im Onboarding (pass_type_choice) bzw. dem Org-Typ (startup ⇒ startup, sonst talent — P10). Status
-- pending_vivenu, bis die Route (service_role, Cron) Undershop + Coupon in vivenu angelegt hat; ohne vivenu-Zugang bleibt der Datensatz stehen (Akzeptanz A6).
-- Team korrigiert Menge/Code/URL mit Audit; Partner sehen Code, Menge, Pass-Typ und die Frist ticket_codes; „mehr Tickets" ist eine Anfrage (shop_request).
set search_path = public, extensions;

alter table event add column if not exists vivenu_event_id text;
comment on column event.vivenu_event_id is 'vivenu-Event der Edition (Shop mit Undershops); Team setzt es über set_edition_vivenu.';

create or replace function set_edition_vivenu(p_edition_id uuid, p_vivenu_event_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update event set vivenu_event_id = nullif(btrim(coalesce(p_vivenu_event_id, '')), '') where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  perform log_audit('edition.vivenu', 'event', p_edition_id::text, null, jsonb_build_object('vivenu_event_id', p_vivenu_event_id));
end $$;

alter table org_ticket_allocation add column if not exists org_edition_id uuid references org_edition (id) on delete cascade;
alter table org_ticket_allocation add column if not exists status text not null default 'pending_vivenu';
alter table org_ticket_allocation drop constraint if exists org_ticket_allocation_status_chk;
alter table org_ticket_allocation add constraint org_ticket_allocation_status_chk check (status in ('pending_vivenu', 'active', 'error', 'disabled'));
alter table org_ticket_allocation add column if not exists vivenu_coupon_id text;
alter table org_ticket_allocation add column if not exists vivenu_undershop_id text;
alter table org_ticket_allocation add column if not exists last_error text;
alter table org_ticket_allocation add column if not exists synced_at timestamptz;
update org_ticket_allocation a set org_edition_id = oe.id from org_edition oe where oe.org_id = a.org_id and oe.edition_id = a.event_id and a.org_edition_id is null;
create index if not exists org_ticket_allocation_status_idx on org_ticket_allocation (status);
comment on table org_ticket_allocation is 'Ticket-Kontingent je Partner × Edition × Pass-Typ, abgeleitet aus Ticket-Produkten; Coupon/Undershop kommen aus vivenu (Route), Status pending_vivenu bis dahin.';
-- Schreibrechte nur über RPCs (Welle-1-Grants waren pauschal); Team liest alles
revoke all on org_ticket_allocation from anon;
revoke insert, update, delete on org_ticket_allocation from authenticated;
revoke all on ticket_type_map from anon;
revoke insert, update, delete on ticket_type_map from authenticated;
drop policy if exists ota_member_sel on org_ticket_allocation;
create policy ota_member_sel on org_ticket_allocation for select to authenticated using (is_partner_of(org_id) or is_staff());

-- Pass-Typ der Talente-Tickets: Wahl im Onboarding, sonst Org-Typ
create or replace function effective_pass_type(p_product_pass_type text, p_org_edition_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when p_product_pass_type = 'talent'
              then coalesce(oe.pass_type_choice, case when o.type = 'startup' then 'startup' else 'talent' end)
              else p_product_pass_type end
  from org_edition oe join organization o on o.id = oe.org_id where oe.id = p_org_edition_id
$$;
revoke execute on function effective_pass_type(text, uuid) from public, anon, authenticated;

-- Kontingente aus den gebuchten Ticket-Produkten ableiten (Trigger auf org_product und pass_type_choice)
create or replace function sync_ticket_allocations(p_org_edition_id uuid) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; r record; v_n integer := 0;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return 0; end if;
  for r in
    select effective_pass_type(pr.pass_type, v_oe.id) as pass_type, sum(op.qty)::integer as quantity
    from org_product op join product pr on pr.sku = op.product_sku
    where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null
    group by effective_pass_type(pr.pass_type, v_oe.id)
  loop
    insert into org_ticket_allocation (event_id, org_id, org_edition_id, pass_type, quantity)
    values (v_oe.edition_id, v_oe.org_id, v_oe.id, r.pass_type, r.quantity)
    on conflict (event_id, org_id, pass_type) do update set
      quantity = excluded.quantity, org_edition_id = excluded.org_edition_id,
      status = case when org_ticket_allocation.status = 'disabled' then 'pending_vivenu' else org_ticket_allocation.status end,
      synced_at = case when org_ticket_allocation.quantity <> excluded.quantity or org_ticket_allocation.status = 'disabled' then null else org_ticket_allocation.synced_at end;
    v_n := v_n + 1;
  end loop;
  -- Kontingente ohne Produkt: noch nicht in vivenu ⇒ weg; sonst deaktivieren (die Route schaltet den Coupon ab)
  delete from org_ticket_allocation a
   where a.org_id = v_oe.org_id and a.event_id = v_oe.edition_id and a.status = 'pending_vivenu'
     and not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                     where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null and effective_pass_type(pr.pass_type, v_oe.id) = a.pass_type);
  update org_ticket_allocation a set status = 'disabled', quantity = 0, synced_at = null
   where a.org_id = v_oe.org_id and a.event_id = v_oe.edition_id and a.status in ('active', 'error')
     and not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                     where op.org_edition_id = v_oe.id and op.status = 'booked' and pr.pass_type is not null and effective_pass_type(pr.pass_type, v_oe.id) = a.pass_type);
  return v_n;
end $$;
revoke execute on function sync_ticket_allocations(uuid) from public, anon, authenticated;

create or replace function trg_org_product_allocations() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform sync_ticket_allocations(coalesce(new.org_edition_id, old.org_edition_id));
  return coalesce(new, old);
end $$;
revoke execute on function trg_org_product_allocations() from public, anon, authenticated;
drop trigger if exists trg_org_product_allocations on org_product;
create trigger trg_org_product_allocations after insert or update or delete on org_product for each row execute function trg_org_product_allocations();

create or replace function trg_org_edition_pass_type() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.pass_type_choice is distinct from old.pass_type_choice then perform sync_ticket_allocations(new.id); end if;
  return new;
end $$;
revoke execute on function trg_org_edition_pass_type() from public, anon, authenticated;
drop trigger if exists trg_org_edition_pass_type on org_edition;
create trigger trg_org_edition_pass_type after update of pass_type_choice on org_edition for each row execute function trg_org_edition_pass_type();

-- Partner: eigene Kontingente (Code erst, wenn vivenu ihn hat)
create or replace function my_ticket_allocations(p_org_id uuid, p_edition_id uuid default null)
returns table (id uuid, pass_type text, quantity integer, used_count integer, coupon_code text, undershop_url text, status text, codes_due_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select a.id, a.pass_type, a.quantity, a.used_count,
           case when a.status = 'active' then a.coupon_code end, case when a.status = 'active' then a.undershop_url end,
           a.status, (select d.due_at from deadline d where d.edition_id = v_oe.edition_id and d.key = 'ticket_codes')
    from org_ticket_allocation a
    where a.org_id = p_org_id and a.event_id = v_oe.edition_id and a.status <> 'disabled'
    order by a.pass_type;
end $$;

-- Partner: mehr Tickets als Anfrage (kein Mail-Fallback, Team antwortet im Admin)
create or replace function request_ticket_increase(p_org_id uuid, p_pass_type text, p_additional integer, p_text text default null, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_sku text; v_id uuid; v_org_name text; v_label text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_additional, 0) <= 0 then raise exception 'quantity_required' using errcode = '22023'; end if;
  if p_pass_type not in ('partner', 'talent', 'startup', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  select pr.sku into v_sku from product pr where pr.pass_type = case when p_pass_type = 'startup' then 'talent' else p_pass_type end and pr.active order by pr.sku limit 1;
  v_label := format('Tickets %s (+%s)', p_pass_type, p_additional);
  insert into shop_request (org_edition_id, product_sku, text, created_by)
  values (v_oe.id, v_sku, format('%s zusätzliche Tickets (%s).%s', p_additional, p_pass_type, case when nullif(btrim(coalesce(p_text, '')), '') is null then '' else ' ' || btrim(p_text) end), v_me)
  returning id into v_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
  perform notify_partner_leads('shop_request_received', jsonb_build_object('org_name', v_org_name, 'product', v_label, 'text', coalesce(btrim(p_text), '–')), 'shop_request', v_id);
  perform log_audit('ticket.request_increase', 'shop_request', v_id::text, null, jsonb_build_object('org_id', p_org_id, 'pass_type', p_pass_type, 'additional', p_additional));
  return v_id;
end $$;

-- Team: Übersicht und Korrektur (Menge, Code, URL, Status) mit Audit
create or replace function ticket_allocations_admin(p_edition_id uuid default null)
returns table (id uuid, org_id uuid, org_name text, edition_id uuid, pass_type text, quantity integer, used_count integer, coupon_code text, undershop_url text, status text,
               last_error text, synced_at timestamptz, notes text, vivenu_coupon_id text, vivenu_undershop_id text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), a.event_id, a.pass_type, a.quantity, a.used_count, a.coupon_code, a.undershop_url, a.status,
           a.last_error, a.synced_at, a.notes, a.vivenu_coupon_id, a.vivenu_undershop_id, a.updated_at
    from org_ticket_allocation a join organization o on o.id = a.org_id
    where p_edition_id is null or a.event_id = p_edition_id
    order by case a.status when 'error' then 0 when 'pending_vivenu' then 1 when 'active' then 2 else 3 end, coalesce(o.communication_name, o.legal_name), a.pass_type;
end $$;

create or replace function set_ticket_allocation(p_id uuid, p_quantity integer default null, p_coupon_code text default null, p_undershop_url text default null,
                                                 p_status text default null, p_notes text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_a org_ticket_allocation;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from org_ticket_allocation where id = p_id for update;
  if not found then raise exception 'allocation_not_found' using errcode = 'P0002'; end if;
  if p_quantity is not null and p_quantity < 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  if p_status is not null and p_status not in ('pending_vivenu', 'active', 'error', 'disabled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update org_ticket_allocation set
    quantity = coalesce(p_quantity, quantity),
    coupon_code = case when p_coupon_code is not null then nullif(btrim(p_coupon_code), '') else coupon_code end,
    undershop_url = case when p_undershop_url is not null then nullif(btrim(p_undershop_url), '') else undershop_url end,
    status = coalesce(p_status, status),
    notes = case when p_notes is not null then nullif(btrim(p_notes), '') else notes end,
    last_error = case when p_status = 'active' then null else last_error end,
    synced_at = case when p_quantity is not null and p_quantity <> v_a.quantity and v_a.vivenu_coupon_id is not null then null else synced_at end
  where id = p_id;
  perform log_audit('ticket.allocation_set', 'org_ticket_allocation', p_id::text,
                    jsonb_build_object('quantity', v_a.quantity, 'coupon_code', v_a.coupon_code, 'status', v_a.status),
                    jsonb_build_object('quantity', p_quantity, 'coupon_code', p_coupon_code, 'undershop_url', p_undershop_url, 'status', p_status, 'notes', p_notes));
end $$;

-- Route (service_role): offene Kontingente mit allem, was vivenu braucht; Ergebnis zurückschreiben
create or replace function ticket_allocations_pending()
returns table (id uuid, org_id uuid, org_name text, org_slug text, edition_id uuid, edition_slug text, vivenu_event_id text, pass_type text, quantity integer, status text,
               coupon_code text, vivenu_coupon_id text, vivenu_undershop_id text, org_undershop_id text, ticket_type_ids text[])
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.org_id, coalesce(o.communication_name, o.legal_name), o.slug, a.event_id, e.slug, e.vivenu_event_id, a.pass_type, a.quantity, a.status,
           a.coupon_code, a.vivenu_coupon_id, a.vivenu_undershop_id,
           (select b.vivenu_undershop_id from org_ticket_allocation b where b.org_id = a.org_id and b.event_id = a.event_id and b.vivenu_undershop_id is not null limit 1),
           coalesce((select array_agg(m.vivenu_ticket_type_id order by m.vivenu_ticket_type_id) from ticket_type_map m
                     where m.active and m.pass_type = a.pass_type and m.event_id in (select ev.id from event ev where ev.id = a.event_id or ev.edition_id = a.event_id)), '{}'::text[])
    from org_ticket_allocation a join organization o on o.id = a.org_id join event e on e.id = a.event_id
    where e.vivenu_event_id is not null and (a.status in ('pending_vivenu', 'error') or a.synced_at is null)
    order by e.vivenu_event_id, o.id, a.pass_type;
end $$;

create or replace function set_ticket_allocation_vivenu(p_id uuid, p_status text, p_coupon_code text default null, p_vivenu_coupon_id text default null,
                                                        p_vivenu_undershop_id text default null, p_undershop_url text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending_vivenu', 'active', 'error', 'disabled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update org_ticket_allocation set
    status = p_status,
    coupon_code = coalesce(nullif(btrim(coalesce(p_coupon_code, '')), ''), coupon_code),
    vivenu_coupon_id = coalesce(nullif(btrim(coalesce(p_vivenu_coupon_id, '')), ''), vivenu_coupon_id),
    vivenu_undershop_id = coalesce(nullif(btrim(coalesce(p_vivenu_undershop_id, '')), ''), vivenu_undershop_id),
    undershop_url = coalesce(nullif(btrim(coalesce(p_undershop_url, '')), ''), undershop_url),
    last_error = case when p_status = 'error' then left(coalesce(p_error, ''), 500) else null end,
    synced_at = case when p_status in ('active', 'disabled') then now() else synced_at end
  where id = p_id;
  if not found then raise exception 'allocation_not_found' using errcode = 'P0002'; end if;
  perform log_audit('ticket.allocation_vivenu', 'org_ticket_allocation', p_id::text, null, jsonb_build_object('status', p_status, 'coupon_id', p_vivenu_coupon_id, 'undershop_id', p_vivenu_undershop_id, 'error', p_error));
end $$;
revoke execute on function set_ticket_allocation_vivenu(uuid, text, text, text, text, text, text) from public, anon, authenticated;

-- Ingest: Kontingente kommen jetzt aus dem Trigger (kein eigener Insert mehr)
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

  select e.* into v_ed from event e where e.is_edition and e.hubspot_pipeline_id = v_deal->>'pipeline';
  if not found then v_errors := array_append(v_errors, 'pipeline_unknown'); end if;
  if nullif(btrim(coalesce(v_co->>'legal_name', '')), '') is null then v_errors := array_append(v_errors, 'legal_name_missing'); end if;
  if nullif(btrim(coalesce(v_co->>'communication_name', '')), '') is null then v_errors := array_append(v_errors, 'communication_name_missing'); end if;
  if nullif(btrim(coalesce(v_co->>'street', '')), '') is null or nullif(btrim(coalesce(v_co->>'zip', '')), '') is null or nullif(btrim(coalesce(v_co->>'city', '')), '') is null then
    v_errors := array_append(v_errors, 'address_missing');
  end if;
  if nullif(v_co->>'type', '') is not null and not is_vocab_key('organization_type', v_co->>'type') then v_errors := array_append(v_errors, 'invalid_type:' || (v_co->>'type')); end if;
  if nullif(v_co->>'partner_category', '') is not null and not is_vocab_key('partner_category', v_co->>'partner_category') then v_errors := array_append(v_errors, 'invalid_partner_category'); end if;
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
  if v_company_id is not null then select o.id into v_org_id from organization o where o.hubspot_id = v_company_id; end if;
  if v_org_id is not null and v_primary_email is not null then
    select pe.email::text into v_existing_primary from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary
     where om.org_id = v_org_id and om.roles @> '{primary_ops}' limit 1;
    if v_existing_primary is not null and v_existing_primary <> v_primary_email then v_errors := array_append(v_errors, 'primary_conflict'); end if;
  end if;
  v_invoice := coalesce(v_invoice, v_acc_email);
  if v_invoice is null then v_errors := array_append(v_errors, 'invoice_email_missing');
  elsif v_invoice !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_errors := array_append(v_errors, 'invoice_email_invalid'); end if;
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

  perform sync_ticket_allocations(v_oe_id);
  select count(*) into v_n_alloc from org_ticket_allocation a where a.org_edition_id = v_oe_id and a.status <> 'disabled';

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
