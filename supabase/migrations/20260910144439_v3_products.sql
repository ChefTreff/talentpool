-- 0038 · Welle 3 A1: Produktstamm (product, product_component, deliverable_template), Vokabular product_category, Fristen FLS27 (Entscheidung 2).
-- Quelle: Item-Liste 2026 (docs/referenz/item-liste-2026.csv) + Stücklisten (docs/referenz/product-bundles-2026.csv); Import über scripts/import-products.mjs.
-- Danach ist das Portal Quelle der Wahrheit; HubSpot-Line-Items und SevDesk-Artikel werden per SKU abgeglichen (Entscheidung 4). USt vorerst 7 % (Entscheidung 3).
set search_path = public, extensions;

-- 1) Vokabular
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order)
select v.vocabulary, v.key, v.label_de, v.label_en, v.sort_order from (values
  ('product_category', 'standflaeche', 'Standfläche', 'Booth space', 1),
  ('product_category', 'standbau', 'Standbau', 'Booth construction', 2),
  ('product_category', 'mobiliar', 'Mobiliar', 'Furniture', 3),
  ('product_category', 'standgastronomie', 'Standgastronomie', 'Booth catering', 4),
  ('product_category', 'technik', 'Technik', 'Technology', 5),
  ('product_category', 'branding', 'Branding', 'Branding', 6),
  ('product_category', 'specials', 'Specials', 'Specials', 7),
  ('product_category', 'personal', 'Personal', 'Staff', 8),
  ('product_category', 'pflanzen', 'Pflanzen', 'Plants', 9),
  ('product_category', 'stage_products', 'Bühnenformate', 'Stage products', 10),
  ('product_category', 'tickets', 'Tickets', 'Tickets', 11),
  ('product_category', 'hackathon', 'Hackathon', 'Hackathon', 12),
  ('product_category', 'company_tours', 'Company Tours', 'Company tours', 13),
  ('product_category', 'essentials', 'Essentials', 'Essentials', 14),
  ('product_category', 'infrastruktur', 'Infrastruktur (Versorgung & Anschlüsse)', 'Infrastructure (utilities)', 15),
  ('product_category', 'nebenkosten', 'Nebenkosten', 'Ancillary costs', 16),
  ('product_category', 'merch', 'Merch', 'Merch', 17),
  ('product_category', 'partnerschaft', 'Partnerschaft', 'Partnership', 18)
) as v(vocabulary, key, label_de, label_en, sort_order)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- 2) Produktstamm
create table if not exists product (
  sku                  text primary key check (sku ~ '^I-[0-9]{5}$'),
  name_de              text not null,
  name_en              text,
  description_de       text,
  description_en       text,
  type                 text not null check (type in ('package', 'addon', 'shop_item')),
  category             text not null,                                  -- vocab product_category
  unit                 text not null default 'piece' check (unit in ('piece', 'sqm', 'm', 'package', 'hour', 'person', 'day')),
  net_price_cents      integer check (net_price_cents is null or net_price_cents >= 0),   -- Listenpreis netto; null = individuell/aus dem Line-Item
  purchase_price_cents integer check (purchase_price_cents is null or purchase_price_cents >= 0),
  margin               numeric(6, 4),
  vat_rate             numeric(4, 2) not null default 7 check (vat_rate in (0, 7, 19)),
  supplier             text,
  supplier_sku         text,
  supplier_url         text,
  stock_total          integer check (stock_total is null or stock_total >= 0),
  track_stock          boolean not null default false,
  available_until      timestamptz,
  shop_visible         boolean not null default false,
  shop_sort            integer,
  late_orderable       boolean not null default false,                 -- bestellbar in der Nachbestellphase 3
  shop_hint_de         text,
  shop_hint_en         text,
  purchase_note_de     text,
  purchase_note_en     text,
  merch_config         jsonb,                                          -- Schema für Konfigurationsfelder (S4), null = keine
  images               jsonb not null default '[]'::jsonb,            -- [{path, alt}] im Bucket product-images (folgt)
  source_hubspot       boolean not null default false,
  source_shop          boolean not null default false,
  internal_comment     text,
  active               boolean not null default true,
  edition_id           uuid references event (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists product_category_idx on product (category, active);
create index if not exists product_shop_idx on product (shop_visible, active, shop_sort);
comment on table product is 'Produktstamm (Pakete, Zusatzleistungen, Shop-Artikel). SKU = Item-ID der Item-Liste; nach dem Import ist das Portal Quelle der Wahrheit.';
drop trigger if exists trg_product_updated on product;
create trigger trg_product_updated before update on product for each row execute function set_updated_at();

create table if not exists product_component (
  bundle_sku    text not null references product (sku) on delete cascade,
  component_sku text not null references product (sku) on delete restrict,
  qty           numeric(10, 2) not null check (qty > 0),
  primary key (bundle_sku, component_sku),
  check (bundle_sku <> component_sku)
);
comment on table product_component is 'Stückliste: was in einem Paket steckt (Messebau/Regie).';

create table if not exists deliverable_template (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,                                        -- z. B. logo_vector, backdrop_upload, lunch_package
  product_sku    text references product (sku) on delete cascade,      -- null = für alle Partner der Edition
  category       text,                                                 -- alternativ: für alle Produkte einer Kategorie
  type           text not null check (type in ('upload', 'form', 'booking', 'appointment', 'info')),
  label_de       text not null,
  label_en       text not null,
  description_de text,
  description_en text,
  due_rule       jsonb not null default '{}'::jsonb,                    -- {"deadline_key": "booth_backdrop"} | {"offset_days": 14} | {} = ohne Frist
  file_rules     jsonb,                                                -- {"mime": [...], "ext": [...], "max_bytes": n}
  required       boolean not null default true,
  audience_roles text[] not null default '{primary_ops,additional}',    -- wer erledigen darf (contact_role)
  sort           integer not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique nulls not distinct (key, product_sku, category)
);
comment on table deliverable_template is 'Checklisten-Vorlagen je Produkt/Kategorie/alle; daraus entstehen die Pflichten (deliverable) einer Partner-Organisation.';
drop trigger if exists trg_deliverable_template_updated on deliverable_template;
create trigger trg_deliverable_template_updated before update on deliverable_template for each row execute function set_updated_at();

-- 3) Rechte: Partner lesen aktive Produkte ohne Einkaufsdaten; Team über RPC alles
alter table product enable row level security;
alter table product_component enable row level security;
alter table deliverable_template enable row level security;
drop policy if exists product_read on product;
create policy product_read on product for select to authenticated using (active or is_staff());
drop policy if exists product_component_read on product_component;
create policy product_component_read on product_component for select to authenticated using (true);
drop policy if exists deliverable_template_read on deliverable_template;
create policy deliverable_template_read on deliverable_template for select to authenticated using (active or is_staff());
revoke all on product, product_component, deliverable_template from anon;
revoke insert, update, delete on product, product_component, deliverable_template from authenticated;
revoke select on product from authenticated;
grant select (sku, name_de, name_en, description_de, description_en, type, category, unit, net_price_cents, vat_rate, stock_total, track_stock,
              available_until, shop_visible, shop_sort, late_orderable, shop_hint_de, shop_hint_en, purchase_note_de, purchase_note_en,
              merch_config, images, active, edition_id, created_at, updated_at) on product to authenticated;
grant select on product_component, deliverable_template to authenticated;
grant all on product, product_component, deliverable_template to service_role;

create or replace function is_partner_team() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('area_lead_partner')
$$;

-- Team-Lesezugriff mit Einkaufsdaten
create or replace function admin_products(p_only_active boolean default false)
returns setof product
language sql stable security definer set search_path = public, extensions as $$
  select p.* from product p
  where (is_partner_team() or is_staff())
    and (not p_only_active or p.active)
  order by p.category, p.shop_sort nulls last, p.name_de
$$;

-- Pflege (Admin B9): Teilupdate über vorhandene Schlüssel, SKU Pflicht
create or replace function upsert_product(p_data jsonb) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_sku text := p_data->>'sku'; v_exists boolean;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sku is null or v_sku !~ '^I-[0-9]{5}$' then raise exception 'invalid_sku' using errcode = '22023'; end if;
  if p_data ? 'category' and not is_vocab_key('product_category', p_data->>'category') then raise exception 'invalid_category' using errcode = '22023'; end if;
  select exists (select 1 from product where sku = v_sku) into v_exists;
  if not v_exists then
    insert into product (sku, name_de, name_en, description_de, description_en, type, category, unit, net_price_cents, purchase_price_cents, margin, vat_rate,
                         supplier, supplier_sku, supplier_url, stock_total, track_stock, available_until, shop_visible, shop_sort, late_orderable,
                         shop_hint_de, shop_hint_en, purchase_note_de, purchase_note_en, merch_config, images, source_hubspot, source_shop, internal_comment, active, edition_id)
    values (v_sku, p_data->>'name_de', p_data->>'name_en', p_data->>'description_de', p_data->>'description_en', coalesce(p_data->>'type', 'shop_item'), p_data->>'category',
            coalesce(p_data->>'unit', 'piece'), (p_data->>'net_price_cents')::integer, (p_data->>'purchase_price_cents')::integer, (p_data->>'margin')::numeric,
            coalesce((p_data->>'vat_rate')::numeric, 7), p_data->>'supplier', p_data->>'supplier_sku', p_data->>'supplier_url', (p_data->>'stock_total')::integer,
            coalesce((p_data->>'track_stock')::boolean, false), (p_data->>'available_until')::timestamptz, coalesce((p_data->>'shop_visible')::boolean, false),
            (p_data->>'shop_sort')::integer, coalesce((p_data->>'late_orderable')::boolean, false), p_data->>'shop_hint_de', p_data->>'shop_hint_en',
            p_data->>'purchase_note_de', p_data->>'purchase_note_en', p_data->'merch_config', coalesce(p_data->'images', '[]'::jsonb),
            coalesce((p_data->>'source_hubspot')::boolean, false), coalesce((p_data->>'source_shop')::boolean, false), p_data->>'internal_comment',
            coalesce((p_data->>'active')::boolean, true), (p_data->>'edition_id')::uuid);
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
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end
    where sku = v_sku;
  end if;
  perform log_audit('product.upsert', 'product', v_sku, null, p_data - 'description_de' - 'description_en');
  return v_sku;
end $$;

create or replace function upsert_product_component(p_bundle_sku text, p_component_sku text, p_qty numeric) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then
    delete from product_component where bundle_sku = p_bundle_sku and component_sku = p_component_sku;
  else
    insert into product_component (bundle_sku, component_sku, qty) values (p_bundle_sku, p_component_sku, p_qty)
    on conflict (bundle_sku, component_sku) do update set qty = excluded.qty;
  end if;
  perform log_audit('product.component', 'product', p_bundle_sku, null, jsonb_build_object('component', p_component_sku, 'qty', p_qty));
end $$;

-- 4) Fristen FLS27 (Entscheidung 2); Beschriftungen für Partner
insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, reminder_lead_hours)
select e.id, v.key, 'partner', v.due_at::timestamptz, v.label_de, v.label_en, v.description_de, v.description_en, v.lead
from event e
join (values
  ('booth_backdrop', '2027-03-12 23:59 Europe/Berlin', 'Rückwand-Druckdatei', 'Backdrop print file', 'Druckdatei für die Standrückwand (Maße stehen im Portal).', 'Print file for your booth backdrop (dimensions are shown in the portal).', 168),
  ('shop_phase_1',   '2027-03-19 23:59 Europe/Berlin', 'Messeshop Phase 1', 'Trade fair shop phase 1', 'Bestellungen der ersten Phase werden zu diesem Zeitpunkt verbindlich.', 'Orders of phase 1 become binding at this time.', 168),
  ('shop_phase_2',   '2027-04-02 23:59 Europe/Berlin', 'Messeshop Phase 2', 'Trade fair shop phase 2', 'Letzte Bestellphase für Mobiliar, Technik und Gastronomie.', 'Last ordering phase for furniture, tech and catering.', 168),
  ('shop_phase_3',   '2027-04-09 23:59 Europe/Berlin', 'Nachbestellung (Lunch-Paket)', 'Late orders (lunch package)', 'Nur noch Lunch-Paket und dafür markierte Produkte.', 'Only the lunch package and products marked for late ordering.', 72),
  ('ticket_codes',   '2027-03-31 23:59 Europe/Berlin', 'Ticket-Codes einlösen', 'Redeem ticket codes', 'Bis dahin die Partner-Tickets über den Code bzw. den Secret Shop buchen.', 'Book your partner tickets via code or secret shop by then.', 168),
  ('lunch_package',  '2027-04-09 23:59 Europe/Berlin', 'Lunch-Paket bestellen', 'Order the lunch package', 'Verpflegung für das Standteam an beiden Tagen.', 'Catering for your booth team on both days.', 168)
) as v(key, due_at, label_de, label_en, description_de, description_en, lead) on true
where e.is_edition and e.slug = 'fls27'
on conflict (edition_id, key) do nothing;

select harden_definer_functions();
