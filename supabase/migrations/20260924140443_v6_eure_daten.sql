-- 0164 · Welle 6 · Eure Daten (PART-059/061): organization.address_extra und customer_number, set_org_customer_number, partner_overview, shop_invoice_candidates
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924140443.
-- Vorschlag · Welle 6 · Eure Daten (PART-059/061): organization.address_extra und customer_number, update_partner_onboarding, set_org_customer_number, partner_overview, shop_invoice_candidates
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, Eingang 21./24.09. (`docs/feedback/eingang-2026-09-24.md`, „Seite Eure Daten"):
--   PART-059 „Ich würde gern die Kundennummer fest ohne Bearbeitungsmöglichkeit als Info setzen" ·
--            „Es fehlt der Adresszusatz, das haben einige Unternehmen"
--   PART-061 „Name auf der Rechnung: bitte zu ‚Abweichende Firmierung auf Rechnung' — Hinweis dazu,
--            dass das nur gilt, wenn wir nicht den Unternehmensnamen verwenden sollen"
--
-- **Kundennummer.** Es gab sie im Portal bisher nicht. Sie entsteht in HubSpot (Alt-Automation
-- „Kundennummer-Generator", `docs/legacy-inventar.md`); am Unternehmen stehen dort zwei Kandidaten:
-- `company_id` („Übergreifende Kundennummer (Company ID)") und `cheftreff_id_unternehmen`
-- („Eindeutige Kunden-ID, synchronisiert mit Sevdesk und AirTable"). Welche gilt, klärt Konrad
-- (Frage im PR); die Übernahme im HubSpot-Ingest ist ein eigener Punkt beim Admin-Chat. Bis dahin
-- pflegt das Partner-Team die Nummer im Admin (`set_org_customer_number`, mit Audit); der Partner
-- sieht sie nur. Ein Partner kann sie nicht schreiben: `update_partner_onboarding` kennt das Feld
-- nicht (der Test schickt es trotzdem mit). Eindeutig über alle Organisationen (Teilindex) — zwei
-- Firmen mit derselben Nummer wären ein Tippfehler, der später Belege falsch zuordnet.
--
-- **Adresszusatz** (Gebäude, Etage, c/o): `organization.address_extra`, der Partner pflegt ihn wie
-- die übrige Adresse. Er gehört auf die Rechnung — `shop_invoice_candidates` liefert ihn deshalb
-- mit (neue Spalte am Ende, drop + create), der Adressblock (`lib/sevdesk/mapping.ts`) setzt ihn
-- unter die Straße.
--
-- **Abweichende Firmierung** (`org_edition.invoice_name`): keine Spalte, keine Funktion ändert sich —
-- es ändert sich, was der Wert **bedeutet**. Bisher stand er als zusätzliche Zeile *über* dem
-- Firmennamen („z. B. Abteilung"); jetzt **ersetzt** er ihn auf der Rechnung, und leer heißt: der
-- Firmenname. Das zieht `lib/sevdesk/mapping.ts` nach (Adressblock) und die Warenkorb-Anzeige tut
-- es schon (`invoice_name ?? legal_name`). Der HubSpot-Ingest füllt `invoice_name` heute mit dem
-- Firmennamen vor; mit der neuen Bedeutung steht dann derselbe Name einmal statt zweimal.
--
-- Bestand (geprüft 24.09., nur Zählungen): 3 Partner-Editionen, **keine** mit `invoice_name`,
-- noch **keine** Messeshop-Rechnung nach SevDesk übertragen — die neue Bedeutung trifft also keinen
-- vorhandenen Wert und keine Rechnung. Die beiden Spalten sind neu, also leer.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Struktur

alter table organization add column if not exists address_extra text;
comment on column organization.address_extra is
  'Adresszusatz (Gebäude, Etage, c/o) — pflegt der Partner unter „Eure Daten"; steht auf der Rechnung unter der Straße (PART-059).';

alter table organization add column if not exists customer_number text;
comment on column organization.customer_number is
  'Kundennummer aus HubSpot. Partner sehen sie nur; das Partner-Team pflegt sie (set_org_customer_number), bis der HubSpot-Ingest sie übernimmt (PART-059).';
create unique index if not exists organization_customer_number_key
  on organization (customer_number) where customer_number is not null;

-- ---------------------------------------------------------------- 2) Kundennummer setzen (nur Team)

create or replace function set_org_customer_number(p_org_id uuid, p_customer_number text)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_alt text; v_neu text := nullif(btrim(coalesce(p_customer_number, '')), '');
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_neu is not null and length(v_neu) > 40 then raise exception 'too_long' using errcode = '22023', detail = '40'; end if;
  select customer_number into v_alt from organization where id = p_org_id for update;
  if not found then raise exception 'org_not_found' using errcode = 'P0002'; end if;
  if v_alt is not distinct from v_neu then return; end if;
  -- Eindeutig über alle Organisationen (Teilindex): ein eigener Schlüssel statt „gibt es schon",
  -- damit das Team weiss, dass die Nummer schon an einer anderen Firma hängt.
  begin
    update organization set customer_number = v_neu where id = p_org_id;
  exception when unique_violation then
    raise exception 'customer_number_taken' using errcode = 'P0001';
  end;
  perform log_audit('partner.customer_number', 'organization', p_org_id::text,
                    jsonb_build_object('customer_number', v_alt), jsonb_build_object('customer_number', v_neu));
end $$;

-- ---------------------------------------------------------------- 3) Geänderte Funktionen (Live-Fassung aus dem Snapshot)

-- „Eure Daten" speichern: dazu der Adresszusatz.
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
    -- PART-059: Adresszusatz. Die Kundennummer steht bewusst nicht hier — die pflegt nur das Team.
    address_extra      = case when p_data ? 'address_extra' then nullif(btrim(p_data->>'address_extra'), '') else address_extra end,
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

-- Übersicht: Adresszusatz und Kundennummer lesen.
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
                              'address', jsonb_build_object('street', v_o.address_street, 'zip', v_o.address_zip, 'city', v_o.address_city, 'country', v_o.address_country,
                                                         'extra', v_o.address_extra),
                              'partner_category', v_o.partner_category, 'industry', v_o.industry,
                              -- PART-059: sichtbar für alle Kontakte der Organisation, schreiben darf sie nur das Team.
                              'customer_number', v_o.customer_number),
    'roles', to_jsonb(v_roles),
    'team', is_partner_team(),
    'edition', case when v_oe.id is null then null else jsonb_build_object(
        'id', v_oe.id, 'edition_id', v_oe.edition_id, 'onboarding_status', v_oe.onboarding_status, 'invited_at', v_oe.invited_at,
        'onboarding_filled_at', v_oe.onboarding_filled_at, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
        'invoice_email', case when v_full then v_oe.invoice_email::text end, 'invoice_name', case when v_full then v_oe.invoice_name end,
        'vat_id', case when v_full then v_oe.vat_id end, 'po_number', case when v_full then v_oe.po_number end,
        'pass_type_choice', v_oe.pass_type_choice, 'sponsoring_level', v_oe.sponsoring_level,
        -- Erlaubnis zum Weissen fuer die Foto-Wand (PART-053). Kein `v_full`-Gate: es ist
        -- keine sensible Angabe, und wer sie sehen darf, soll sie auch geben koennen.
        'logo_whitening_consent_at', v_oe.logo_whitening_consent_at) end,
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

-- Rechnungskandidaten: Adresszusatz am Ende (42P13: neuer Rückgabetyp, daher drop + create;
-- die bisherigen Spalten bleiben in Reihenfolge und Bedeutung, der Test prüft eine davon).
drop function if exists shop_invoice_candidates(uuid);
create or replace function shop_invoice_candidates(p_edition_id uuid)
 RETURNS TABLE(org_id uuid, legal_name text, communication_name text, address_street text, address_zip text, address_city text, address_country text, invoice_email text, invoice_name text, vat_id text, po_number text, sevdesk_contact_id text, order_ids uuid[], order_nos text[], positions jsonb, net_cents bigint, vat_cents bigint, gross_cents bigint, address_extra text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with orders as (
      select o.id as ord_id, o.order_no as ord_no, oe.org_id as ord_org, o.po_number as ord_po
      from shop_order o join org_edition oe on oe.id = o.org_edition_id
      where o.status = 'completed' and oe.edition_id = p_edition_id
        and not exists (select 1 from external_ref x where x.system = 'sevdesk' and x.object_type = 'shop_order' and x.object_id = o.id)
    ),
    lines as (
      select ord.ord_org, sl.product_sku, max(sl.name_de) as line_name, max(sl.unit) as line_unit, sl.vat_rate as line_vat, sl.price_net_cents as line_price,
             sum(sl.qty) as line_qty, sum(round(sl.qty * sl.price_net_cents))::bigint as line_net
      from orders ord join shop_order_line sl on sl.order_id = ord.ord_id
      group by ord.ord_org, sl.product_sku, sl.vat_rate, sl.price_net_cents
    )
    select org.id, org.legal_name, org.communication_name, org.address_street, org.address_zip, org.address_city, org.address_country,
           oe.invoice_email::text, oe.invoice_name, oe.vat_id,
           coalesce((select string_agg(distinct ord.ord_po, ', ') from orders ord
                      where ord.ord_org = org.id and nullif(btrim(coalesce(ord.ord_po, '')), '') is not null),
                    oe.po_number),
           org.sevdesk_contact_id,
           (select array_agg(ord.ord_id order by ord.ord_no) from orders ord where ord.ord_org = org.id),
           (select array_agg(ord.ord_no order by ord.ord_no) from orders ord where ord.ord_org = org.id),
           (select coalesce(jsonb_agg(jsonb_build_object('sku', l.product_sku, 'name', l.line_name, 'unit', l.line_unit, 'qty', l.line_qty,
                                                          'price_net_cents', l.line_price, 'vat_rate', l.line_vat, 'net_cents', l.line_net) order by l.product_sku), '[]'::jsonb)
              from lines l where l.ord_org = org.id),
           (select coalesce(sum(l.line_net), 0)::bigint from lines l where l.ord_org = org.id),
           (select coalesce(sum(round(l.line_net * l.line_vat / 100)), 0)::bigint from lines l where l.ord_org = org.id),
           (select coalesce(sum(l.line_net) + sum(round(l.line_net * l.line_vat / 100)), 0)::bigint from lines l where l.ord_org = org.id),
           -- PART-059: der Adresszusatz gehört auf die Rechnung.
           org.address_extra
    from organization org
    join org_edition oe on oe.org_id = org.id and oe.edition_id = p_edition_id
    where exists (select 1 from orders ord where ord.ord_org = org.id)
    order by coalesce(org.communication_name, org.legal_name);
end $$;

select harden_definer_functions();
