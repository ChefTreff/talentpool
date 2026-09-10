-- 0043 · Welle 3 A2: HubSpot-Ingest mit Gate als service_role-RPC, Edition ↔ HubSpot-Pipeline/-Phase, Integrations-RPCs für Webhook-Route und
-- Sweep (integration.* ist nicht über PostgREST erreichbar), Ticket-Kontingente aus Ticket-Produkten (product.pass_type), Bühnen-Editor aus
-- Bühnenprodukt (product.grants_role, Scope org — greift, sobald Produktion die Bühne mit stage.partner_org_id anlegt), gemeinsamer Kontakt-Upsert
-- für Portal und Ingest (Rolle partner_contact bis Editionsende), Mail partner_gate_failed, set_expense_integration nur für approved/paid.
set search_path = public, extensions;

-- 1) Edition ↔ HubSpot
alter table event add column if not exists hubspot_pipeline_id text;
alter table event add column if not exists hubspot_onboarding_stage_id text;
create unique index if not exists event_hubspot_pipeline_uidx on event (hubspot_pipeline_id) where hubspot_pipeline_id is not null;
comment on column event.hubspot_pipeline_id is 'HubSpot-Deal-Pipeline der Edition; der Ingest ordnet Deals darüber zu.';
comment on column event.hubspot_onboarding_stage_id is 'Deal-Phase „Onboarding Automation"; der Webhook auf diese Phase löst den Ingest aus.';

