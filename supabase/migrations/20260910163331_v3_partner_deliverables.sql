-- 0041 · Welle 3 A4: Partner-Uploads (Bucket partner-assets, partner_asset), Checkliste (deliverable aus deliverable_template je gebuchter
-- Leistung, Trigger auf org_product/org_edition), Stand (booth) mit Rückwand-Maßen, Einreichung mit Eingangsbestätigung (P1), Team-Review,
-- Datei-Regeln je Vorlage (P2: Logo nur SVG/EPS). Lunch-Paket ist in Phase 3 bestellbar (Entscheidung 2).
set search_path = public, extensions;

update product set late_orderable = true where sku = 'I-79520';

-- 1) Tabellen
create table if not exists deliverable (
  id             uuid primary key default gen_random_uuid(),
  org_edition_id uuid not null references org_edition (id) on delete cascade,
  template_id    uuid not null references deliverable_template (id) on delete cascade,
  key            text not null,
  product_sku    text references product (sku),
  status         text not null default 'open' check (status in ('open', 'submitted', 'accepted', 'rejected', 'overdue', 'not_required')),
  due_at         timestamptz,
  submitted_at   timestamptz,
  submitted_by   uuid references person (id) on delete set null,
  asset_ids      uuid[] not null default '{}',
  answers        jsonb not null default '{}'::jsonb,
  reviewed_by    uuid references person (id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_edition_id, template_id)
);
create index if not exists deliverable_status_idx on deliverable (status, due_at);
comment on table deliverable is 'Pflicht eines Partners je Edition, abgeleitet aus deliverable_template × gebuchte Leistungen.';
drop trigger if exists trg_deliverable_updated on deliverable;
create trigger trg_deliverable_updated before update on deliverable for each row execute function set_updated_at();

