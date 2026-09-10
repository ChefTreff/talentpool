-- 0040 · Welle 3 A3: Org-Kontext je Edition (org_edition), gebuchte Leistungen (org_product), Kontaktrollen (Entscheidung 1) und Partner-RPCs.
-- Kontaktrollen leben in org_membership.roles (Vokabular contact_role); Portal-Zugang über role_assignment partner_contact (Scope org, Edition).
-- Accounting ist kein Login: die Rechnungs-E-Mail steht in org_edition.invoice_email. Genau ein primary_ops je Organisation.
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order)
select v.vocabulary, v.key, v.label_de, v.label_en, v.sort_order from (values
  ('contact_role', 'primary_ops', 'Hauptkontakt (Operations)', 'Primary contact (operations)', 1),
  ('contact_role', 'additional', 'Weiterer Ansprechpartner', 'Additional contact', 2),
  ('contact_role', 'signing', 'Vertrag / Unterschrift', 'Signing contact', 3),
  ('contact_role', 'event_app_member', 'Event-App-Mitglied', 'Event app member', 4)
) as v(vocabulary, key, label_de, label_en, sort_order)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- 1) Tabellen
create table if not exists org_edition (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organization (id) on delete cascade,
  edition_id           uuid not null references event (id) on delete cascade,
  onboarding_status    text not null default 'none' check (onboarding_status in ('none', 'invited', 'filled', 'call_done')),
  invited_at           timestamptz,
  onboarding_filled_at timestamptz,
  description_de       text,
  description_en       text,
  invoice_email        citext,                       -- Accounting-Kontakt ohne Login (Entscheidung 1)
  invoice_name         text,
  vat_id               text,
  po_number            text,
  pass_type_choice     text,                         -- talent | startup (P10)
  sponsoring_level     text,                         -- Logo Type (Event-App)
  hubspot_deal_id      text,
  notes_internal       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, edition_id)
);
comment on table org_edition is 'Partner-Organisation je Edition: Onboarding-Stand, Rechnungsdaten, Pass-Typ-Wahl, HubSpot-Deal.';
drop trigger if exists trg_org_edition_updated on org_edition;
create trigger trg_org_edition_updated before update on org_edition for each row execute function set_updated_at();

create table if not exists org_product (
  id                   uuid primary key default gen_random_uuid(),
  org_edition_id       uuid not null references org_edition (id) on delete cascade,
  product_sku          text not null references product (sku),
  qty                  numeric(10, 2) not null default 1 check (qty > 0),
  unit_price_cents     integer check (unit_price_cents is null or unit_price_cents >= 0),
  hubspot_line_item_id text,
  status               text not null default 'booked' check (status in ('booked', 'cancelled')),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique nulls not distinct (org_edition_id, product_sku, hubspot_line_item_id)
);
comment on table org_product is 'Gebuchte Leistungen je Partner × Edition (aus HubSpot-Line-Items); steuert Checkliste und Sichtbarkeit.';
drop trigger if exists trg_org_product_updated on org_product;
create trigger trg_org_product_updated before update on org_product for each row execute function set_updated_at();

alter table org_membership add column if not exists contact_position text;
alter table org_membership add column if not exists invited_at timestamptz;
create unique index if not exists org_membership_person_org_uidx on org_membership (person_id, org_id);
create unique index if not exists org_membership_primary_uidx on org_membership (org_id) where roles @> '{primary_ops}'::text[];

-- 2) Rechte: Mitglieder lesen ihre Org-Daten (ohne interne Notiz), Team alles; Schreiben nur über RPCs
alter table org_edition enable row level security;
alter table org_product enable row level security;
drop policy if exists org_edition_read on org_edition;
create policy org_edition_read on org_edition for select to authenticated using (is_member_of_org(org_id) or is_staff());
drop policy if exists org_product_read on org_product;
create policy org_product_read on org_product for select to authenticated
  using (exists (select 1 from org_edition oe where oe.id = org_edition_id and (is_member_of_org(oe.org_id) or is_staff())));
revoke all on org_edition, org_product from anon;
revoke insert, update, delete on org_edition, org_product, org_membership, organization from authenticated;
revoke select on org_edition from authenticated;
grant select (id, org_id, edition_id, onboarding_status, invited_at, onboarding_filled_at, description_de, description_en, invoice_email, invoice_name,
              vat_id, po_number, pass_type_choice, sponsoring_level, created_at, updated_at) on org_edition to authenticated;