create or replace function set_edition_hubspot(p_edition_id uuid, p_pipeline_id text, p_stage_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update event set hubspot_pipeline_id = nullif(btrim(coalesce(p_pipeline_id, '')), ''), hubspot_onboarding_stage_id = nullif(btrim(coalesce(p_stage_id, '')), '')
   where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  perform log_audit('edition.hubspot', 'event', p_edition_id::text, null, jsonb_build_object('pipeline_id', p_pipeline_id, 'stage_id', p_stage_id));
end $$;

create or replace function hubspot_editions()
returns table (edition_id uuid, slug text, name text, pipeline_id text, stage_id text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.slug, e.name, e.hubspot_pipeline_id, e.hubspot_onboarding_stage_id
    from event e where e.is_edition and e.hubspot_pipeline_id is not null and e.hubspot_onboarding_stage_id is not null
    order by e.start_date desc nulls last;
end $$;

-- 2) Produkte: Pass-Typ für Ticket-Produkte, Rolle aus Bühnenprodukt
alter table product add column if not exists pass_type text;
alter table product add column if not exists grants_role text;
alter table product drop constraint if exists product_pass_type_chk;
alter table product add constraint product_pass_type_chk check (pass_type is null or pass_type in ('partner', 'talent', 'investor'));
grant select (pass_type, grants_role) on product to authenticated;
update product set pass_type = 'partner' where sku = 'I-32776';
update product set pass_type = 'talent' where sku = 'I-46500';
update product set pass_type = 'investor' where sku = 'I-62740';
update product set grants_role = 'standbuehne_editor' where sku = 'I-79895';

create or replace function upsert_product(p_data jsonb) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_sku text := p_data->>'sku'; v_exists boolean;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sku is null or v_sku !~ '^I-[0-9]{5}$' then raise exception 'invalid_sku' using errcode = '22023'; end if;
  if p_data ? 'category' and not is_vocab_key('product_category', p_data->>'category') then raise exception 'invalid_category' using errcode = '22023'; end if;
  if p_data ? 'pass_type' and nullif(p_data->>'pass_type', '') is not null and (p_data->>'pass_type') not in ('partner', 'talent', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  if p_data ? 'grants_role' and nullif(p_data->>'grants_role', '') is not null and not is_vocab_key('role', p_data->>'grants_role') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select exists (select 1 from product where sku = v_sku) into v_exists;
  if not v_exists then
    insert into product (sku, name_de, name_en, description_de, description_en, type, category, unit, net_price_cents, purchase_price_cents, margin, vat_rate,
                         supplier, supplier_sku, supplier_url, stock_total, track_stock, available_until, shop_visible, shop_sort, late_orderable,
                         shop_hint_de, shop_hint_en, purchase_note_de, purchase_note_en, merch_config, images, source_hubspot, source_shop, internal_comment, active, edition_id,
                         pass_type, grants_role)
    values (v_sku, p_data->>'name_de', p_data->>'name_en', p_data->>'description_de', p_data->>'description_en', coalesce(p_data->>'type', 'shop_item'), p_data->>'category',
            coalesce(p_data->>'unit', 'piece'), (p_data->>'net_price_cents')::integer, (p_data->>'purchase_price_cents')::integer, (p_data->>'margin')::numeric,
            coalesce((p_data->>'vat_rate')::numeric, 7), p_data->>'supplier', p_data->>'supplier_sku', p_data->>'supplier_url', (p_data->>'stock_total')::integer,
            coalesce((p_data->>'track_stock')::boolean, false), (p_data->>'available_until')::timestamptz, coalesce((p_data->>'shop_visible')::boolean, false),
            (p_data->>'shop_sort')::integer, coalesce((p_data->>'late_orderable')::boolean, false), p_data->>'shop_hint_de', p_data->>'shop_hint_en',
            p_data->>'purchase_note_de', p_data->>'purchase_note_en', p_data->'merch_config', coalesce(p_data->'images', '[]'::jsonb),
            coalesce((p_data->>'source_hubspot')::boolean, false), coalesce((p_data->>'source_shop')::boolean, false), p_data->>'internal_comment',
            coalesce((p_data->>'active')::boolean, true), (p_data->>'edition_id')::uuid,
            nullif(p_data->>'pass_type', ''), nullif(p_data->>'grants_role', ''));
  else
    update product set
      name_de = case when p_data ? 'name_de' then p_data->>'name_de' else name_de end,
      name_en = case when p_data ? 'name_en' then nullif(p_data->>'name_en', '') else name_en end,
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      type = case when p_data ? 'type' then p_data->>'type' else type end,
      category = case when p_data ? 'category' then p_data->>'category' else category end,
      unit = case when p_data ? 'unit' then p_data->>'unit' else unit end,
      net_price_cents = case when p_data ? 'net_price_cents' then (p_data->>'net_price_cents')::integer else net_price_cents end,
      purchase_price_cents = case when p_data ? 'purchase_price_cents' then (p_data->>'purchase_price_cents')::integer else purchase_price_cents end,
      margin = case when p_data ? 'margin' then (p_data->>'margin')::numeric else margin end,
      vat_rate = case when p_data ? 'vat_rate' then (p_data->>'vat_rate')::numeric else vat_rate end,
      supplier = case when p_data ? 'supplier' then nullif(p_data->>'supplier', '') else supplier end,
      supplier_sku = case when p_data ? 'supplier_sku' then nullif(p_data->>'supplier_sku', '') else supplier_sku end,
      supplier_url = case when p_data ? 'supplier_url' then nullif(p_data->>'supplier_url', '') else supplier_url end,
      stock_total = case when p_data ? 'stock_total' then (p_data->>'stock_total')::integer else stock_total end,
      track_stock = case when p_data ? 'track_stock' then (p_data->>'track_stock')::boolean else track_stock end,
      available_until = case when p_data ? 'available_until' then (p_data->>'available_until')::timestamptz else available_until end,
      shop_visible = case when p_data ? 'shop_visible' then (p_data->>'shop_visible')::boolean else shop_visible end,
      shop_sort = case when p_data ? 'shop_sort' then (p_data->>'shop_sort')::integer else shop_sort end,
      late_orderable = case when p_data ? 'late_orderable' then (p_data->>'late_orderable')::boolean else late_orderable end,
      shop_hint_de = case when p_data ? 'shop_hint_de' then nullif(p_data->>'shop_hint_de', '') else shop_hint_de end,
      shop_hint_en = case when p_data ? 'shop_hint_en' then nullif(p_data->>'shop_hint_en', '') else shop_hint_en end,
      purchase_note_de = case when p_data ? 'purchase_note_de' then nullif(p_data->>'purchase_note_de', '') else purchase_note_de end,
      purchase_note_en = case when p_data ? 'purchase_note_en' then nullif(p_data->>'purchase_note_en', '') else purchase_note_en end,
      merch_config = case when p_data ? 'merch_config' then p_data->'merch_config' else merch_config end,
      images = case when p_data ? 'images' then p_data->'images' else images end,
      internal_comment = case when p_data ? 'internal_comment' then nullif(p_data->>'internal_comment', '') else internal_comment end,
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      pass_type = case when p_data ? 'pass_type' then nullif(p_data->>'pass_type', '') else pass_type end,
      grants_role = case when p_data ? 'grants_role' then nullif(p_data->>'grants_role', '') else grants_role end
    where sku = v_sku;
  end if;
  perform log_audit('product.upsert', 'product', v_sku, null, p_data - 'description_de' - 'description_en');
  return v_sku;
end $$;

-- 3) Bühnen-Editor mit Scope org: gilt für Bühnen, deren stage.partner_org_id die Org ist
create or replace function can_edit_stage(p_stage_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from stage st
    join event ev on ev.id = st.event_id
    join active_roles() ra on true
    where st.id = p_stage_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))
        or (ra.role in ('speaker_manager','standbuehne_editor') and ra.scope_type = 'stage' and ra.scope_id = st.id)
        or (ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
      )
  )
