-- =============================================================================
-- 0116 · Welle 6 · Initiativen: Funnel und Leistungen ohne HubSpot (A3.1, A3.2, A3.4)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Initiativen sind keine Partner im Vertriebssinn: es fliesst kein Geld, es gibt
-- kein HubSpot-Deal, und die Leistungen entstehen aus einer Vereinbarung statt
-- aus einer Bestellung. Trotzdem brauchen sie dieselben Pflichten (Logo,
-- Beschreibung), denselben Stand und dieselben Ticketkontingente wie ein Partner
-- — deshalb bekommen sie **keine eigene Welt**, sondern zwei Spalten an den
-- bestehenden Tabellen.
--
-- * `org_edition.pipeline_stage` — der Funnel, den sonst HubSpot führt. Sechs
--   Stufen aus dem Vokabular `initiative_stage`, nullable: für Partner bleibt
--   die Spalte leer, deren Stand steht im Deal.
-- * `org_edition.source` — woher diese Teilnahme kommt. Bestand ist `hubspot`,
--   Initiativen sind `portal`. Ohne diese Unterscheidung wüsste der
--   HubSpot-Abgleich nicht, welche Zeilen er nicht anfassen darf.
-- * `org_product.source` — woher eine gebuchte Leistung kommt. `hubspot` für
--   den Bestand, `agreement` für das, was aus einer Vereinbarung entsteht.
--   **Der Preis ist dabei 0, nicht null:** null hiesse „unbekannt", 0 heisst
--   „vereinbart, kostenlos". Der Unterschied entscheidet später über die
--   Rechnung.
--
-- Die Pflichten entstehen von allein: `trg_org_product_deliverables` hängt seit
-- 0041 an `org_product` und ruft `sync_deliverables`. `assign_org_products`
-- schreibt deshalb nur Zeilen und verlässt sich darauf — eine zweite Ableitung
-- hier wäre eine zweite Wahrheit.
--
-- **Nicht in dieser Migration**, obwohl im Auftrag unter A3: die Rabattstufen
-- (A3.3) und die tageweisen Stände (A3.5). Beide ersetzen eine
-- Eindeutigkeitsregel, an der fremde Funktionen hängen — drei bei den
-- Kontingenten (`on conflict (event_id, org_id, pass_type)`), sechs beim Stand
-- (`booth.org_edition_id`). Das gehört in eigene Bausteine mit eigenem Review,
-- nicht als Anhängsel hierher.
--
-- Fehlerschlüssel: 42501 ohne Partner-Team · 22023 `invalid_stage` ·
-- 22023 `invalid_items` · P0002 `org_edition_not_found` · P0002 `unknown_sku`.
--
-- Test: supabase/tests/v6_initiativen.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order)
values
  ('initiative_stage', 'outreach',   'Ansprache',      'Outreach',   1),
  ('initiative_stage', 'gespraech',  'Gespräch',       'In talks',   2),
  ('initiative_stage', 'agreement',  'Vereinbarung',   'Agreement',  3),
  ('initiative_stage', 'onboarding', 'Onboarding',     'Onboarding', 4),
  ('initiative_stage', 'aktiv',      'Aktiv',          'Active',     5),
  ('initiative_stage', 'abgelehnt',  'Abgelehnt',      'Declined',   6)
on conflict (vocabulary, key) do nothing;

-- ---------------------------------------------------------------- Spalten

alter table org_edition add column if not exists pipeline_stage text;
alter table org_edition drop constraint if exists org_edition_pipeline_stage_chk;
alter table org_edition add constraint org_edition_pipeline_stage_chk
  check (pipeline_stage is null or pipeline_stage in
         ('outreach','gespraech','agreement','onboarding','aktiv','abgelehnt'));
comment on column org_edition.pipeline_stage is
  'Funnel-Stufe einer Initiative (0116, Vokabular initiative_stage). Bei Partnern null — deren Stand fuehrt HubSpot.';

alter table org_edition add column if not exists source text not null default 'hubspot';
alter table org_edition drop constraint if exists org_edition_source_chk;
alter table org_edition add constraint org_edition_source_chk
  check (source in ('hubspot','portal','import'));
