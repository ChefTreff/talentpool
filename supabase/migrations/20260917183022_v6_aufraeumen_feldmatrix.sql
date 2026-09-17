-- =============================================================================
-- 0110 · Welle 6 · Aufräumen aus der Feld-Matrix (Konrads Vorentscheidungen, 17.09.2026)
--
-- Vier Entscheidungen aus `docs/feld-matrix-2026-09.md` (Befunde c/d), getroffen von
-- Konrad am 17.09.2026, umgesetzt von der Architektur-Session (Arbeitsauftrag Welle 6, A8):
--
-- 1. **Partner-Beschreibung je Organisation, zweisprachig.** Bisher schrieb
--    `update_partner_onboarding` denselben Text in `organization.description` **und**
--    `org_edition.description_de` — zwei Wahrheiten für ein Feld, und die
--    Editionsfassung fing jedes Jahr leer an. Ab hier: `organization.description_de/en`,
--    Partner aktualisieren jährlich, starten aber nie mit leerem Feld. Bestand: die
--    jüngste Editionsfassung gewinnt, sonst der alte Org-Text. `org_edition.description_*`
--    und `organization.description` entfallen; Leser und Schreiber (Onboarding, Recheck,
--    Übersicht, Event-App-Aussteller, HubSpot-Ingest) zeigen auf die Organisation. Die
--    JSON-Schlüssel der Übersicht bleiben, damit die Oberfläche nichts umschreiben muss.
-- 2. **Profilfotos nur als Datei mit Rechten.** `person.photo_url` (offene URL) hatte
--    keinen Schreibweg mehr und stand nur noch in drei Funktionen; Speaker-Porträts
--    laufen über `speaker_profile.photo_asset_id`. Die Spalte entfällt.
-- 3. **`staff_user` entfällt.** Seit 0107 entscheidet die Rolle `admin`; Tabelle,
--    Diagnosefunktion und `scripts/make-staff.mjs` zeigen auf nichts mehr.
-- 4. **Jobtitel/Organisation als Snapshot.** `person` führt den aktuellen Stand,
--    `speaker_profile` den Stand der Edition. Beim Anlegen eines Profils ohne
--    `organization_name` wird `person.employer_name` übernommen (Trigger) — danach
--    laufen die Felder bewusst getrennt.
--
-- Fehlerschlüssel: keine neuen. Rückgabetypen: unverändert (nur `create or replace`).
-- Test: supabase/tests/v6_aufraeumen.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Beschreibung

alter table organization
  add column if not exists description_de text,
  add column if not exists description_en text;

update organization o set
  description_de = coalesce(
    (select oe.description_de from org_edition oe join event e on e.id = oe.edition_id
      where oe.org_id = o.id and nullif(btrim(oe.description_de), '') is not null
      order by e.start_date desc nulls last, oe.created_at desc limit 1),
    nullif(btrim(o.description), '')),
  description_en =
    (select oe.description_en from org_edition oe join event e on e.id = oe.edition_id
      where oe.org_id = o.id and nullif(btrim(oe.description_en), '') is not null
      order by e.start_date desc nulls last, oe.created_at desc limit 1);

comment on column organization.description_de is
  'Beschreibung des Partners (DE), gilt über Editionen hinweg; Partner aktualisieren sie jährlich, starten aber nie leer (Konrad 17.09.2026). Ersetzt organization.description und org_edition.description_de (0110).';
comment on column organization.description_en is
  'Beschreibung des Partners (EN), gilt über Editionen hinweg; Gegenstück zu description_de (0110).';

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
    description_de     = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
    description_en     = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end
  where id = p_org_id;
  update org_edition set
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