$$;

create or replace function can_edit_slot(p_slot_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from slot s
    join stage st on st.id = s.stage_id
    join event ev on ev.id = st.event_id
    left join stage_day sd on sd.stage_id = s.stage_id and sd.event_day_id = s.event_day_id
    join active_roles() ra on true
    where s.id = p_slot_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))
        or (ra.role in ('speaker_manager','standbuehne_editor') and ra.scope_type = 'stage' and ra.scope_id = s.stage_id)
        or (ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
        or (ra.role = 'speaker_manager' and ra.scope_type = 'stage_day' and ra.scope_id = sd.id)
        or (ra.role = 'speaker_manager' and ra.scope_type = 'slot' and ra.scope_id = s.id)
      )
  )
$$;

-- 4) Kontakt-Upsert intern (Portal und Ingest): Rolle partner_contact bis Editionsende
create or replace function edition_valid_to(p_edition_id uuid) returns timestamptz
language sql stable security definer set search_path = public, extensions as $$
  select case when e.end_date is null then null else ((e.end_date + 1)::timestamp at time zone coalesce(e.timezone, 'Europe/Berlin')) end
  from event e where e.id = p_edition_id
$$;
revoke execute on function edition_valid_to(uuid) from public, anon, authenticated;

create or replace function partner_contact_upsert_internal(p_org_id uuid, p_email text, p_first_name text, p_last_name text, p_roles text[], p_position text,
                                                           p_edition_id uuid, p_actor uuid, p_source text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_email citext; v_pid uuid; v_mid uuid; v_role text; v_org_name text; v_new boolean := false;
begin
  if p_roles is null or cardinality(p_roles) = 0 then raise exception 'roles_required' using errcode = '22023'; end if;
  foreach v_role in array p_roles loop
    if not is_vocab_key('contact_role', v_role) then raise exception 'invalid_role' using errcode = '22023', detail = v_role; end if;
  end loop;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if is_suppressed(v_email::text) then raise exception 'suppressed' using errcode = 'P0001'; end if;
  select pe.person_id into v_pid from person_email pe join person p on p.id = pe.person_id where pe.email = v_email and p.deleted_at is null limit 1;
  if v_pid is null then
    insert into person (first_name, last_name, source_first, tier)
    values (nullif(btrim(coalesce(p_first_name, '')), ''), nullif(btrim(coalesce(p_last_name, '')), ''), coalesce(p_source, 'partner_portal'), 'lead') returning id into v_pid;
    insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
  end if;
  if 'primary_ops' = any(p_roles) and exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id <> v_pid and om.roles @> '{primary_ops}') then
    raise exception 'primary_exists' using errcode = 'P0001';
  end if;
  select id into v_mid from org_membership where org_id = p_org_id and person_id = v_pid;
  if v_mid is null then
    insert into org_membership (person_id, org_id, roles, contact_position, invited_at)
    values (v_pid, p_org_id, p_roles, nullif(btrim(coalesce(p_position, '')), ''), now()) returning id into v_mid;
    v_new := true;
  else
    update org_membership set roles = p_roles, contact_position = coalesce(nullif(btrim(coalesce(p_position, '')), ''), contact_position) where id = v_mid;
  end if;
  if not exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role = 'partner_contact' and ra.scope_type = 'org' and ra.scope_id = p_org_id
                   and (ra.valid_to is null or ra.valid_to > now())) then
    insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_to, granted_by, note)
    values (v_pid, 'partner_contact', 'org', p_org_id, p_edition_id, edition_valid_to(p_edition_id), p_actor, coalesce(p_source, 'partner_portal'));
  end if;
  if v_new then
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
    perform queue_mail('partner_contact_invite', v_pid, jsonb_build_object('org_name', v_org_name), 'org_membership', v_mid);
  end if;
  return v_pid;
