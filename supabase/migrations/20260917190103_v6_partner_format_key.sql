-- 20260917190103 · Welle 6 B1: product.format_key — welches gebuchte Produkt welche Partner-Seite öffnet.
-- Angewendet von der Architektur-Session am 17.09.2026 als 20260917190103.
--
-- Zweck: Die Seiten der Menügruppe „Eure Formate" (PART-042) erscheinen nur bei gebuchtem
-- Produkt. Bisher stand diese Zuordnung als SKU-Liste im Code (`app/(partner)/partner/nav.ts`,
-- Konstante STAGE_SKU und Kategorie-Vergleiche). Mit jeder neuen Seite wäre sie dort gewachsen
-- und hätte bei jedem neuen Artikel einen Deploy gebraucht. Sie gehört an das Produkt.
--
-- Anlass: Arbeitsauftrag Welle 6 A1.4/B1, Backlog PART-042; Konrads Bestätigung der Zuordnung
-- vom 17.09.2026. Vorgezogen aus A1, weil B1 P1 ist und ohne die Zuordnung nicht baubar
-- (Befund 2 der Build-Session, von der Architektur-Session am 17.09. angenommen).
--
-- Abweichungen vom Auftrag:
-- 1. Eigenes Vokabular `partner_format` statt `session_format`. `booth`, `branding` und `stage`
--    sind keine Session-Formate; eine gemeinsame Liste würde zwei verschiedene Dinge vermischen.
--    Wo beide Welten sich treffen (`side_event`, `interview_table`, `masterclass`, `company_tour`),
--    sind die Schlüssel absichtlich gleichnamig, damit `partner_create_session` (A1.4) sie
--    unverändert durchreichen kann.
-- 2. Seed enthält `side_event` (I-81745). Der Auftrag ging davon aus, dass der Artikel fehlt;
--    er existiert seit 2026 in der Kategorie „Specials". Ohne SKU bleibt nur `interview_table`
--    — das Produkt entsteht über den Produktstamm (PROD-006).
--
-- Warum die sechs Talk-Artikel einzeln stehen (für den nächsten neuen Speaking-Artikel):
-- `talk` meint einen Redebeitrag auf einer ChefTreff-Bühne — der Partner bekommt dafür einen
-- Slot und trägt selbst einen Speaker ein (PART-044). Die Kategorie `stage_products` taugt als
-- Kriterium nicht, weil dort drei verschiedene Dinge liegen: die Redebeiträge (drei Bühnen mal
-- Speaking und Panel = die sechs unten), die Masterclass (I-33783, eigene Seite mit
-- Bewerbungsverwaltung) und die Standbühne (I-79895, der Partner ist dort selbst Veranstalter).
-- Ein neuer Speaking- oder Panel-Artikel bekommt also `format_key = 'talk'`; ein Artikel, der
-- ein eigenes Format mit Bewerbungen oder eigener Bühne verkauft, bekommt seinen eigenen
-- Schlüssel. Gepflegt wird das Feld künftig im Produktstamm (PROD-006), nicht per Migration.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  ('partner_format', 'booth',           'Messestand',      'Booth',           10, true),
  ('partner_format', 'masterclass',     'Masterclass',     'Masterclass',     20, true),
  ('partner_format', 'company_tour',    'Company Tour',    'Company tour',    30, true),
  ('partner_format', 'side_event',      'Side-Event',      'Side event',      40, true),
  ('partner_format', 'interview_table', 'Interview Table', 'Interview table', 50, true),
  ('partner_format', 'hackathon',       'Hackathon',       'Hackathon',       60, true),
  ('partner_format', 'branding',        'Branding',        'Branding',        70, true),
  ('partner_format', 'talk',            'Talk',            'Talk',            80, true),
  ('partner_format', 'stage',           'Standbühne',      'Booth stage',     90, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- ---------------------------------------------------------------- 2) Spalte

alter table product add column if not exists format_key text;
comment on column product.format_key is
  'Vokabular partner_format: welche Seite der Gruppe „Eure Formate" dieses Produkt im Partner-Portal öffnet. NULL = keine eigene Seite (Mobiliar, Technik, Zusatzleistungen).';
create index if not exists product_format_key_idx on product (format_key) where format_key is not null;

-- `authenticated` liest `product` über Spalten-Grants (0038/0063); ohne diese Zeile käme das
-- Feld in keiner Partner-Abfrage an.
grant select (format_key) on product to authenticated;

-- ---------------------------------------------------------------- 3) Zuordnung (Konrad, 17.09.)
--
-- Zwei Wege mit Absicht: **per Kategorie**, wo die Seite nur zeigt, was den Partner betrifft;
-- **per SKU**, wo er selbst etwas liefern muss und eine falsche Zuordnung ihn vor Fragen
-- stellte, die er nicht beantworten kann.

-- Kategorie genügt: jede Standfläche hat eine Rückwand, jedes Branding-Produkt eine Datei,
-- jedes Hackathon-Produkt betrifft den Hackathon.
update product set format_key = 'booth'     where category = 'standflaeche' and format_key is null;
update product set format_key = 'branding'  where category = 'branding'     and format_key is null;
update product set format_key = 'hackathon' where category = 'hackathon'    and format_key is null;

-- SKU-genau: `company_tours` enthält auch Bus-Branding, Aftermovie-Platzierung und
-- Logo-Einbindungen. Wer die bucht, ist an einer Tour beteiligt, kann aber die neun Angaben
-- zur Tour (Adresse, Zeitslot, Ansprechperson) nicht machen — nur der Gastgeber kann das.
update product set format_key = 'company_tour'
 where sku in ('I-85973', 'I-33092', 'I-38404', 'I-39272', 'I-51185', 'I-26920');