create table if not exists partner_asset (
  id             uuid primary key default gen_random_uuid(),
  org_edition_id uuid not null references org_edition (id) on delete cascade,
  deliverable_id uuid references deliverable (id) on delete set null,
  kind           text not null check (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  storage_path   text not null unique,
  filename       text not null,
  mime           text,
  size_bytes     bigint,
  version        integer not null default 1,
  is_current     boolean not null default true,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  review_note    text,
  reviewed_by    uuid references person (id) on delete set null,
  reviewed_at    timestamptz,
  uploaded_by    uuid references person (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists partner_asset_oe_idx on partner_asset (org_edition_id, kind, is_current);
comment on table partner_asset is 'Dateien einer Partner-Organisation im Bucket partner-assets (Pfad <edition>/<org>/<kind>/<datei>), versioniert.';
drop trigger if exists trg_partner_asset_updated on partner_asset;
create trigger trg_partner_asset_updated before update on partner_asset for each row execute function set_updated_at();

create table if not exists booth (
  id             uuid primary key default gen_random_uuid(),
  org_edition_id uuid not null unique references org_edition (id) on delete cascade,
  booth_number   text,
  booth_type     text,
  segment        text,
  length_m       numeric(5, 2),
  width_m        numeric(5, 2),
  backdrop_w_mm  integer,
  backdrop_h_mm  integer,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table booth is 'Stand je Partner × Edition (Nummer, Fläche, Rückwand-Maße); Team pflegt, Partner liest. Produktionsdetails folgen in Welle 4.';
drop trigger if exists trg_booth_updated on booth;
create trigger trg_booth_updated before update on booth for each row execute function set_updated_at();

-- 2) Rechte
alter table deliverable enable row level security;
alter table partner_asset enable row level security;
alter table booth enable row level security;
drop policy if exists deliverable_read on deliverable;
create policy deliverable_read on deliverable for select to authenticated
  using (exists (select 1 from org_edition oe where oe.id = org_edition_id and (is_partner_of(oe.org_id) or is_staff())));
drop policy if exists partner_asset_read on partner_asset;
create policy partner_asset_read on partner_asset for select to authenticated
  using (exists (select 1 from org_edition oe where oe.id = org_edition_id and (is_partner_of(oe.org_id) or is_staff())));
drop policy if exists booth_read on booth;
create policy booth_read on booth for select to authenticated
  using (exists (select 1 from org_edition oe where oe.id = org_edition_id and (is_partner_of(oe.org_id) or is_staff())));
revoke all on deliverable, partner_asset, booth from anon;
revoke insert, update, delete on deliverable, partner_asset, booth from authenticated;
grant select on deliverable, partner_asset, booth to authenticated;
grant all on deliverable, partner_asset, booth to service_role;

-- 3) Bucket + Pfadregel <edition>/<org>/<kind>/<datei>: Lesen für Mitglieder, Schreiben für Ops/Signing, Team immer
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-assets', 'partner-assets', false, 52428800,
        array['image/svg+xml', 'application/postscript', 'application/eps', 'application/x-eps', 'image/eps', 'application/illustrator',
              'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/zip', 'application/octet-stream'])
on conflict (id) do nothing;

create or replace function partner_asset_path_allowed(p_name text, p_write boolean default true) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_org uuid; v_edition uuid; v_kind text;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_org := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  v_kind := split_part(p_name, '/', 3);
  if v_kind !~ '^[a-z][a-z0-9_]{1,40}$' or split_part(p_name, '/', 4) = '' then return false; end if;
  if not exists (select 1 from org_edition oe where oe.org_id = v_org and oe.edition_id = v_edition) then return false; end if;
  if is_staff() then return true; end if;
  return case when p_write then partner_can_edit(v_org) else is_partner_of(v_org) end;
end $$;

drop policy if exists "partner assets read" on storage.objects;
drop policy if exists "partner assets insert" on storage.objects;
drop policy if exists "partner assets update" on storage.objects;
drop policy if exists "partner assets delete" on storage.objects;
create policy "partner assets read"   on storage.objects for select to authenticated using (bucket_id = 'partner-assets' and partner_asset_path_allowed(name, false));
create policy "partner assets insert" on storage.objects for insert to authenticated with check (bucket_id = 'partner-assets' and partner_asset_path_allowed(name, true));
create policy "partner assets update" on storage.objects for update to authenticated using (bucket_id = 'partner-assets' and partner_asset_path_allowed(name, true)) with check (bucket_id = 'partner-assets' and partner_asset_path_allowed(name, true));
create policy "partner assets delete" on storage.objects for delete to authenticated using (bucket_id = 'partner-assets' and partner_asset_path_allowed(name, true));

-- 4) Checkliste aus Vorlagen
create or replace function deliverable_due(p_template deliverable_template, p_oe org_edition) returns timestamptz
language sql stable security definer set search_path = public, extensions as $$
  select case
    when p_template.due_rule ? 'deadline_key' then (select d.due_at from deadline d where d.edition_id = p_oe.edition_id and d.key = p_template.due_rule->>'deadline_key')
    when p_template.due_rule ? 'offset_days' then coalesce(p_oe.invited_at, p_oe.created_at) + make_interval(days => (p_template.due_rule->>'offset_days')::integer)
    else null end
$$;
revoke execute on function deliverable_due(deliverable_template, org_edition) from public, anon, authenticated;