end $$;
revoke execute on function partner_contact_upsert_internal(uuid, text, text, text, text[], text, uuid, uuid, text) from public, anon, authenticated;

create or replace function upsert_partner_contact(p_org_id uuid, p_email text, p_first_name text, p_last_name text, p_roles text[], p_position text default null, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_pid uuid; v_new boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  v_new := not exists (select 1 from org_membership om join person_email pe on pe.person_id = om.person_id
                       where om.org_id = p_org_id and pe.email = lower(btrim(coalesce(p_email, '')))::citext);
  v_pid := partner_contact_upsert_internal(p_org_id, p_email, p_first_name, p_last_name, p_roles, p_position, v_oe.edition_id, v_me, 'partner_portal');
  perform log_audit('partner.contact_upsert', 'organization', p_org_id::text, null, jsonb_build_object('person_id', v_pid, 'roles', to_jsonb(p_roles), 'new', v_new));
  return v_pid;
end $$;

-- 5) Interne Mails an das Partner-Team (area_lead_partner, Fallback globale Admins)
create or replace function notify_partner_leads(p_template_key text, p_vars jsonb, p_related_type text, p_related_id uuid) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_n integer := 0;
begin
  for r in select distinct ra.person_id from role_assignment ra
           where ra.role = 'area_lead_partner' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()) loop
    if queue_mail(p_template_key, r.person_id, p_vars, p_related_type, p_related_id) is not null then v_n := v_n + 1; end if;
  end loop;
  if v_n = 0 then
    for r in select distinct ra.person_id from role_assignment ra
             where ra.role = 'admin' and ra.scope_type = 'global' and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()) loop
      if queue_mail(p_template_key, r.person_id, p_vars, p_related_type, p_related_id) is not null then v_n := v_n + 1; end if;
    end loop;
  end if;
  return v_n;
end $$;
revoke execute on function notify_partner_leads(text, jsonb, text, uuid) from public, anon, authenticated;