-- SKU-genau: `stage_products` trägt Talk, Masterclass und Standbühne nebeneinander.
update product set format_key = 'talk'
 where sku in ('I-87007', 'I-13114', 'I-21110', 'I-75747', 'I-15248', 'I-21363');
update product set format_key = 'masterclass' where sku = 'I-33783';
update product set format_key = 'stage'       where sku = 'I-79895';

-- Side Event liegt in der Kategorie „Specials" neben unverwandten Artikeln.
update product set format_key = 'side_event'  where sku = 'I-81745';

-- `interview_table` bleibt ohne Produkt: den Artikel legt die Produktion an (PROD-006).
-- Bis dahin öffnet die Seite bei niemandem — das ist richtig so und kein Fehler.

-- ---------------------------------------------------------------- 4) Pflege

-- `upsert_product` nimmt das Feld entgegen (Teilupdate wie alle anderen Felder).
-- **Grundlage ist die Live-Fassung** aus `20260910170349_v3_hubspot_ingest.sql` — sie prueft
-- `pass_type` und `grants_role` und schreibt beide; eine aeltere Vorlage haette sie still
-- entfernt (Konvention §1, Review zu diesem PR).
create or replace function upsert_product(p_data jsonb) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_sku text := p_data->>'sku'; v_exists boolean;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sku is null or v_sku !~ '^I-[0-9]{5}$' then raise exception 'invalid_sku' using errcode = '22023'; end if;
  if p_data ? 'category' and not is_vocab_key('product_category', p_data->>'category') then raise exception 'invalid_category' using errcode = '22023'; end if;
  -- Neu (0110): welche Partner-Seite dieses Produkt oeffnet. Leerer Text heisst
  -- „keine Seite" — sonst liesse sich eine Zuordnung ueber die Oberflaeche nie
  -- wieder entfernen.
  if p_data ? 'format_key' and nullif(btrim(p_data->>'format_key'), '') is not null
     and not is_vocab_key('partner_format', btrim(p_data->>'format_key')) then
    raise exception 'invalid_format' using errcode = '22023', detail = coalesce(p_data->>'format_key', 'null');
  end if;
  if p_data ? 'pass_type' and nullif(p_data->>'pass_type', '') is not null and (p_data->>'pass_type') not in ('partner', 'talent', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  if p_data ? 'grants_role' and nullif(p_data->>'grants_role', '') is not null and not is_vocab_key('role', p_data->>'grants_role') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select exists (select 1 from product where sku = v_sku) into v_exists;
  if not v_exists then
    insert into product (sku, name_de, name_en, description_de, description_en, type, category, unit, net_price_cents, purchase_price_cents, margin, vat_rate,
                         supplier, supplier_sku, supplier_url, stock_total, track_stock, available_until, shop_visible, shop_sort, late_orderable,
                         shop_hint_de, shop_hint_en, purchase_note_de, purchase_note_en, merch_config, images, source_hubspot, source_shop, internal_comment, active, edition_id,
                         pass_type, grants_role, format_key)
    values (v_sku, p_data->>'name_de', p_data->>'name_en', p_data->>'description_de', p_data->>'description_en', coalesce(p_data->>'type', 'shop_item'), p_data->>'category',
            coalesce(p_data->>'unit', 'piece'), (p_data->>'net_price_cents')::integer, (p_data->>'purchase_price_cents')::integer, (p_data->>'margin')::numeric,
            coalesce((p_data->>'vat_rate')::numeric, 7), p_data->>'supplier', p_data->>'supplier_sku', p_data->>'supplier_url', (p_data->>'stock_total')::integer,
            coalesce((p_data->>'track_stock')::boolean, false), (p_data->>'available_until')::timestamptz, coalesce((p_data->>'shop_visible')::boolean, false),
            (p_data->>'shop_sort')::integer, coalesce((p_data->>'late_orderable')::boolean, false), p_data->>'shop_hint_de', p_data->>'shop_hint_en',
            p_data->>'purchase_note_de', p_data->>'purchase_note_en', p_data->'merch_config', coalesce(p_data->'images', '[]'::jsonb),
            coalesce((p_data->>'source_hubspot')::boolean, false), coalesce((p_data->>'source_shop')::boolean, false), p_data->>'internal_comment',
            coalesce((p_data->>'active')::boolean, true), (p_data->>'edition_id')::uuid,
            nullif(p_data->>'pass_type', ''), nullif(p_data->>'grants_role', ''), nullif(btrim(p_data->>'format_key'), ''));
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
      format_key = case when p_data ? 'format_key' then nullif(btrim(p_data->>'format_key'), '') else format_key end
    where sku = v_sku;
  end if;
  perform log_audit('product.upsert', 'product', v_sku, null, p_data - 'description_de' - 'description_en');
  return v_sku;
end $$;

-- ---------------------------------------------------------------- 5) Lesen im Portal

-- `partner_overview` liefert `format_key` je gebuchtem Produkt mit. Ohne das muesste die
-- Oberflaeche die SKU-Zuordnung doch wieder selbst kennen — genau das soll die Spalte beenden.
-- **Grundlage ist die Live-Fassung** aus `20260917183022_v6_aufraeumen_feldmatrix.sql`: die
-- Beschreibung steht seitdem an der Organisation (`organization.description_de/en`), nicht
-- mehr an `org_edition`. Rueckgabetyp bleibt `jsonb`; nur ein Schluessel kommt dazu.
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

select harden_definer_functions();