create or replace function template_applies(p_template deliverable_template, p_org_edition_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select (p_template.product_sku is null and p_template.category is null)
      or (p_template.product_sku is not null and exists (select 1 from org_product op where op.org_edition_id = p_org_edition_id and op.status = 'booked' and op.product_sku = p_template.product_sku))
      or (p_template.product_sku is null and p_template.category is not null and exists (
            select 1 from org_product op join product p on p.sku = op.product_sku
            where op.org_edition_id = p_org_edition_id and op.status = 'booked' and p.category = p_template.category))
$$;
revoke execute on function template_applies(deliverable_template, uuid) from public, anon, authenticated;

create or replace function sync_deliverables(p_org_edition_id uuid) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; r deliverable_template; v_n integer := 0;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return 0; end if;
  for r in select t.* from deliverable_template t where t.active and template_applies(t, v_oe.id) loop
    insert into deliverable (org_edition_id, template_id, key, product_sku, due_at)
    values (v_oe.id, r.id, r.key, r.product_sku, deliverable_due(r, v_oe))
    on conflict (org_edition_id, template_id) do update
      set due_at = coalesce(deliverable.due_at, excluded.due_at),
          status = case when deliverable.status = 'not_required' then 'open' else deliverable.status end;
    v_n := v_n + 1;
  end loop;
  update deliverable d set status = 'not_required'
   where d.org_edition_id = v_oe.id and d.status in ('open', 'overdue')
     and not exists (select 1 from deliverable_template t where t.id = d.template_id and t.active and template_applies(t, v_oe.id));
  return v_n;
end $$;
revoke execute on function sync_deliverables(uuid) from public, anon, authenticated;

create or replace function trg_org_product_sync() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform sync_deliverables(coalesce(new.org_edition_id, old.org_edition_id));
  return coalesce(new, old);
end $$;
drop trigger if exists trg_org_product_deliverables on org_product;
create trigger trg_org_product_deliverables after insert or update or delete on org_product for each row execute function trg_org_product_sync();

create or replace function trg_org_edition_sync() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform sync_deliverables(new.id);
  return new;
end $$;
drop trigger if exists trg_org_edition_deliverables on org_edition;
create trigger trg_org_edition_deliverables after insert on org_edition for each row execute function trg_org_edition_sync();

-- Team: Checklisten nach Vorlagenänderung neu ableiten
create or replace function resync_deliverables(p_edition_id uuid default null) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_n integer := 0;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select oe.id from org_edition oe where p_edition_id is null or oe.edition_id = p_edition_id loop
    perform sync_deliverables(r.id); v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 5) Onboarding-Status neu bewerten (auch Logo-Pflicht); von update_partner_onboarding und register_partner_asset benutzt
create or replace function partner_onboarding_recheck(p_org_edition_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_o organization%rowtype;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return null; end if;
  select * into v_o from organization where id = v_oe.org_id;
  if v_oe.onboarding_status in ('none', 'invited')
     and coalesce(v_o.legal_name, '') <> '' and coalesce(v_o.communication_name, '') <> '' and coalesce(v_o.address_street, '') <> ''
     and coalesce(v_o.address_zip, '') <> '' and coalesce(v_o.address_city, '') <> '' and v_oe.invoice_email is not null and coalesce(v_oe.description_de, '') <> ''
     and exists (select 1 from partner_asset a where a.org_edition_id = v_oe.id and a.kind = 'logo_vector' and a.is_current) then
    update org_edition set onboarding_status = 'filled', onboarding_filled_at = now() where id = v_oe.id;
    return 'filled';
  end if;
  return v_oe.onboarding_status;
end $$;
revoke execute on function partner_onboarding_recheck(uuid) from public, anon, authenticated;

create or replace function update_partner_onboarding(p_org_id uuid, p_data jsonb, p_edition_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_status text;
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
  v_status := partner_onboarding_recheck(v_oe.id);
  perform log_audit('partner.onboarding', 'organization', p_org_id::text, null, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_data) k), 'status', v_status));
  return jsonb_build_object('onboarding_status', v_status);
end $$;