-- 6) Integrations-RPCs: Routen (service_role) schreiben Webhook-Ereignisse, Sync-Läufe und Fehler; Team liest das Log
create or replace function record_webhook_event(p_source text, p_event_type text, p_external_id text, p_payload jsonb, p_headers jsonb default null, p_signature_valid boolean default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint; v_dup boolean := false;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into integration.webhook_event (source, event_type, external_id, signature_valid, payload, headers, received_at, status, attempts)
  values (p_source, p_event_type, nullif(p_external_id, ''), p_signature_valid, coalesce(p_payload, '{}'::jsonb), p_headers, now(), 'received', 0)
  on conflict (source, external_id) where external_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from integration.webhook_event where source = p_source and external_id = p_external_id;
    update integration.webhook_event set attempts = attempts + 1 where id = v_id;
    v_dup := true;
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', v_dup);
end $$;
revoke execute on function record_webhook_event(text, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function finish_webhook_event(p_id bigint, p_status text, p_error text default null, p_related_type text default null, p_related_id uuid default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update integration.webhook_event
     set status = p_status, error = p_error, processed_at = now(), attempts = attempts + 1,
         related_type = coalesce(p_related_type, related_type), related_id = coalesce(p_related_id, related_id)
   where id = p_id;
  if not found then raise exception 'webhook_event_not_found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function finish_webhook_event(bigint, text, text, text, uuid) from public, anon, authenticated;

create or replace function start_sync_job(p_system text, p_direction text, p_job_type text, p_triggered_by text default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into integration.sync_job (system, direction, job_type, started_at, status, stats, triggered_by)
  values (p_system, p_direction, p_job_type, now(), 'running', '{}'::jsonb, p_triggered_by) returning id into v_id;
  return v_id;
end $$;
revoke execute on function start_sync_job(text, text, text, text) from public, anon, authenticated;

create or replace function finish_sync_job(p_id bigint, p_status text, p_stats jsonb default '{}'::jsonb, p_error text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update integration.sync_job set finished_at = now(), status = p_status, stats = coalesce(p_stats, '{}'::jsonb), error = p_error where id = p_id;
  if not found then raise exception 'sync_job_not_found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function finish_sync_job(bigint, text, jsonb, text) from public, anon, authenticated;

create or replace function record_sync_error(p_job_id bigint, p_object_type text, p_object_id text, p_message text, p_payload jsonb default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into integration.sync_error (job_id, object_type, object_id, message, payload) values (p_job_id, p_object_type, p_object_id, p_message, p_payload) returning id into v_id;
  return v_id;
end $$;
revoke execute on function record_sync_error(bigint, text, text, text, jsonb) from public, anon, authenticated;

create or replace function hubspot_deals_ingested(p_deal_ids text[]) returns text[]
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select array_agg(oe.hubspot_deal_id) from org_edition oe where oe.hubspot_deal_id = any(p_deal_ids)), '{}'::text[]);
end $$;

create or replace function partner_ingest_log(p_limit integer default 100)
returns table (kind text, id bigint, external_id text, status text, message text, happened_at timestamptz, payload jsonb, resolved boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select * from (
      select 'sync_error'::text, se.id, se.object_id, case when se.resolved_at is null then 'open' else 'resolved' end, se.message, se.created_at, se.payload, se.resolved_at is not null
      from integration.sync_error se where se.object_type = 'hubspot_deal'
      union all
      select 'webhook'::text, we.id, we.external_id, we.status, we.error, we.received_at,
             jsonb_build_object('event_type', we.event_type, 'related_type', we.related_type, 'related_id', we.related_id, 'signature_valid', we.signature_valid, 'attempts', we.attempts),
             we.status in ('processed', 'duplicate', 'ignored')
      from integration.webhook_event we where we.source = 'hubspot'
    ) x
    order by 6 desc limit greatest(coalesce(p_limit, 100), 1);
end $$;

create or replace function resolve_sync_error(p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update integration.sync_error set resolved_at = now() where id = p_id and resolved_at is null;
  if not found then raise exception 'sync_error_not_found' using errcode = 'P0002'; end if;
  perform log_audit('integration.resolve_error', 'sync_error', p_id::text, null, null);
end $$;

-- 7) Ingest: Gate, dann alles in einer Transaktion. Payload (von der Route normalisiert):
-- {deal{id,name,pipeline,stage,url,owner_email,owner_name}, company{id,legal_name,communication_name,street,zip,city,country,website,description,type,
--  partner_category,invoice_email,invoice_name,vat_id,po_number,sponsoring_level}, contacts[{id,email,first_name,last_name,position,roles[]}],
--  line_items[{id,sku,name,qty,unit_price_cents}], job_id?}. Kontaktrolle „accounting" ist kein Login: nur Rechnungs-E-Mail (Entscheidung 1).
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

  select oe.id, oe.org_id into v_oe_id, v_org_id from org_edition oe where oe.hubspot_deal_id = v_deal_id;
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
    hubspot_deal_id = excluded.hubspot_deal_id, invited_at = coalesce(org_edition.invited_at, excluded.invited_at),
    onboarding_status = case when org_edition.onboarding_status = 'none' then 'invited' else org_edition.onboarding_status end,
    description_de = coalesce(org_edition.description_de, excluded.description_de), invoice_email = coalesce(org_edition.invoice_email, excluded.invoice_email),
    invoice_name = coalesce(org_edition.invoice_name, excluded.invoice_name), vat_id = coalesce(org_edition.vat_id, excluded.vat_id),
    po_number = coalesce(org_edition.po_number, excluded.po_number), sponsoring_level = coalesce(org_edition.sponsoring_level, excluded.sponsoring_level)
  returning id into v_oe_id;

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

-- 8) Mail an den Deal-Owner (Fallback Partner-Team)
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('partner_gate_failed', 'de', 1, 'HubSpot-Deal nicht übernommen: {{company_name}}',
   E'Hallo {{first_name}},\n\nder Deal **{{deal_name}}** ({{company_name}}) konnte nicht ins Partnerportal übernommen werden; die Phase wurde zurückgesetzt. Es fehlt:\n\n{{errors}}\n\nBitte in HubSpot ergänzen und den Deal erneut in „Onboarding Automation" schieben: [Deal öffnen]({{deal_url}})\n\nViele Grüße\nChefTreff-Plattform',
   'Gate-Fehler beim HubSpot-Ingest an den Deal-Owner (Fallback area_lead_partner)', true),
  ('partner_gate_failed', 'en', 1, 'HubSpot deal not imported: {{company_name}}',
   E'Hi {{first_name}},\n\nthe deal **{{deal_name}}** ({{company_name}}) could not be imported into the partner portal; its stage was reset. Missing:\n\n{{errors}}\n\nPlease complete the data in HubSpot and move the deal into “Onboarding Automation” again: [Open deal]({{deal_url}})\n\nBest,\nChefTreff platform',
   'Gate failure of the HubSpot ingest, sent to the deal owner (fallback area_lead_partner)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- 9) set_expense_integration nur für freigegebene oder ausgezahlte Anträge (Nachtrag aus dem B8-Review)
create or replace function set_expense_integration(p_claim_id uuid, p_invoice_asset_id uuid default null, p_sevdesk_ref text default null, p_qonto_sent boolean default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  if auth.uid() is not null and not is_expense_approver() then raise exception 'not allowed' using errcode = '42501'; end if;
  select status into v_status from expense_claim where id = p_claim_id;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_status not in ('approved', 'paid') then raise exception 'not_approved' using errcode = 'P0001', detail = v_status; end if;
  update expense_claim set
    invoice_asset_id = coalesce(p_invoice_asset_id, invoice_asset_id),
    sevdesk_ref      = coalesce(nullif(btrim(p_sevdesk_ref), ''), sevdesk_ref),
    sevdesk_sent_at  = case when nullif(btrim(p_sevdesk_ref), '') is not null then now() else sevdesk_sent_at end,
    qonto_sent_at    = case when coalesce(p_qonto_sent, false) then now() else qonto_sent_at end
  where id = p_claim_id;
  insert into audit_log (actor_person_id, actor_auth_uid, action, object_type, object_id, after)
  values (current_person_id(), auth.uid(), 'expense.integration', 'expense_claim', p_claim_id::text,
          jsonb_build_object('invoice_asset_id', p_invoice_asset_id, 'sevdesk_ref', p_sevdesk_ref, 'qonto_sent', p_qonto_sent));
end $$;

select harden_definer_functions();