grant select on org_product to authenticated;
grant all on org_edition, org_product to service_role;

-- 3) Helfer
create or replace function partner_roles(p_org_id uuid) returns text[]
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select om.roles from org_membership om
                   where om.org_id = p_org_id and om.person_id = current_person_id()
                     and has_role('partner_contact', 'org', p_org_id)), '{}'::text[])
$$;
create or replace function is_partner_of(p_org_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select cardinality(partner_roles(p_org_id)) > 0
$$;
create or replace function partner_can_edit(p_org_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_partner_team() or partner_roles(p_org_id) && '{primary_ops,additional,signing}'::text[]
$$;
create or replace function partner_can_manage_contacts(p_org_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select is_partner_team() or 'primary_ops' = any(partner_roles(p_org_id))
$$;
-- Edition eines Partners: gewünschte oder die jüngste
create or replace function current_org_edition(p_org_id uuid, p_edition_id uuid default null) returns org_edition
language sql stable security definer set search_path = public, extensions as $$
  select oe.* from org_edition oe join event e on e.id = oe.edition_id
  where oe.org_id = p_org_id and (p_edition_id is null or oe.edition_id = p_edition_id)
  order by e.start_date desc nulls last, oe.created_at desc limit 1
$$;
revoke execute on function current_org_edition(uuid, uuid) from public, anon, authenticated;

-- 4) Lesewege
create or replace function my_partner_orgs()
returns table (org_id uuid, communication_name text, legal_name text, org_type text, roles text[], edition_id uuid, edition_name text, edition_slug text, onboarding_status text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.type, om.roles,
           oe.edition_id, e.name, e.slug, oe.onboarding_status
    from org_membership om
    join organization o on o.id = om.org_id
    left join lateral (select * from current_org_edition(om.org_id, null)) oe on true
    left join event e on e.id = oe.edition_id
    where om.person_id = current_person_id() and has_role('partner_contact', 'org', om.org_id) and o.active
    order by coalesce(o.communication_name, o.legal_name);
end $$;

create or replace function partner_contacts(p_org_id uuid)
returns table (person_id uuid, first_name text, last_name text, title text, email text, contact_position text, roles text[], has_login boolean, invited_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.last_name, p.title,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary),
           om.contact_position, om.roles, (p.auth_user_id is not null), om.invited_at
    from org_membership om join person p on p.id = om.person_id
    where om.org_id = p_org_id and p.deleted_at is null
    order by ('primary_ops' = any(om.roles)) desc, p.last_name nulls last, p.first_name nulls last;
end $$;

create or replace function partner_overview(p_org_id uuid, p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_o organization%rowtype; v_oe org_edition; v_roles text[]; v_full boolean;
begin
  v_roles := partner_roles(p_org_id);
  if not (cardinality(v_roles) > 0 or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from organization where id = p_org_id;
  if not found then raise exception 'org_not_found' using errcode = 'P0002'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  v_full := is_partner_team() or v_roles && '{primary_ops,additional,signing}'::text[];
  return jsonb_build_object(
    'org', jsonb_build_object('id', v_o.id, 'legal_name', v_o.legal_name, 'communication_name', v_o.communication_name, 'type', v_o.type,
                              'website', v_o.website, 'description', v_o.description, 'logo_dark', v_o.logo_dark, 'logo_light', v_o.logo_light,
                              'address', jsonb_build_object('street', v_o.address_street, 'zip', v_o.address_zip, 'city', v_o.address_city, 'country', v_o.address_country),
                              'partner_category', v_o.partner_category),
    'roles', to_jsonb(v_roles),
    'team', is_partner_team(),
    'edition', case when v_oe.id is null then null else jsonb_build_object(
        'id', v_oe.id, 'edition_id', v_oe.edition_id, 'onboarding_status', v_oe.onboarding_status, 'invited_at', v_oe.invited_at,
        'onboarding_filled_at', v_oe.onboarding_filled_at, 'description_de', v_oe.description_de, 'description_en', v_oe.description_en,
        'invoice_email', case when v_full then v_oe.invoice_email::text end, 'invoice_name', case when v_full then v_oe.invoice_name end,
        'vat_id', case when v_full then v_oe.vat_id end, 'po_number', case when v_full then v_oe.po_number end,
        'pass_type_choice', v_oe.pass_type_choice, 'sponsoring_level', v_oe.sponsoring_level) end,
    'contacts_count', (select count(*) from org_membership om where om.org_id = p_org_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('sku', op.product_sku, 'name_de', pr.name_de, 'name_en', pr.name_en, 'category', pr.category,
                                                                'type', pr.type, 'qty', op.qty, 'unit_price_cents', case when v_full then op.unit_price_cents end,
                                                                'status', op.status) order by pr.type, pr.name_de)
                          from org_product op join product pr on pr.sku = op.product_sku where op.org_edition_id = v_oe.id), '[]'::jsonb),
    'ticket_allocations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'pass_type', a.pass_type, 'quantity', a.quantity, 'coupon_code', a.coupon_code,
                                                                          'undershop_url', a.undershop_url, 'used_count', a.used_count) order by a.pass_type)
                                    from org_ticket_allocation a where a.org_id = p_org_id and a.event_id = v_oe.edition_id), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'due_at', d.due_at, 'label_de', d.label_de, 'label_en', d.label_en,
                                                                 'description_de', d.description_de, 'description_en', d.description_en) order by d.due_at)
                           from deadline d where d.edition_id = v_oe.edition_id and d.audience in ('partner', 'all')), '[]'::jsonb)
  );