-- 6) Upload registrieren: Pfad, Objekt, Datei-Regeln der Vorlage
create or replace function register_partner_asset(p_org_id uuid, p_kind text, p_storage_path text, p_filename text,
                                                  p_mime text default null, p_size_bytes bigint default null,
                                                  p_deliverable_id uuid default null, p_edition_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_d deliverable; v_t deliverable_template; v_rules jsonb; v_ext text; v_version integer; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'invalid_kind' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if p_storage_path not like v_oe.edition_id::text || '/' || p_org_id::text || '/' || p_kind || '/%' then raise exception 'path_mismatch' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then raise exception 'object_not_found' using errcode = 'P0002'; end if;
  v_ext := lower(nullif(regexp_replace(coalesce(p_filename, ''), '^.*\.', ''), coalesce(p_filename, '')));
  if p_deliverable_id is not null then
    select * into v_d from deliverable where id = p_deliverable_id and org_edition_id = v_oe.id;
    if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
    select * into v_t from deliverable_template where id = v_d.template_id;
    v_rules := coalesce(v_t.file_rules, '{}'::jsonb);
    if v_rules ? 'ext' and not (v_rules->'ext' @> to_jsonb(coalesce(v_ext, ''))) then
      raise exception 'file_rules' using errcode = '22023', detail = 'ext:' || coalesce(v_ext, '?') || ' allowed:' || (v_rules->>'ext');
    end if;
    if v_rules ? 'mime' and p_mime is not null and p_mime not in ('application/octet-stream', '') and not (v_rules->'mime' @> to_jsonb(p_mime)) then
      raise exception 'file_rules' using errcode = '22023', detail = 'mime:' || p_mime;
    end if;
    if v_rules ? 'max_bytes' and p_size_bytes is not null and p_size_bytes > (v_rules->>'max_bytes')::bigint then
      raise exception 'file_rules' using errcode = '22023', detail = 'max_bytes';
    end if;
  elsif p_kind = 'logo_vector' and coalesce(v_ext, '') not in ('svg', 'eps', 'ai', 'pdf') then
    raise exception 'file_rules' using errcode = '22023', detail = 'logo_vector: svg, eps, ai, pdf';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from partner_asset
   where org_edition_id = v_oe.id and kind = p_kind and coalesce(deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid);
  update partner_asset set is_current = false
   where org_edition_id = v_oe.id and kind = p_kind and is_current
     and coalesce(deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid);
  insert into partner_asset (org_edition_id, deliverable_id, kind, storage_path, filename, mime, size_bytes, version, uploaded_by)
  values (v_oe.id, p_deliverable_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_me)
  returning id into v_id;
  if p_kind = 'logo_vector' then perform partner_onboarding_recheck(v_oe.id); end if;
  perform log_audit('partner.asset', 'organization', p_org_id::text, null, jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'deliverable_id', p_deliverable_id));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;

-- 7) Checkliste lesen, einreichen, prüfen
create or replace function my_deliverables(p_org_id uuid, p_edition_id uuid default null)
returns table (id uuid, key text, type text, label_de text, label_en text, description_de text, description_en text, product_sku text,
               product_name_de text, product_name_en text, status text, due_at timestamptz, submitted_at timestamptz, review_note text,
               required boolean, file_rules jsonb, answers jsonb, assets jsonb, sort integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select d.id, d.key, t.type, t.label_de, t.label_en, t.description_de, t.description_en, d.product_sku, pr.name_de, pr.name_en,
           d.status, d.due_at, d.submitted_at, d.review_note, t.required, t.file_rules, d.answers,
           coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename, 'mime', a.mime, 'size_bytes', a.size_bytes, 'status', a.status,
                                                          'version', a.version, 'storage_path', a.storage_path, 'created_at', a.created_at) order by a.created_at desc)
                     from partner_asset a where a.deliverable_id = d.id and a.is_current), '[]'::jsonb),
           t.sort
    from deliverable d
    join deliverable_template t on t.id = d.template_id
    left join product pr on pr.sku = d.product_sku
    where d.org_edition_id = v_oe.id and d.status <> 'not_required'
    order by t.sort, d.due_at nulls last, t.label_de;
end $$;

