-- 0138 · Branche des Ausstellers (Vokabular `industry`, Swapcard `Exhibitor.type`)
-- Angewendet von der Architektur-Session am 21.09.2026 als 20260921120434.
--
-- Zweck: Swapcard führt an jedem Aussteller eine **Branche** — dort heisst das
-- Feld `type` und wird im Event über das Auswahlfeld „Branche" angeboten. Das
-- Portal kannte dafür bisher keine Angabe; EA1 hat die falsche Zuordnung
-- „type = Sponsoring-Level" entfernt. Konrad, 21.09.2026: „bitte baue das" —
-- die Branche wird künftig im Portal gepflegt und von dort übertragen.
-- Anlass: Arbeitsauftrag Welle 6, Arbeitspaket EA, offene Frage 1 aus PR #95.
--
-- **Warum an `organization` und nicht an `org_edition`:** Die Branche ist eine
-- Eigenschaft des Unternehmens, keine der Teilnahme — sie ändert sich nicht von
-- Edition zu Edition, so wenig wie `organization.type` oder `partner_category`
-- (die beide dort stehen). An `org_edition` müsste sie bei jeder neuen Teilnahme
-- erneut erfasst werden, und zwei Editionen desselben Partners könnten sich
-- widersprechen. Wo eine Organisation sich ausnahmsweise umorientiert, wird das
-- Feld geändert; eine Historie braucht niemand.
--
-- Die vierzehn Schlüssel sind **nicht erfunden**, sondern die Optionswerte des
-- Swapcard-Feldes, am 21.09.2026 aus dem Bestand der 191 Aussteller gelesen
-- (`typeLabel.value` → `type`). Damit ist die Übertragung eine Gleichsetzung und
-- keine Übersetzungstabelle: `label_en` ist wörtlich die Beschriftung, die
-- Swapcard anzeigt, `label_de` unsere Übersetzung für das Portal.
-- Abweichungen: keine.

set search_path = public, extensions;

-- 1 · Vokabular ----------------------------------------------------------------

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('industry', 'tech-and-it',               'Tech, Daten & IT',                    'Tech, Data & IT',                 10, true),
  ('industry', 'consulting',                'Beratung, Wirtschaftsprüfung & Recht','Consulting, Audit & Legal',       20, true),
  ('industry', 'banking-and-finance',       'Banken, Finanzen & Versicherung',     'Banking, Finance & Assurance',    30, true),
  ('industry', 'industrie',                 'Industrie',                           'Industrie',                       40, true),
  ('industry', 'logistics',                 'Logistik',                            'Logistics',                       50, true),
  ('industry', 'fmcg',                      'Konsumgüter',                         'Consumer Goods',                  60, true),
  ('industry', 'e-commerce',                'E-Commerce',                          'E-Commerce',                      70, true),
  ('industry', 'marketing-and-advertising', 'Medien, Marketing & Werbung',         'Media, Marketing & Advertising',  80, true),
  ('industry', 'b2b-services',              'Unternehmensdienstleistungen',        'Business Services',               90, true),
  ('industry', 'energy-and-sustainability', 'Energie & Nachhaltigkeit',            'Energy & Sustainability',        100, true),
  ('industry', 'health',                    'Gesundheit',                          'Health',                         110, true),
  ('industry', 'deep-tech-and-science',     'Deep Tech & Wissenschaft',            'Deep Tech & Science',            120, true),
  ('industry', 'education',                 'Bildung & Non-Profit',                'Education & NGO',                130, true),
  ('industry', 'accelerator',               'Accelerator & Startup-Services',      'Accelerator & Startup Services', 140, true)
on conflict (vocabulary, key) do nothing;

-- 2 · Spalte --------------------------------------------------------------------

