-- 0135 · EA1 Aussteller: Level und Kategorie aus den gebuchten Produkten
-- Zweck: Das Sponsoring-Level eines Partners stand bisher als Freitext in
-- `org_edition.sponsoring_level` (aus dem HubSpot-Deal, Feld `fls_booth_type`).
-- Angewendet von der Architektur-Session am 21.09.2026 als 20260921112508.
--
-- Was der Partner wirklich gebucht hat, steht in `org_product`. Diese Migration
-- gibt dem Produkt sein Level (`product.sponsoring_level_key`, Vokabular
-- `sponsoring_level`) und leitet daraus je Org×Edition ab:
--   * `level_key`/`level_rank` — bestes Level unter den gebuchten Produkten,
--   * `level_source` — `product` (abgeleitet) oder `hubspot` (Freitext) oder null,
--   * `categories` — Produktkategorien der gebuchten Pakete, in Vokabular-Reihenfolge.
-- Anlass: Arbeitsauftrag Welle 6, Arbeitspaket EA, Teil EA1 („Kategorie/Tier aus
-- den Partner-Produkten ableiten"), Entscheidung Konrad 21.09.2026.
-- Abweichungen: keine. Die bestehenden Ausgabespalten `sponsoring_level`,
-- `sponsoring_key`, `sponsoring_rank` bleiben unverändert (Freitext-Fassung), damit
-- kein Aufrufer still die Bedeutung wechselt; die Ableitung kommt daneben.
-- Was an Swapcard geschickt wird, ändert diese Migration nicht — `Exhibitor.type`
-- ist dort die **Branche**, nicht das Level (Probe 21.09., siehe Runbook).

set search_path = public, extensions;

-- 1 · Das Produkt kennt sein Level -------------------------------------------

alter table product add column if not exists sponsoring_level_key text;
comment on column product.sponsoring_level_key is
  'Vokabular sponsoring_level (0135): welches Sponsoring-Level dieses Produkt dem Partner gibt. NULL = vergibt kein Level (Zusatzleistungen, Bühnenformate, Tickets). Gebucht ein Partner mehrere, gilt das beste (kleinster sort_order).';

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note)
values ('sponsoring_level', 'product', 'sponsoring_level_key', false, null, 'product.sponsoring_level_key (0135)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- Startbelegung aus dem Produktkatalog, Stand 21.09.2026. Nur eindeutige Fälle:
-- „Standbühne (18qm)" (I-79895) bleibt leer, weil das Vokabular dafür kein Level
-- hat, und `main_stage_loge` hat derzeit kein Produkt — beides ist eine Frage an
-- Konrad und über den Produkt-Editor nachtragbar, ohne Migration.
update product p set sponsoring_level_key = m.key
  from (values
    ('I-79031', 'lounge'),      -- All-Inclusive Lounge (18qm)
    ('I-91411', 'signature'),   -- Signature Stand (QM basiert)
    ('I-39709', 'premium'),     -- All-Inclusive Stand – Premium (18qm)
    ('I-36848', 'premium'),     -- Eigenproduktion Stand - Premium (18qm)
    ('I-69384', 'premium'),     -- Agency Area Partner (Premium) — Aufpreis auf General
    ('I-50131', 'general'),     -- All-Inclusive Stand – General (9qm)
    ('I-84869', 'general'),     -- Eigenproduktion Stand - General (9qm)
    ('I-40175', 'general'),     -- Agency Area Partner (General)
    ('I-39740', 'intro'),       -- All-Inclusive Stand – Intro (4qm)
    ('I-65476', 'start_up'),    -- All-Inclusive Stand - Start-Up (1,5qm)
    ('INI-STAND-2T', 'gemeinschaftsstand'),
    ('INI-STAND-1T', 'gemeinschaftsstand')
  ) as m(sku, key)
 where p.sku = m.sku and p.sponsoring_level_key is distinct from m.key;

-- 2 · Produkt-RPC kennt die Spalte -------------------------------------------
-- Basis: supabase/snapshot/functions/upsert_product.sql. Geändert sind nur die
-- vier Stellen für `sponsoring_level_key` (Prüfung, Insert-Spalte, Insert-Wert,
-- Update-Zeile); der Rest ist unverändert.

create or replace function upsert_product(p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sku text := p_data->>'sku'; v_exists boolean;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Zweites Muster fuer Initiativen-Leistungen (siehe `product_sku_check` oben).
  -- Ohne diese Zeile waeren die vier INI-Produkte nur im Studio pflegbar — und
  -- „mal eben im Dashboard“ ist genau das, was die Konventionen verbieten
  -- (Auflage der Architektur-Session, 18.09.).
  if v_sku is null or (v_sku !~ '^I-[0-9]{5}$' and v_sku !~ '^INI-[A-Z0-9-]{3,20}$') then
    raise exception 'invalid_sku' using errcode = '22023';
  end if;
  if p_data ? 'category' and not is_vocab_key('product_category', p_data->>'category') then raise exception 'invalid_category' using errcode = '22023'; end if;
  -- Neu (0110): welche Partner-Seite dieses Produkt oeffnet. Leerer Text heisst
  -- „keine Seite" — sonst liesse sich eine Zuordnung ueber die Oberflaeche nie
  -- wieder entfernen.
  if p_data ? 'format_key' and nullif(btrim(p_data->>'format_key'), '') is not null
     and not is_vocab_key('partner_format', btrim(p_data->>'format_key')) then
    raise exception 'invalid_format' using errcode = '22023', detail = coalesce(p_data->>'format_key', 'null');
  end if;
  -- Neu (0135): welches Sponsoring-Level dieses Produkt vergibt. Wie beim
  -- Formatschluessel heisst leerer Text „kein Level".
  if p_data ? 'sponsoring_level_key' and nullif(btrim(p_data->>'sponsoring_level_key'), '') is not null
     and not is_vocab_key('sponsoring_level', btrim(p_data->>'sponsoring_level_key')) then
    raise exception 'invalid_sponsoring_level' using errcode = '22023', detail = coalesce(p_data->>'sponsoring_level_key', 'null');
  end if;
  if p_data ? 'pass_type' and nullif(p_data->>'pass_type', '') is not null and (p_data->>'pass_type') not in ('partner', 'talent', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  if p_data ? 'grants_role' and nullif(p_data->>'grants_role', '') is not null and not is_vocab_key('role', p_data->>'grants_role') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select exists (select 1 from product where sku = v_sku) into v_exists;
  if not v_exists then
    insert into product (sku, name_de, name_en, description_de, description_en, type, category, unit, net_price_cents, purchase_price_cents, margin, vat_rate,
                         supplier, supplier_sku, supplier_url, stock_total, track_stock, available_until, shop_visible, shop_sort, late_orderable,
                         shop_hint_de, shop_hint_en, purchase_note_de, purchase_note_en, merch_config, images, source_hubspot, source_shop, internal_comment, active, edition_id,
                         pass_type, grants_role, format_key, sponsoring_level_key)
    values (v_sku, p_data->>'name_de', p_data->>'name_en', p_data->>'description_de', p_data->>'description_en', coalesce(p_data->>'type', 'shop_item'), p_data->>'category',
            coalesce(p_data->>'unit', 'piece'), (p_data->>'net_price_cents')::integer, (p_data->>'purchase_price_cents')::integer, (p_data->>'margin')::numeric,
            coalesce((p_data->>'vat_rate')::numeric, 7), p_data->>'supplier', p_data->>'supplier_sku', p_data->>'supplier_url', (p_data->>'stock_total')::integer,
            coalesce((p_data->>'track_stock')::boolean, false), (p_data->>'available_until')::timestamptz, coalesce((p_data->>'shop_visible')::boolean, false),
            (p_data->>'shop_sort')::integer, coalesce((p_data->>'late_orderable')::boolean, false), p_data->>'shop_hint_de', p_data->>'shop_hint_en',
            p_data->>'purchase_note_de', p_data->>'purchase_note_en', p_data->'merch_config', coalesce(p_data->'images', '[]'::jsonb),
            coalesce((p_data->>'source_hubspot')::boolean, false), coalesce((p_data->>'source_shop')::boolean, false), p_data->>'internal_comment',
            coalesce((p_data->>'active')::boolean, true), (p_data->>'edition_id')::uuid,
            nullif(p_data->>'pass_type', ''), nullif(p_data->>'grants_role', ''), nullif(btrim(p_data->>'format_key'), ''),
            nullif(btrim(p_data->>'sponsoring_level_key'), ''));
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
      grants_role = case when p_data ? 'grants_role' then nullif(p_data->>'grants_role', '') else grants_role end,
      format_key = case when p_data ? 'format_key' then nullif(btrim(p_data->>'format_key'), '') else format_key end,
      sponsoring_level_key = case when p_data ? 'sponsoring_level_key' then nullif(btrim(p_data->>'sponsoring_level_key'), '') else sponsoring_level_key end
    where sku = v_sku;
  end if;
  perform log_audit('product.upsert', 'product', v_sku, null, p_data - 'description_de' - 'description_en');
  return v_sku;
end $$;

-- 3 · Ausstellerliste gibt die Ableitung mit ---------------------------------
-- Basis: supabase/snapshot/functions/event_app_exhibitors.sql. Neu sind vier
-- Ausgabespalten und der laterale Block, der sie berechnet; der Rest ist
-- unverändert. Rückgabetyp ändert sich ⇒ erst droppen.

drop function if exists event_app_exhibitors(uuid);
create or replace function event_app_exhibitors(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text, description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer, level_key text, level_rank integer, level_source text, categories text[], partner_category text, org_type text, booth_number text, onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
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

select harden_definer_functions();