create or replace function submit_deliverable(p_deliverable_id uuid, p_asset_ids uuid[] default '{}'::uuid[], p_answers jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_d deliverable; v_oe org_edition; v_t deliverable_template; v_org_name text; v_primary uuid; v_locale text; r record;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_d from deliverable where id = p_deliverable_id for update;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  if not partner_can_edit(v_oe.org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_d.status not in ('open', 'rejected', 'overdue') then raise exception 'not_editable' using errcode = 'P0001', detail = v_d.status; end if;
  select * into v_t from deliverable_template where id = v_d.template_id;
  if v_t.type = 'upload' then
    if p_asset_ids is null or cardinality(p_asset_ids) = 0 then raise exception 'asset_required' using errcode = '22023'; end if;
    if exists (select 1 from unnest(p_asset_ids) x where not exists (select 1 from partner_asset a where a.id = x and a.org_edition_id = v_oe.id)) then
      raise exception 'asset_not_found' using errcode = 'P0002';
    end if;
    update partner_asset set deliverable_id = p_deliverable_id where id = any(p_asset_ids) and deliverable_id is null;
  elsif v_t.type = 'form' then
    if p_answers is null or p_answers = '{}'::jsonb then raise exception 'answers_required' using errcode = '22023'; end if;
  end if;
  update deliverable set status = 'submitted', submitted_at = now(), submitted_by = v_me, asset_ids = coalesce(p_asset_ids, '{}'),
                         answers = coalesce(p_answers, '{}'::jsonb), review_note = null
   where id = p_deliverable_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_oe.org_id;
  -- Eingangsbestätigung (P1) an den Einreichenden und den Hauptkontakt
  select om.person_id into v_primary from org_membership om where om.org_id = v_oe.org_id and om.roles @> '{primary_ops}';
  for r in select distinct x as pid from unnest(array_remove(array[v_me, v_primary], null)) x loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
    perform queue_mail('partner_deliverable_received', r.pid,
                       jsonb_build_object('org_name', v_org_name, 'deliverable', case when v_locale = 'en' then v_t.label_en else v_t.label_de end),
                       'deliverable', p_deliverable_id);
  end loop;
  perform log_audit('partner.deliverable_submit', 'organization', v_oe.org_id::text, null, jsonb_build_object('deliverable_id', p_deliverable_id, 'key', v_d.key, 'assets', cardinality(coalesce(p_asset_ids, '{}'))));
end $$;

create or replace function review_deliverable(p_deliverable_id uuid, p_accepted boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_d deliverable; v_oe org_edition; v_t deliverable_template; v_org_name text; v_primary uuid; v_locale text; r record;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_d from deliverable where id = p_deliverable_id for update;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  if v_d.status not in ('submitted', 'accepted') then raise exception 'not_pending' using errcode = 'P0001', detail = v_d.status; end if;
  if not p_accepted and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  select * into v_t from deliverable_template where id = v_d.template_id;
  update deliverable set status = case when p_accepted then 'accepted' else 'rejected' end, reviewed_by = current_person_id(), reviewed_at = now(),
                         review_note = nullif(btrim(p_note), '') where id = p_deliverable_id;
  update partner_asset set status = case when p_accepted then 'accepted' else 'rejected' end, reviewed_by = current_person_id(), reviewed_at = now(),
                           review_note = nullif(btrim(p_note), '')
   where deliverable_id = p_deliverable_id and is_current;
  if not p_accepted then
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_oe.org_id;
    select om.person_id into v_primary from org_membership om where om.org_id = v_oe.org_id and om.roles @> '{primary_ops}';
    for r in select distinct x as pid from unnest(array_remove(array[v_d.submitted_by, v_primary], null)) x loop
      select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
      perform queue_mail('partner_deliverable_rejected', r.pid,
                         jsonb_build_object('org_name', v_org_name, 'deliverable', case when v_locale = 'en' then v_t.label_en else v_t.label_de end, 'note', btrim(p_note)),
                         'deliverable', p_deliverable_id);
    end loop;
  end if;
  perform log_audit(case when p_accepted then 'partner.deliverable_accept' else 'partner.deliverable_reject' end, 'organization', v_oe.org_id::text,
                    jsonb_build_object('status', v_d.status), jsonb_build_object('deliverable_id', p_deliverable_id, 'note', p_note));
end $$;

create or replace function partner_review_queue(p_edition_id uuid default null)
returns table (id uuid, org_id uuid, org_name text, key text, type text, label_de text, label_en text, status text, due_at timestamptz, submitted_at timestamptz,
               submitted_by_name text, assets jsonb, answers jsonb, review_note text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select d.id, oe.org_id, coalesce(o.communication_name, o.legal_name), d.key, t.type, t.label_de, t.label_en, d.status, d.due_at, d.submitted_at,
           (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = d.submitted_by),
           coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename, 'mime', a.mime, 'size_bytes', a.size_bytes, 'storage_path', a.storage_path, 'status', a.status) order by a.created_at desc)
                     from partner_asset a where a.deliverable_id = d.id and a.is_current), '[]'::jsonb),
           d.answers, d.review_note
    from deliverable d
    join deliverable_template t on t.id = d.template_id
    join org_edition oe on oe.id = d.org_edition_id
    join organization o on o.id = oe.org_id
    where d.status in ('submitted', 'rejected', 'overdue') and (p_edition_id is null or oe.edition_id = p_edition_id)
    order by case d.status when 'submitted' then 0 when 'overdue' then 1 else 2 end, d.submitted_at nulls last, d.due_at nulls last;