alter table organization add column if not exists industry text;
comment on column organization.industry is
  'Vokabular industry (0138): Branche des Unternehmens. Entspricht dem Swapcard-Feld „Branche" (`Exhibitor.type`); die Schluessel sind dessen Optionswerte. NULL = nicht angegeben, dann sendet der Ausstellerlauf kein `type` und Swapcard behaelt, was dort steht.';

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note)
values ('industry', 'organization', 'industry', false, null, 'organization.industry (0138)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- 3 · Partner pflegen sie selbst -------------------------------------------------
-- Basis: supabase/snapshot/functions/update_partner_onboarding.sql. Neu sind die
-- Pruefung und eine Zeile im `update organization`. `partner_can_edit` schliesst
-- das Team ein, das Feld ist also auch von innen korrigierbar.

create or replace function update_partner_onboarding(p_org_id uuid, p_data jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
  -- Neu (0138): Branche. Leerer Text heisst „nicht angegeben" — sonst liesse
  -- sich eine falsche Angabe ueber die Oberflaeche nie wieder entfernen.
  if p_data ? 'industry' and nullif(btrim(p_data->>'industry'), '') is not null
     and not is_vocab_key('industry', btrim(p_data->>'industry')) then
    raise exception 'invalid_industry' using errcode = '22023', detail = coalesce(p_data->>'industry', 'null');
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
    description_en     = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
    industry           = case when p_data ? 'industry' then nullif(btrim(p_data->>'industry'), '') else industry end
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

-- 4 · Ausstellerliste gibt die Branche mit ----------------------------------------
-- Basis: supabase/snapshot/functions/event_app_exhibitors.sql (Stand nach 0135).
-- Neu ist eine Ausgabespalte hinter `categories`; der Rest ist unveraendert.
-- Rueckgabetyp aendert sich ⇒ droppen.

drop function if exists event_app_exhibitors(uuid);
create or replace function event_app_exhibitors(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text, description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer, level_key text, level_rank integer, level_source text, categories text[], industry text, partner_category text, org_type text, booth_number text, onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.id, o.id, e.id, e.slug, e.swapcard_event_id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.slug,
           o.description_de, o.description_en, o.website, oe.sponsoring_level,
           sponsoring_level_key(oe.sponsoring_level),
           (select v.sort_order from vocab_term v
             where v.vocabulary = 'sponsoring_level' and v.active and v.key = sponsoring_level_key(oe.sponsoring_level)),
           -- Abgeleitetes Level (0135): gebuchtes Produkt schlägt Freitext. Ohne
           -- gebuchtes Produkt fällt die Ableitung auf den HubSpot-Freitext zurück,
           -- damit ein Partner, dessen Positionen noch nicht im Portal stehen, nicht
           -- ohne Level dasteht.
           coalesce(abl.level_key, sponsoring_level_key(oe.sponsoring_level)),
           coalesce(abl.level_rank, (select v.sort_order from vocab_term v
                                      where v.vocabulary = 'sponsoring_level' and v.active
                                        and v.key = sponsoring_level_key(oe.sponsoring_level))),
           case when abl.level_key is not null then 'product'
                when sponsoring_level_key(oe.sponsoring_level) is not null then 'hubspot' end,
           abl.categories,
           -- Branche (0138): nur, wenn sie im Vokabular steht. Ein Schlüssel, den
           -- jemand nachträglich deaktiviert hat, geht nicht mehr hinaus — Swapcard
           -- behält dann, was dort steht, statt eine tote Auswahl zu bekommen.
           (select v.key from vocab_term v
             where v.vocabulary = 'industry' and v.active and v.key = o.industry),
           o.partner_category, o.type,
           (select b.booth_number from booth_assignment ba join booth b on b.id = ba.booth_id
             where ba.org_edition_id = oe.id order by ba.event_day_id nulls first, b.created_at limit 1),
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
    left join lateral (
      select
        (select v.key from org_product op
           join product pr on pr.sku = op.product_sku
           join vocab_term v on v.vocabulary = 'sponsoring_level' and v.active and v.key = pr.sponsoring_level_key
          where op.org_edition_id = oe.id and op.status = 'booked'
          order by v.sort_order nulls last, v.key
          limit 1) as level_key,
        (select v.sort_order from org_product op
           join product pr on pr.sku = op.product_sku
           join vocab_term v on v.vocabulary = 'sponsoring_level' and v.active and v.key = pr.sponsoring_level_key
          where op.org_edition_id = oe.id and op.status = 'booked'
          order by v.sort_order nulls last, v.key
          limit 1) as level_rank,
        -- Kategorien des Ausstellers: die Produktkategorien seiner gebuchten
        -- Pakete, in Vokabular-Reihenfolge. Zusatzleistungen und Shop-Artikel
        -- zählen nicht — ein Barhocker macht niemanden zum Hackathon-Partner.
        (select coalesce(array_agg(c.category order by c.sort_order nulls last, c.category), '{}'::text[])
           from (select distinct pr.category,
                        (select v.sort_order from vocab_term v
                          where v.vocabulary = 'product_category' and v.active and v.key = pr.category) as sort_order
                   from org_product op
                   join product pr on pr.sku = op.product_sku
                  where op.org_edition_id = oe.id and op.status = 'booked'
                    and pr.type = 'package' and pr.category is not null) c) as categories
    ) abl on true
    where o.active
      and (p_edition_id is null or oe.edition_id = p_edition_id)
      and (p_edition_id is not null or e.swapcard_event_id is not null)
    order by e.slug, coalesce(o.communication_name, o.legal_name);
end $$;

-- 5 · Der Partner sieht seine Branche in den Stammdaten --------------------------
-- Basis: supabase/snapshot/functions/partner_overview.sql. Geaendert ist genau
-- ein Feld im `org`-Objekt; ohne das stuende die Branche zwar in der Datenbank,
-- die Maske bekaeme sie aber nie zu sehen.

create or replace function partner_overview(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
                              'partner_category', v_o.partner_category, 'industry', v_o.industry),
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
                                                                'status', op.status, 'format_key', pr.format_key) order by pr.type, pr.name_de)
                          from org_product op join product pr on pr.sku = op.product_sku where op.org_edition_id = v_oe.id), '[]'::jsonb),
    'ticket_allocations', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'pass_type', a.pass_type, 'quantity', a.quantity, 'status', a.status,
                                                                          'coupon_code', case when a.status = 'active' then a.coupon_code end,
                                                                          'undershop_url', case when a.status = 'active' then a.undershop_url end,
                                                                          'used_count', a.used_count) order by a.pass_type)
                                    from org_ticket_allocation a where a.org_id = p_org_id and a.event_id = v_oe.edition_id and a.status <> 'disabled'), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'due_at', d.due_at, 'label_de', d.label_de, 'label_en', d.label_en,
                                                                 'description_de', d.description_de, 'description_en', d.description_en) order by d.due_at)
                           from deadline d where d.edition_id = v_oe.edition_id and d.audience in ('partner', 'all')), '[]'::jsonb),
    'booth', (select to_jsonb(b) - 'id' - 'notes' from booth_assignment ba join booth b on b.id = ba.booth_id
               where ba.org_edition_id = v_oe.id order by ba.event_day_id nulls first, b.created_at limit 1),
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

select harden_definer_functions();