end $$;

-- 5) Kontakte pflegen
create or replace function upsert_partner_contact(p_org_id uuid, p_email text, p_first_name text, p_last_name text, p_roles text[],
                                                  p_position text default null, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_email citext; v_pid uuid; v_oe org_edition; v_mid uuid; v_role text; v_org_name text; v_new boolean := false;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_roles is null or cardinality(p_roles) = 0 then raise exception 'roles_required' using errcode = '22023'; end if;
  foreach v_role in array p_roles loop
    if not is_vocab_key('contact_role', v_role) then raise exception 'invalid_role' using errcode = '22023', detail = v_role; end if;
  end loop;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id where pe.email = v_email and p.deleted_at is null limit 1;
  if v_pid is null then
    insert into person (first_name, last_name, source_first, tier)
    values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''), 'partner_portal', 'lead') returning id into v_pid;
    insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
  end if;
  if 'primary_ops' = any(p_roles) and exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id <> v_pid and om.roles @> '{primary_ops}') then
    raise exception 'primary_exists' using errcode = 'P0001';
  end if;
  select id into v_mid from org_membership where org_id = p_org_id and person_id = v_pid;
  if v_mid is null then
    insert into org_membership (person_id, org_id, roles, contact_position, invited_at) values (v_pid, p_org_id, p_roles, nullif(btrim(p_position), ''), now()) returning id into v_mid;
    v_new := true;
  else
    update org_membership set roles = p_roles, contact_position = coalesce(nullif(btrim(p_position), ''), contact_position) where id = v_mid;
  end if;
  if not exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'partner_contact' and ra.scope_type = 'org' and ra.scope_id = p_org_id
                   and (ra.valid_to is null or ra.valid_to > now())) then
    insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, granted_by, note)
    values (v_pid, 'partner_contact', 'org', p_org_id, v_oe.edition_id, v_me, 'partner_portal');
  end if;
  if v_new then
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
    perform queue_mail('partner_contact_invite', v_pid, jsonb_build_object('org_name', v_org_name), 'org_membership', v_mid);
  end if;
  perform log_audit('partner.contact_upsert', 'organization', p_org_id::text, null, jsonb_build_object('person_id', v_pid, 'roles', to_jsonb(p_roles), 'new', v_new));
  return v_pid;
end $$;