end $$;

-- 8) Stand (Team pflegt) und Vorlagen (Team pflegt)
create or replace function upsert_booth(p_org_id uuid, p_data jsonb, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_id uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  insert into booth (org_edition_id, booth_number, booth_type, segment, length_m, width_m, backdrop_w_mm, backdrop_h_mm, notes)
  values (v_oe.id, p_data->>'booth_number', p_data->>'booth_type', p_data->>'segment', (p_data->>'length_m')::numeric, (p_data->>'width_m')::numeric,
          (p_data->>'backdrop_w_mm')::integer, (p_data->>'backdrop_h_mm')::integer, p_data->>'notes')
  on conflict (org_edition_id) do update set
    booth_number  = case when p_data ? 'booth_number' then excluded.booth_number else booth.booth_number end,
    booth_type    = case when p_data ? 'booth_type' then excluded.booth_type else booth.booth_type end,
    segment       = case when p_data ? 'segment' then excluded.segment else booth.segment end,
    length_m      = case when p_data ? 'length_m' then excluded.length_m else booth.length_m end,
    width_m       = case when p_data ? 'width_m' then excluded.width_m else booth.width_m end,
    backdrop_w_mm = case when p_data ? 'backdrop_w_mm' then excluded.backdrop_w_mm else booth.backdrop_w_mm end,
    backdrop_h_mm = case when p_data ? 'backdrop_h_mm' then excluded.backdrop_h_mm else booth.backdrop_h_mm end,
    notes         = case when p_data ? 'notes' then excluded.notes else booth.notes end
  returning id into v_id;
  perform log_audit('partner.booth', 'organization', p_org_id::text, null, p_data);
  return v_id;
end $$;

create or replace function upsert_deliverable_template(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    if nullif(p_data->>'key', '') is null or nullif(p_data->>'type', '') is null or nullif(p_data->>'label_de', '') is null or nullif(p_data->>'label_en', '') is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    insert into deliverable_template (key, product_sku, category, type, label_de, label_en, description_de, description_en, due_rule, file_rules, required, audience_roles, sort, active)
    values (p_data->>'key', nullif(p_data->>'product_sku', ''), nullif(p_data->>'category', ''), p_data->>'type', p_data->>'label_de', p_data->>'label_en',
            nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''), coalesce(p_data->'due_rule', '{}'::jsonb), p_data->'file_rules',
            coalesce((p_data->>'required')::boolean, true), coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'audience_roles') x), '{primary_ops,additional}'),
            coalesce((p_data->>'sort')::integer, 100), coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    update deliverable_template set
      label_de = coalesce(nullif(p_data->>'label_de', ''), label_de), label_en = coalesce(nullif(p_data->>'label_en', ''), label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      due_rule = case when p_data ? 'due_rule' then p_data->'due_rule' else due_rule end,
      file_rules = case when p_data ? 'file_rules' then p_data->'file_rules' else file_rules end,
      required = case when p_data ? 'required' then (p_data->>'required')::boolean else required end,
      sort = case when p_data ? 'sort' then (p_data->>'sort')::integer else sort end,
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end
    where id = v_id;
    if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('partner.template', 'deliverable_template', v_id::text, null, p_data);
  return v_id;
end $$;

-- 9) partner_overview: Stand und Checklisten-Zusammenfassung ergänzen
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
                           from deadline d where d.edition_id = v_oe.edition_id and d.audience in ('partner', 'all')), '[]'::jsonb),
    'booth', (select to_jsonb(b) - 'id' - 'org_edition_id' - 'notes' from booth b where b.org_edition_id = v_oe.id),
    'checklist', (select jsonb_build_object('total', count(*) filter (where d.status <> 'not_required'),
                                            'done', count(*) filter (where d.status in ('submitted', 'accepted')),
                                            'open', count(*) filter (where d.status in ('open', 'overdue')),
                                            'rejected', count(*) filter (where d.status = 'rejected'),
                                            'overdue', count(*) filter (where d.status = 'overdue'),
                                            'next_due', min(d.due_at) filter (where d.status in ('open', 'rejected', 'overdue')))
                  from deliverable d where d.org_edition_id = v_oe.id)
  );