create or replace function partner_onboarding_recheck(p_org_edition_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_o organization%rowtype;
begin
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then return null; end if;
  select * into v_o from organization where id = v_oe.org_id;
  if v_oe.onboarding_status in ('none', 'invited')
     and coalesce(v_o.legal_name, '') <> '' and coalesce(v_o.communication_name, '') <> '' and coalesce(v_o.address_street, '') <> ''
     and coalesce(v_o.address_zip, '') <> '' and coalesce(v_o.address_city, '') <> '' and v_oe.invoice_email is not null and coalesce(v_o.description_de, '') <> ''
     and exists (select 1 from partner_asset a where a.org_edition_id = v_oe.id and a.kind = 'logo_vector' and a.is_current)
     and exists (select 1 from partner_asset a where a.org_edition_id = v_oe.id and a.kind = 'logo_png' and a.is_current) then
    update org_edition set onboarding_status = 'filled', onboarding_filled_at = now() where id = v_oe.id;
    return 'filled';
  end if;
  return v_oe.onboarding_status;
end $$;

-- Die Schlüssel `edition.description_de/en` bleiben — die Oberfläche („Eure Daten") liest
-- sie dort; gefüllt werden sie ab jetzt aus der Organisation.
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
                              'website', v_o.website, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
                              'logo_dark', v_o.logo_dark, 'logo_light', v_o.logo_light,
                              'address', jsonb_build_object('street', v_o.address_street, 'zip', v_o.address_zip, 'city', v_o.address_city, 'country', v_o.address_country),
                              'partner_category', v_o.partner_category),
    'roles', to_jsonb(v_roles),
    'team', is_partner_team(),
    'edition', case when v_oe.id is null then null else jsonb_build_object(
        'id', v_oe.id, 'edition_id', v_oe.edition_id, 'onboarding_status', v_oe.onboarding_status, 'invited_at', v_oe.invited_at,
        'onboarding_filled_at', v_oe.onboarding_filled_at, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
        'invoice_email', case when v_full then v_oe.invoice_email::text end, 'invoice_name', case when v_full then v_oe.invoice_name end,
        'vat_id', case when v_full then v_oe.vat_id end, 'po_number', case when v_full then v_oe.po_number end,
        'pass_type_choice', v_oe.pass_type_choice, 'sponsoring_level', v_oe.sponsoring_level) end,
    'contacts_count', (select count(*) from org_membership om where om.org_id = p_org_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('sku', op.product_sku, 'name_de', pr.name_de, 'name_en', pr.name_en, 'category', pr.category,
                                                                'type', pr.type, 'qty', op.qty, 'unit_price_cents', case when v_full then op.unit_price_cents end,
                                                                'status', op.status) order by pr.type, pr.name_de)
                          from org_product op join product pr on pr.sku = op.product_sku where op.org_edition_id = v_oe.id), '[]'::jsonb),
    'ticket_allocations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'pass_type', a.pass_type, 'quantity', a.quantity, 'status', a.status,
                                                                          'coupon_code', case when a.status = 'active' then a.coupon_code end,
                                                                          'undershop_url', case when a.status = 'active' then a.undershop_url end,
                                                                          'used_count', a.used_count) order by a.pass_type)
                                    from org_ticket_allocation a where a.org_id = p_org_id and a.event_id = v_oe.edition_id and a.status <> 'disabled'), '[]'::jsonb),
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
                  from deliverable d where d.org_edition_id = v_oe.id),
    'sessions_count', (select count(*) from session se join event ev on ev.id = se.event_id
                       where se.host_org_id = p_org_id and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id) and se.publish_status <> 'cancelled'),
    'has_stage', exists (select 1 from stage st join event ev on ev.id = st.event_id
                         where st.partner_org_id = p_org_id and st.active and (ev.id = v_oe.edition_id or ev.edition_id = v_oe.edition_id))
  );
end $$;