comment on column org_edition.source is
  'Woher diese Teilnahme kommt (0116): hubspot (Bestand und Vertrieb), portal (im Admin angelegt, z. B. Initiativen), import (Altdaten). Der HubSpot-Abgleich fasst nur hubspot-Zeilen an.';

alter table org_product add column if not exists source text not null default 'hubspot';
alter table org_product drop constraint if exists org_product_source_chk;
alter table org_product add constraint org_product_source_chk
  check (source in ('hubspot','agreement','shop'));
comment on column org_product.source is
  'Woher die gebuchte Leistung kommt (0116): hubspot (Deal), agreement (Vereinbarung, Preis 0), shop (Messeshop).';

-- ---------------------------------------------------------------- Funnel

/**
 * Die Funnel-Stufe setzen.
 *
 * `abgelehnt` ist eine Stufe wie jede andere und kein Löschen: eine Initiative,
 * die abgesagt hat, bleibt sichtbar. Wer im nächsten Jahr überlegt, wen man
 * wieder anspricht, braucht genau diese Zeilen.
 */
create or replace function set_initiative_stage(p_org_edition_id uuid, p_stage text)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_vorher text; v_org uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_stage is not null and p_stage not in
     ('outreach','gespraech','agreement','onboarding','aktiv','abgelehnt') then
    raise exception 'invalid_stage' using errcode = '22023', detail = coalesce(p_stage, 'null');
  end if;
  select oe.pipeline_stage, oe.org_id into v_vorher, v_org
    from org_edition oe where oe.id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;

  update org_edition set pipeline_stage = p_stage, updated_at = now() where id = p_org_edition_id;

  perform log_audit('initiative.stage', 'org_edition', p_org_edition_id::text,
                    jsonb_build_object('pipeline_stage', v_vorher),
                    jsonb_build_object('pipeline_stage', p_stage, 'org_id', v_org));
end $$;
grant execute on function set_initiative_stage(uuid, text) to authenticated;

/**
 * Die Liste für den Funnel.
 *
 * Zeigt Initiativen **und** was an ihnen hängt: vereinbarte Leistungen, offene
 * Pflichten, Kontingente. Eine Funnel-Liste ohne diese Zahlen wäre eine
 * Adressliste — die Frage lautet nicht „wer ist in Stufe drei", sondern „was
 * fehlt bei wem".
 */
create or replace function initiatives_admin(p_edition_id uuid default null)
returns table (org_edition_id uuid, org_id uuid, org_name text, slug text,
               website text, description_de text, pipeline_stage text, source text,
               onboarding_status text, lead_contact_id uuid,
               produkte integer, pflichten_offen integer, kontingente integer,
               updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1))
    into v_ed;
  return query
    select oe.id, o.id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           o.slug, o.website, o.description_de, oe.pipeline_stage, oe.source,
           oe.onboarding_status, oe.lead_contact_id,
           (select count(*)::integer from org_product op
             where op.org_edition_id = oe.id and op.status = 'booked'),
           -- „Offen" heisst: da muss noch jemand ran. `submitted` wartet auf
           -- unsere Prüfung und zählt deshalb mit; `accepted` und
           -- `not_required` sind durch.
           (select count(*)::integer from deliverable d
             where d.org_edition_id = oe.id
               and d.status in ('open','overdue','rejected','submitted')),
           (select count(*)::integer from org_ticket_allocation a
             where a.org_edition_id = oe.id),
           oe.updated_at
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed and o.type = 'initiative'
     order by
       -- Was Arbeit macht, zuerst: der Funnel liest sich von oben nach unten.
       case oe.pipeline_stage
         when 'agreement' then 1 when 'onboarding' then 2 when 'gespraech' then 3
         when 'outreach' then 4 when 'aktiv' then 5 when 'abgelehnt' then 7 else 6 end,
       coalesce(nullif(btrim(o.communication_name), ''), o.legal_name);
end $$;
grant execute on function initiatives_admin(uuid) to authenticated;

-- ---------------------------------------------------------------- Leistungen