end $$;

-- partner_admin_overview: offene / überfällige Pflichten (Rückgabetyp ändert sich ⇒ drop + create)
drop function if exists partner_admin_overview(uuid);
create function partner_admin_overview(p_edition_id uuid default null)
returns table (org_id uuid, communication_name text, legal_name text, org_type text, edition_id uuid, onboarding_status text, invited_at timestamptz,
               onboarding_filled_at timestamptz, contacts integer, primary_email text, products integer, invoice_email text, hubspot_deal_id text, updated_at timestamptz,
               deliverables_open integer, deliverables_submitted integer, deliverables_overdue integer, booth_number text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.type, oe.edition_id, oe.onboarding_status, oe.invited_at, oe.onboarding_filled_at,
           (select count(*)::integer from org_membership om where om.org_id = o.id),
           (select pe.email::text from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary where om.org_id = o.id and om.roles @> '{primary_ops}' limit 1),
           (select count(*)::integer from org_product op where op.org_edition_id = oe.id and op.status = 'booked'),
           oe.invoice_email::text, oe.hubspot_deal_id, oe.updated_at,
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status in ('open', 'rejected')),
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status = 'submitted'),
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status = 'overdue'),
           (select b.booth_number from booth b where b.org_edition_id = oe.id)
    from org_edition oe join organization o on o.id = oe.org_id
    where (p_edition_id is null or oe.edition_id = p_edition_id)
    order by oe.onboarding_status, coalesce(o.communication_name, o.legal_name);
end $$;