create or replace function set_contact_roles(p_org_id uuid, p_person_id uuid, p_roles text[]) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_role text; v_old text[];
begin
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_roles is null or cardinality(p_roles) = 0 then raise exception 'roles_required' using errcode = '22023'; end if;
  foreach v_role in array p_roles loop
    if not is_vocab_key('contact_role', v_role) then raise exception 'invalid_role' using errcode = '22023', detail = v_role; end if;
  end loop;
  select roles into v_old from org_membership where org_id = p_org_id and person_id = p_person_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  if 'primary_ops' = any(v_old) and not ('primary_ops' = any(p_roles)) then raise exception 'primary_required' using errcode = 'P0001', detail = 'transfer_first'; end if;
  if 'primary_ops' = any(p_roles) and exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id <> p_person_id and om.roles @> '{primary_ops}') then
    raise exception 'primary_exists' using errcode = 'P0001';
  end if;
  update org_membership set roles = p_roles where org_id = p_org_id and person_id = p_person_id;
  perform log_audit('partner.contact_roles', 'organization', p_org_id::text, jsonb_build_object('person_id', p_person_id, 'roles', to_jsonb(v_old)),
                    jsonb_build_object('person_id', p_person_id, 'roles', to_jsonb(p_roles)));
end $$;

create or replace function transfer_primary_contact(p_org_id uuid, p_person_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_current uuid;
begin
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from org_membership where org_id = p_org_id and person_id = p_person_id) then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  select person_id into v_current from org_membership where org_id = p_org_id and roles @> '{primary_ops}' for update;
  if v_current = p_person_id then return; end if;
  if v_current is not null then
    update org_membership set roles = array_append(array_remove(roles, 'primary_ops'), 'additional') where org_id = p_org_id and person_id = v_current;
  end if;
  update org_membership set roles = array_append(array_remove(roles, 'additional'), 'primary_ops') where org_id = p_org_id and person_id = p_person_id;
  perform log_audit('partner.primary_transfer', 'organization', p_org_id::text, jsonb_build_object('from', v_current), jsonb_build_object('to', p_person_id));
end $$;

create or replace function remove_partner_contact(p_org_id uuid, p_person_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_roles text[];
begin
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select roles into v_roles from org_membership where org_id = p_org_id and person_id = p_person_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  if 'primary_ops' = any(v_roles) then raise exception 'primary_required' using errcode = 'P0001', detail = 'transfer_first'; end if;
  delete from org_membership where org_id = p_org_id and person_id = p_person_id;
  delete from role_assignment where person_id = p_person_id and role = 'partner_contact' and scope_type = 'org' and scope_id = p_org_id;
  perform log_audit('partner.contact_removed', 'organization', p_org_id::text, jsonb_build_object('person_id', p_person_id, 'roles', to_jsonb(v_roles)), null);
end $$;

-- 6) Onboarding-Daten (Unternehmen + Edition); Logo-Pflicht kommt mit A4
create or replace function update_partner_onboarding(p_org_id uuid, p_data jsonb, p_edition_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_o organization%rowtype; v_status text;
begin
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if p_data ? 'pass_type_choice' and nullif(p_data->>'pass_type_choice', '') is not null and (p_data->>'pass_type_choice') not in ('talent', 'startup') then
    raise exception 'invalid_pass_type' using errcode = '22023';
  end if;
  if p_data ? 'invoice_email' and nullif(p_data->>'invoice_email', '') is not null and (p_data->>'invoice_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  update organization set
    legal_name         = case when p_data ? 'legal_name' then nullif(btrim(p_data->>'legal_name'), '') else legal_name end,
    communication_name = case when p_data ? 'communication_name' then nullif(btrim(p_data->>'communication_name'), '') else communication_name end,
    address_street     = case when p_data ? 'address_street' then nullif(btrim(p_data->>'address_street'), '') else address_street end,
    address_zip        = case when p_data ? 'address_zip' then nullif(btrim(p_data->>'address_zip'), '') else address_zip end,
    address_city       = case when p_data ? 'address_city' then nullif(btrim(p_data->>'address_city'), '') else address_city end,
    address_country    = case when p_data ? 'address_country' then nullif(btrim(p_data->>'address_country'), '') else address_country end,
    website            = case when p_data ? 'website' then nullif(btrim(p_data->>'website'), '') else website end,
    description        = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description end
  where id = p_org_id;
  update org_edition set
    description_de   = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
    description_en   = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
    invoice_email    = case when p_data ? 'invoice_email' then nullif(lower(btrim(p_data->>'invoice_email')), '')::citext else invoice_email end,
    invoice_name     = case when p_data ? 'invoice_name' then nullif(btrim(p_data->>'invoice_name'), '') else invoice_name end,
    vat_id           = case when p_data ? 'vat_id' then nullif(btrim(p_data->>'vat_id'), '') else vat_id end,
    po_number        = case when p_data ? 'po_number' then nullif(btrim(p_data->>'po_number'), '') else po_number end,
    pass_type_choice = case when p_data ? 'pass_type_choice' then nullif(p_data->>'pass_type_choice', '') else pass_type_choice end
  where id = v_oe.id;
  select * into v_o from organization where id = p_org_id;
  select * into v_oe from org_edition where id = v_oe.id;
  if v_oe.onboarding_status in ('none', 'invited')
     and coalesce(v_o.legal_name, '') <> '' and coalesce(v_o.communication_name, '') <> '' and coalesce(v_o.address_street, '') <> ''
     and coalesce(v_o.address_zip, '') <> '' and coalesce(v_o.address_city, '') <> '' and v_oe.invoice_email is not null and coalesce(v_oe.description_de, '') <> '' then
    update org_edition set onboarding_status = 'filled', onboarding_filled_at = now() where id = v_oe.id;
    v_status := 'filled';
  else
    v_status := v_oe.onboarding_status;
  end if;
  perform log_audit('partner.onboarding', 'organization', p_org_id::text, null, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_data) k), 'status', v_status));
  return jsonb_build_object('onboarding_status', v_status);