create or replace function event_app_exhibitors(p_edition_id uuid default null)
returns table (org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text,
               description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer,
               partner_category text, org_type text, booth_number text, onboarding_status text, logo_svg_path text, logo_png_path text,
               logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.id, o.id, e.id, e.slug, e.swapcard_event_id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.slug,
           o.description_de, o.description_en, o.website, oe.sponsoring_level,
           sponsoring_level_key(oe.sponsoring_level),
           (select v.sort_order from vocab_term v
             where v.vocabulary = 'sponsoring_level' and v.active and v.key = sponsoring_level_key(oe.sponsoring_level)),
           o.partner_category, o.type,
           (select b.booth_number from booth b where b.org_edition_id = oe.id order by b.created_at limit 1),
           oe.onboarding_status,
           (select a.storage_path from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_vector' and d.status = 'accepted' order by a.version desc limit 1),
           (select a.storage_path from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_png' and d.status = 'accepted' order by a.version desc limit 1),
           (select a.id from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_png' and d.status = 'accepted' order by a.version desc limit 1),
           (select r.external_id from external_ref r where r.system = 'swapcard' and r.object_type = 'exhibitor' and r.object_id = oe.id),
           coalesce((select jsonb_agg(jsonb_build_object('person_id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
                                                         'email', pe.email::text, 'position', m.contact_position)
                                      order by p.last_name, p.first_name)
                     from org_membership m
                     join person p on p.id = m.person_id and p.deleted_at is null
                     left join person_email pe on pe.person_id = p.id and pe.is_primary
                     where m.org_id = o.id and m.roles @> '{event_app_member}'), '[]'::jsonb)
    from org_edition oe
    join organization o on o.id = oe.org_id
    join event e on e.id = oe.edition_id
    where o.active
      and (p_edition_id is null or oe.edition_id = p_edition_id)
      and (p_edition_id is not null or e.swapcard_event_id is not null)
    order by e.slug, coalesce(o.communication_name, o.legal_name);
end $$;

-- HubSpot-Ingest: die Firmenbeschreibung landet an der Organisation (DE), nicht mehr an der Edition.
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
    insert into organization (legal_name, communication_name, type, address_street, address_zip, address_city, address_country, website, description_de, hubspot_id, partner_category, active)
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
      description_de = coalesce(description_de, nullif(btrim(coalesce(v_co->>'description', '')), '')), partner_category = coalesce(partner_category, nullif(v_co->>'partner_category', '')), active = true
    where id = v_org_id;
  end if;

  v_valid_to := edition_valid_to(v_ed.id);
  insert into org_edition (org_id, edition_id, onboarding_status, invited_at, invoice_email, invoice_name, vat_id, po_number, sponsoring_level, hubspot_deal_id)
  values (v_org_id, v_ed.id, 'invited', now(), v_invoice::citext, nullif(btrim(coalesce(v_co->>'invoice_name', '')), ''),
          nullif(btrim(coalesce(v_co->>'vat_id', '')), ''), nullif(btrim(coalesce(v_co->>'po_number', '')), ''), nullif(btrim(coalesce(v_co->>'sponsoring_level', '')), ''), v_deal_id)
  on conflict (org_id, edition_id) do update set
    hubspot_deal_id = coalesce(org_edition.hubspot_deal_id, excluded.hubspot_deal_id), invited_at = coalesce(org_edition.invited_at, excluded.invited_at),
    onboarding_status = case when org_edition.onboarding_status = 'none' then 'invited' else org_edition.onboarding_status end,
    invoice_email = coalesce(org_edition.invoice_email, excluded.invoice_email),
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

alter table org_edition drop column if exists description_de, drop column if exists description_en;
alter table organization drop column if exists description;

-- ---------------------------------------------------------------- 2 · Fotos

create or replace function my_speaker_profile(p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_p person%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile sp
   where (sp.person_id = v_me or sp.assistant_person_id = v_me)
     and (p_edition_id is null or sp.edition_id = p_edition_id)
   order by (sp.person_id = v_me) desc, sp.created_at desc
   limit 1;
  if not found then return null; end if;
  select * into v_p from person where id = v_sp.person_id;
  return jsonb_build_object(
    'id', v_sp.id, 'edition_id', v_sp.edition_id, 'is_assistant', (v_sp.person_id <> v_me),
    'edition_name', (select e.name from event e where e.id = v_sp.edition_id),
    'speaker_type', v_sp.speaker_type, 'pipeline_status', v_sp.pipeline_status,
    'job_title', v_sp.job_title, 'organization_name', v_sp.organization_name,
    'bio_short_en', v_sp.bio_short_en, 'bio_short_de', v_sp.bio_short_de,
    'bio_long_en', v_sp.bio_long_en, 'bio_long_de', v_sp.bio_long_de,
    'socials', v_sp.socials, 'tech_rider', v_sp.tech_rider,
    'reception_eligible', v_sp.reception_eligible, 'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type, 'hotel_tier', v_sp.hotel_tier, 'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered, 'travel_costs_approved', (v_sp.travel_costs_approved_at is not null),
    'invited_at', v_sp.invited_at,
    'assistant', case when v_sp.assistant_person_id is null then null else (
       select jsonb_build_object('person_id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'email', (select pe.email::text from person_email pe where pe.person_id = a.id and pe.is_primary))
       from person a where a.id = v_sp.assistant_person_id) end,
    'person', jsonb_build_object(
       'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
       'pronouns', v_p.pronouns, 'linkedin_url', v_p.linkedin_url,
       'preferred_language', v_p.preferred_language, 'phone_e164', v_p.phone_e164,
       'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary)),
    'photo_asset_id', v_sp.photo_asset_id,
    'consents', (select coalesce(jsonb_object_agg(c.consent_type, c.granted), '{}'::jsonb) from consent_current c
                 where c.person_id = v_p.id and c.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')),
    'next_steps', speaker_next_steps(v_sp.id)
  );
end $$;

create or replace function speaker_next_steps(p_profile_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_sp speaker_profile%rowtype; v_p person%rowtype; v_me uuid := current_person_id();
  v_profile boolean; v_photo boolean; v_consents boolean; v_session boolean; v_ticket boolean; v_content boolean; v_presentation boolean; v_open text[] := '{}';
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_p from person where id = v_sp.person_id;
  v_profile  := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '' and coalesce(nullif(btrim(v_sp.bio_short_en), ''), '') <> '';
  v_photo    := v_sp.photo_asset_id is not null;
  v_consents := coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'speaker_release'), false)
                and coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'photo_video'), false);
  v_session  := exists (select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                        where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id));
  v_content  := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and not exists (select 1 from session_submission s where s.session_id = se.id and s.status = 'approved')
                    and coalesce(se.description_de, se.description_en) is null);
  v_presentation := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and se.format not in ('panel', 'networking', 'reception', 'side_event', 'break', 'company_tour')
                    and not exists (select 1 from speaker_asset a where a.profile_id = v_sp.id and a.session_id = se.id and a.kind = 'presentation' and a.is_current));
  v_ticket   := exists (select 1 from ticket t join event e on e.id = t.event_id
                        where t.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id) and t.status in ('valid', 'requested'));
  if not v_profile      then v_open := array_append(v_open, 'profile'); end if;
  if not v_photo        then v_open := array_append(v_open, 'photo'); end if;
  if not v_consents     then v_open := array_append(v_open, 'consents'); end if;
  if not v_session      then v_open := array_append(v_open, 'session'); end if;
  if v_session and not v_content      then v_open := array_append(v_open, 'session_content'); end if;
  if v_session and not v_presentation then v_open := array_append(v_open, 'presentation'); end if;
  if not v_ticket       then v_open := array_append(v_open, 'ticket'); end if;
  return jsonb_build_object(
    'profile', v_profile, 'photo', v_photo, 'consents', v_consents, 'session', v_session,
    'session_content', case when v_session then v_content end,
    'presentation', case when v_session then v_presentation end,
    'ticket', v_ticket, 'hospitality', v_sp.hospitality_status,
    'open', to_jsonb(v_open)
  );
end $$;

create or replace function delete_my_profile() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := current_person_id();
begin
  if v_pid is null then
    raise exception 'no person for current user' using errcode = '28000';
  end if;
  perform log_audit('profile.delete', 'person', v_pid::text, null, null);
  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = v_pid
  on conflict (email_hash) do nothing;
  delete from person_interest            where person_id = v_pid;
  delete from person_acquisition_channel where person_id = v_pid;
  delete from role_assignment            where person_id = v_pid;
  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null, cv_url = null,
    employer_name = null, university = null, title = null, city = null, pronouns = null,
    nationality = null, invite_code = null, auth_user_id = null, deleted_at = now()
  where id = v_pid;
  delete from person_email where person_id = v_pid and not is_primary;
  update person_email
     set email = ('deleted+' || v_pid::text || '@anonym.invalid')::citext, verified = false
   where person_id = v_pid and is_primary;
end $$;

alter table person drop column if exists photo_url;

-- ---------------------------------------------------------------- 3 · staff_user

drop function if exists staff_users_without_admin();
drop table if exists staff_user;
comment on function is_staff() is
  'Team im Sinne des Admin-Bereichs = aktive Rolle admin (seit 0107). Die Tabelle staff_user ist mit 0110 entfernt.';

-- ---------------------------------------------------------------- 4 · Snapshot

/**
 * Beim Anlegen eines Speaker-Profils ohne Organisation den aktuellen Arbeitgeber der
 * Person übernehmen. Danach laufen die Felder getrennt: `person` ist der aktuelle
 * Stand, `speaker_profile` der Stand der Edition (Konrad, 17.09.2026).
 */
create or replace function trg_speaker_profile_prefill() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.organization_name is null then
    select nullif(btrim(p.employer_name), '') into new.organization_name from person p where p.id = new.person_id;
  end if;
  return new;
end $$;
revoke execute on function trg_speaker_profile_prefill() from public, anon, authenticated;

drop trigger if exists trg_speaker_profile_prefill on speaker_profile;
create trigger trg_speaker_profile_prefill before insert on speaker_profile
  for each row execute function trg_speaker_profile_prefill();

select harden_definer_functions();