/**
 * Vereinbarte Leistungen setzen — der Ersatz für den HubSpot-Deal.
 *
 * **Ersetzt den Stand, statt zu ergänzen.** Wer eine Leistung aus der Liste
 * nimmt, erwartet, dass sie weg ist; ein reines Hinzufügen liesse
 * zurückgenommene Vereinbarungen stehen und die Pflichten dazu ebenfalls. Weg
 * kommen dabei nur Zeilen mit `source = 'agreement'`: was aus HubSpot oder dem
 * Messeshop stammt, gehört dieser Funktion nicht.
 *
 * Preis 0, nicht null — siehe Kopf.
 */
create or replace function assign_org_products(p_org_edition_id uuid, p_items jsonb)
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_n integer := 0; v_item jsonb; v_sku text; v_qty numeric; v_vorher jsonb;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'invalid_items' using errcode = '22023', detail = 'Array erwartet';
  end if;
  if not exists (select 1 from org_edition where id = p_org_edition_id) then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;

  -- Erst prüfen, dann schreiben: eine unbekannte SKU mitten im Lauf hinterliesse
  -- sonst einen halb ersetzten Stand.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := nullif(btrim(v_item->>'sku'), '');
    v_qty := coalesce((v_item->>'qty')::numeric, 1);
    if v_sku is null then
      raise exception 'invalid_items' using errcode = '22023', detail = 'sku fehlt';
    end if;
    if v_qty <= 0 then
      raise exception 'invalid_items' using errcode = '22023', detail = v_sku || ': qty muss > 0 sein';
    end if;
    if not exists (select 1 from product p where p.sku = v_sku and p.active) then
      raise exception 'unknown_sku' using errcode = 'P0002', detail = v_sku;
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object('sku', op.product_sku, 'qty', op.qty))
    into v_vorher from org_product op
   where op.org_edition_id = p_org_edition_id and op.source = 'agreement';

  delete from org_product
   where org_edition_id = p_org_edition_id and source = 'agreement';

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, status, source)
    values (p_org_edition_id, btrim(v_item->>'sku'),
            coalesce((v_item->>'qty')::numeric, 1), 0, 'booked', 'agreement');
    v_n := v_n + 1;
  end loop;

  perform log_audit('initiative.products', 'org_edition', p_org_edition_id::text,
                    coalesce(v_vorher, '[]'::jsonb), p_items);
  return v_n;