end $$;

-- 7) Team
create or replace function partner_set_onboarding_status(p_org_id uuid, p_status text, p_edition_id uuid default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('none', 'invited', 'filled', 'call_done') then raise exception 'invalid_status' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  update org_edition set onboarding_status = p_status,
                         invited_at = case when p_status = 'invited' then coalesce(invited_at, now()) else invited_at end,
                         onboarding_filled_at = case when p_status in ('filled', 'call_done') then coalesce(onboarding_filled_at, now()) else onboarding_filled_at end
   where id = v_oe.id;
  perform log_audit('partner.onboarding_status', 'organization', p_org_id::text, jsonb_build_object('status', v_oe.onboarding_status), jsonb_build_object('status', p_status));
end $$;

create or replace function partner_admin_overview(p_edition_id uuid default null)
returns table (org_id uuid, communication_name text, legal_name text, org_type text, edition_id uuid, onboarding_status text, invited_at timestamptz,
               onboarding_filled_at timestamptz, contacts integer, primary_email text, products integer, invoice_email text, hubspot_deal_id text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.type, oe.edition_id, oe.onboarding_status, oe.invited_at, oe.onboarding_filled_at,
           (select count(*)::integer from org_membership om where om.org_id = o.id),
           (select pe.email::text from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary where om.org_id = o.id and om.roles @> '{primary_ops}' limit 1),
           (select count(*)::integer from org_product op where op.org_edition_id = oe.id and op.status = 'booked'),
           oe.invoice_email::text, oe.hubspot_deal_id, oe.updated_at
    from org_edition oe join organization o on o.id = oe.org_id
    where (p_edition_id is null or oe.edition_id = p_edition_id)
    order by oe.onboarding_status, coalesce(o.communication_name, o.legal_name);
end $$;

-- 8) Mail
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('partner_contact_invite', 'de', 1, 'Dein Zugang zum ChefTreff-Partnerportal – {{org_name}}',
   E'Hallo {{first_name}},\n\ndu bist für **{{org_name}}** als Ansprechpartner für den Future Leader Summit hinterlegt. Im Partnerportal findest du Onboarding, Checkliste, Uploads, Tickets und den Messeshop.\n\nAnmelden mit dieser E-Mail-Adresse: [Partnerportal]({{portal_url}}/login)\n\nViele Grüße\nChefTreff',
   'Partner-Kontakt eingeladen (neuer Kontakt einer Organisation)', true),
  ('partner_contact_invite', 'en', 1, 'Your access to the ChefTreff partner portal – {{org_name}}',
   E'Hi {{first_name}},\n\nyou are listed as a contact for **{{org_name}}** for the Future Leader Summit. The partner portal holds onboarding, checklist, uploads, tickets and the trade fair shop.\n\nSign in with this email address: [Partner portal]({{portal_url}}/login)\n\nBest,\nChefTreff',
   'Partner contact invited', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