-- 10) Vorlagen (Seed FLS27; Team ergänzt im Admin)
insert into deliverable_template (key, product_sku, category, type, label_de, label_en, description_de, description_en, due_rule, file_rules, required, sort)
select v.* from (values
  ('logo_vector', null, null, 'upload', 'Logo als Vektordatei', 'Logo as vector file',
   'SVG oder EPS für Website, Event-App und Druck. Das Logo wird nach Prüfung automatisch veröffentlicht.', 'SVG or EPS for website, event app and print. Published automatically after review.',
   '{}'::jsonb, '{"ext": ["svg", "eps", "ai", "pdf"], "mime": ["image/svg+xml", "application/postscript", "application/eps", "application/x-eps", "image/eps", "application/illustrator", "application/pdf"], "max_bytes": 20971520}'::jsonb, true, 10),
  ('backdrop_print', 'I-39709', null, 'upload', 'Rückwand-Druckdatei', 'Backdrop print file',
   'Druckfertige PDF-Datei in den Maßen, die im Portal stehen.', 'Print-ready PDF in the dimensions shown in the portal.',
   '{"deadline_key": "booth_backdrop"}'::jsonb, '{"ext": ["pdf"], "mime": ["application/pdf"], "max_bytes": 52428800}'::jsonb, true, 20),
  ('backdrop_print', 'I-50131', null, 'upload', 'Rückwand-Druckdatei', 'Backdrop print file',
   'Druckfertige PDF-Datei in den Maßen, die im Portal stehen.', 'Print-ready PDF in the dimensions shown in the portal.',
   '{"deadline_key": "booth_backdrop"}'::jsonb, '{"ext": ["pdf"], "mime": ["application/pdf"], "max_bytes": 52428800}'::jsonb, true, 20),
  ('backdrop_print', 'I-39740', null, 'upload', 'Rückwand-Druckdatei', 'Backdrop print file',
   'Druckfertige PDF-Datei in den Maßen, die im Portal stehen.', 'Print-ready PDF in the dimensions shown in the portal.',
   '{"deadline_key": "booth_backdrop"}'::jsonb, '{"ext": ["pdf"], "mime": ["application/pdf"], "max_bytes": 52428800}'::jsonb, true, 20),
  ('backdrop_print', 'I-79031', null, 'upload', 'Rückwand-Druckdatei', 'Backdrop print file',
   'Druckfertige PDF-Datei in den Maßen, die im Portal stehen.', 'Print-ready PDF in the dimensions shown in the portal.',
   '{"deadline_key": "booth_backdrop"}'::jsonb, '{"ext": ["pdf"], "mime": ["application/pdf"], "max_bytes": 52428800}'::jsonb, true, 20),
  ('lunch_package', null, 'standflaeche', 'booking', 'Lunch-Paket für das Standteam bestellen', 'Order the lunch package for your booth team',
   'Verpflegung an beiden Tagen, bestellbar im Messeshop bis zur Frist.', 'Catering on both days, orderable in the trade fair shop until the deadline.',
   '{"deadline_key": "lunch_package"}'::jsonb, null, true, 30),
  ('digital_branding', 'I-95690', null, 'upload', 'Digital-Branding-Dateien', 'Digital branding files',
   'Logos und Motive für die digitalen Flächen.', 'Logos and artwork for the digital screens.',
   '{}'::jsonb, '{"ext": ["pdf", "png", "svg", "jpg", "jpeg", "zip"], "max_bytes": 52428800}'::jsonb, true, 40),
  ('ticket_codes', null, 'tickets', 'info', 'Ticket-Codes einlösen', 'Redeem your ticket codes',
   'Partner-Tickets über den Code oder den Secret Shop buchen.', 'Book your partner tickets via code or secret shop.',
   '{"deadline_key": "ticket_codes"}'::jsonb, null, false, 50)
) as v(key, product_sku, category, type, label_de, label_en, description_de, description_en, due_rule, file_rules, required, sort)
where not exists (select 1 from deliverable_template t where t.key = v.key and t.product_sku is not distinct from v.product_sku and t.category is not distinct from v.category);

-- 11) Mails
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('partner_deliverable_received', 'de', 1, 'Eingangsbestätigung: {{deliverable}} – {{org_name}}',
   E'Hallo {{first_name}},\n\n**{{deliverable}}** für {{org_name}} ist bei uns eingegangen. Wir prüfen die Einreichung und melden uns, falls etwas fehlt.\n\nZur Checkliste: [Partnerportal]({{portal_url}}/partner/checkliste)\n\nViele Grüße\nChefTreff',
   'Eingangsbestätigung je Einreichung (P1)', true),
  ('partner_deliverable_received', 'en', 1, 'Received: {{deliverable}} – {{org_name}}',
   E'Hi {{first_name}},\n\n**{{deliverable}}** for {{org_name}} has reached us. We review it and get back to you if anything is missing.\n\nChecklist: [Partner portal]({{portal_url}}/partner/checkliste)\n\nBest,\nChefTreff',
   'Receipt confirmation per submission', true),
  ('partner_deliverable_rejected', 'de', 1, 'Bitte nachbessern: {{deliverable}} – {{org_name}}',
   E'Hallo {{first_name}},\n\n**{{deliverable}}** für {{org_name}} konnten wir so nicht übernehmen:\n\n{{note}}\n\nBitte im Portal korrigieren und erneut einreichen: [Checkliste]({{portal_url}}/partner/checkliste)\n\nViele Grüße\nChefTreff',
   'Einreichung abgelehnt mit Grund', true),
  ('partner_deliverable_rejected', 'en', 1, 'Please revise: {{deliverable}} – {{org_name}}',
   E'Hi {{first_name}},\n\nwe could not accept **{{deliverable}}** for {{org_name}} as submitted:\n\n{{note}}\n\nPlease correct and resubmit in the portal: [Checklist]({{portal_url}}/partner/checkliste)\n\nBest,\nChefTreff',
   'Submission rejected with reason', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