end $$;
grant execute on function assign_org_products(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- Produkte

/**
 * **Der Schlüsselkreis wird erweitert.**
 *
 * `product_sku_check` liess bisher nur `I-NNNNN` zu — die Produkt-Id aus
 * HubSpot. Initiativen haben dort nichts, und einen freien HubSpot-Zahlenraum
 * zu belegen hiesse, sich früher oder später mit einem echten Produkt zu
 * überschneiden. Deshalb ein zweites Muster `INI-…`: an der SKU ist damit auf
 * einen Blick zu sehen, ob eine Leistung aus dem Vertrieb kommt oder aus einer
 * Vereinbarung. Der Produkt-Abgleich (A4.3) muss `INI-%` überspringen.
 */
alter table product drop constraint if exists product_sku_check;
alter table product add constraint product_sku_check
  check (sku ~ '^I-[0-9]{5}$' or sku ~ '^INI-[A-Z0-9-]{3,20}$');

/**
 * Die vier Leistungen, die eine Initiative bekommen kann.
 *
 * Preis 0 und `shop_visible = false`: sie sind nichts, was jemand kauft. Sie
 * stehen im Stamm, damit Pflichten und Produktion dieselbe Sprache sprechen wie
 * bei Partnern — der Messebauer sieht einen Stand, egal wer ihn bezahlt hat.
 */
insert into product (sku, name_de, name_en, type, category, unit, vat_rate,
                     net_price_cents, track_stock, shop_visible, late_orderable,
                     images, source_hubspot, source_shop, active)
-- `vat_rate` ist ein Prozentsatz (0, 7, 19), kein Faktor — und bei Preis 0 ist
-- 0 die einzige richtige Antwort: es gibt nichts zu versteuern.
select v.sku, v.name_de, v.name_en, v.typ, v.category, 'piece', 0,
       0, false, false, false, '[]'::jsonb, false, false, true
from (values
  ('INI-PARTNERSCHAFT', 'Initiativen-Partnerschaft', 'Initiative partnership', 'partnerschaft', 'package'),
  ('INI-BEACHFLAG',     'Beachflag',                 'Beach flag',             'branding',      'addon'),
  ('INI-STAND-2T',      'Stand, beide Tage',         'Booth, both days',       'standflaeche',  'package'),
  ('INI-STAND-1T',      'Stand, ein Tag',            'Booth, one day',         'standflaeche',  'package')
) as v(sku, name_de, name_en, category, typ)
where not exists (select 1 from product p where p.sku = v.sku);

/**
 * Die Pflichten dazu.
 *
 * Logo als SVG und PNG hängen seit 0041 an **jeder** Teilnahme (`product_sku`
 * null) — die stehen hier nicht noch einmal. Neu sind nur die beiden, die es
 * ohne Initiativen nicht gäbe: die Beschreibung fürs Verzeichnis und die
 * Zusage, wie viele Volunteers gestellt werden.
 */
insert into deliverable_template (key, product_sku, type, label_de, label_en,
                                  description_de, description_en, due_rule, required,
                                  answers_schema, sort, active)
select v.key, v.sku, v.typ, v.label_de, v.label_en, v.beschreibung_de, v.beschreibung_en,
       '{}'::jsonb, true, v.schema, v.sort, true
from (values
  ('initiative_description', 'INI-PARTNERSCHAFT', 'form',
   'Beschreibung eurer Initiative', 'Description of your initiative',
   'Zwei bis drei Sätze für das Verzeichnis und die Event-App.',
   'Two or three sentences for the directory and the event app.',
   jsonb_build_object('fields', jsonb_build_array(
     jsonb_build_object('key','description_de','type','textarea','label_de','Beschreibung (DE)','label_en','Description (DE)','required',true,'max',600),
     jsonb_build_object('key','description_en','type','textarea','label_de','Beschreibung (EN)','label_en','Description (EN)','required',false,'max',600))),
   70),
  ('initiative_volunteers', 'INI-PARTNERSCHAFT', 'form',
   'Zugesagte Volunteers', 'Volunteers pledged',
   'Wie viele Helferinnen und Helfer stellt ihr für den Summit?',
   'How many volunteers will you provide for the summit?',
   jsonb_build_object('fields', jsonb_build_array(
     jsonb_build_object('key','count','type','number','label_de','Anzahl','label_en','Number','required',true,'min',0,'max',50))),
   71),
  ('beachflag_print', 'INI-BEACHFLAG', 'upload',
   'Druckdatei Beachflag', 'Beach flag print file',
   'Vektordatei mit Beschnitt, nach den Massen aus dem Media Kit.',
   'Vector file with bleed, using the dimensions from the media kit.',
   null, 72)
) as v(key, sku, typ, label_de, label_en, beschreibung_de, beschreibung_en, schema, sort)
where not exists (
  select 1 from deliverable_template t where t.key = v.key and t.product_sku is not distinct from v.sku);

/**
 * Die Pflege muss die neuen Schlüssel auch annehmen.
 *
 * `upsert_product` prüfte das alte Muster ein zweites Mal — der CHECK oben
 * hätte die INI-Produkte erlaubt, die Pflegemaske sie weiter mit
 * `invalid_sku` abgewiesen. Dann wären sie nur im Studio zu ändern, und das
 * verbietet die Konvention.
 *
 * **Grundlage ist die Live-Fassung** aus `20260917190103_v6_partner_format_key.sql`
 * (Anfang, Ende und die geprüfte Zeile gegen `pg_proc` verglichen); neu ist
 * allein die zweite Bedingung.
 */
create or replace function upsert_product(p_data jsonb) returns text
language plpgsql security definer set search_path = public, extensions as $$
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

-- ---------------------------------------------------------------- Bestand

/**
 * Die bestehende Initiative gehört nicht zu HubSpot.
 *
 * `source` bekommt für alle Zeilen den Default `hubspot` — auch für die eine
 * Initiative, die schon erfasst ist. Der Kommentar an der Spalte verspricht
 * aber, dass der Abgleich nur `hubspot`-Zeilen anfasst; ohne diesen Nachtrag
 * wäre das Versprechen ab der ersten Zeile falsch (Auflage der
 * Architektur-Session, 18.09.).
 */
update org_edition oe set source = 'portal'
  from organization o
 where o.id = oe.org_id and o.type = 'initiative' and oe.source = 'hubspot';

select harden_definer_functions();
