-- 00NN · Nachbuchungen (Upsells): `org_product.nachgebucht_am`, Folge-Deal ohne Kontakte, `partner_overview` liefert das Feld (PART-102)
--
-- Anlass: PART-102 (Konrad & Leopold 05.10., Frage aus dem Sales): Leistungen lassen sich nachträglich hinzubuchen, meist über ein **zweites
-- HubSpot-Angebot**. Plan 24.09. (Nr. 20): ein zweiter gewonnener Deal zählt **zusätzlich**, das Portal zeigt „nachgebucht am …“. Vorschlag
-- `docs/vorschlag-part102-nachbuchungen.md` (#387): Datenmodell von Plan freigegeben (08.10.), F2 ja, **K-82 (Konrad 08.10.): ein neuer Deal
-- in derselben Pipeline und Phase** — Positionen am bestehenden Deal gibt es nicht (L4 bleibt bewusst offen).
--
-- Was die Migration tut
--   1  `org_product.nachgebucht_am timestamptz` (leer = Erstbuchung). Nur der Ingest setzt sie: gibt es zur Org-Edition beim Einfügen schon eine
--      `partner_deal`-Zeile, bekommen die neuen Leistungen `now()`. Trifft eine Zeile auf eine vorhandene (gleiche Line-Item-Id), bleibt der
--      Wert, wie er war. Händisch oder per Skript angelegte Zeilen (ohne Deal) bleiben leer.
--   2  `ingest_partner_deal` (Basis: Snapshot nach 0279) — drei Änderungen, alles andere bleibt:
--        · Gate: `primary_contact_missing` entfällt, wenn die Organisation schon einen Hauptkontakt (`org_membership` mit `primary_ops`) hat; ein
--          Folge-Deal braucht dann keine Kontakte. `primary_contact_multiple` und `primary_conflict` (anderer Hauptkontakt) bleiben. Die Suche
--          nach der Organisation rückt dafür vor die Prüfung.
--        · Rechnungs-E-Mail: fehlt sie am Folge-Deal (kein Buchhaltungskontakt, keine `invoice_email` an der Firma), gilt die der Org-Edition —
--          Ergänzung zur Freigabe von F2: ohne sie fiele ein Folge-Deal ohne Kontakte an `invoice_email_missing` durch. Sie gewinnt beim
--          Schreiben ohnehin (`coalesce(org_edition.invoice_email, …)`).
--        · `nachgebucht_am` und der Schlüssel `nachbuchung` in Rückgabe und Audit `partner.ingest`.
--   3  `partner_overview` (Basis: Snapshot): `products[]` führt `nachgebucht_am` mit (eine Zeile mehr im JSON; Portal und Admin-Karte „Gebucht“
--      fassen die Zeilen je SKU zusammen und nennen den Nachbuchungs-Anteil).
--   4  `sync_granted_roles` (Basis: Snapshot) — **Befund beim Test, ohne diese Änderung ist die Nachbuchung unbrauchbar:** der Trigger
--      `trg_org_product_roles` ruft sie bei jeder Änderung an `org_product`; ihr Entziehen-Teil beendet (bzw. löscht) alle Rollen mit der Notiz
--      'auto:product' oder 'hubspot', deren Rolle kein gebuchtes Produkt vergibt. Der Ingest legt aber auch die Kontaktrolle `partner_contact` mit
--      der Notiz 'hubspot' an (`partner_contact_upsert_internal(…, 'hubspot')`) — und kein Produkt vergibt `partner_contact`. Folge: die erste
--      Nachbuchung (oder jede Stornierung, jede Änderung an einer Leistung) entzieht **allen** per HubSpot angelegten Kontakten den Zugang zum
--      Portal. Dasselbe erklärt, warum `v3_partner_ingest.sql` ab Schritt 25 scheitert (eigene Bühne `own=false`, `upsert_partner_contact` „not
--      allowed“). Die Änderung: Entziehen und Löschen betreffen nur Rollen, die ein Produkt vergibt (`product.grants_role`). Der gewollte Teil
--      bleibt: fällt das Produkt weg oder wird die Person nicht mehr Hauptkontakt, endet die vergebene Rolle (Gegenstück im Test).
--
-- Was gleich bleibt: Idempotenz je Deal-Id (`already`), `org_edition.hubspot_deal_id` bleibt der erste Deal, additive Leistungen
-- (Schlüssel `(org_edition_id, product_sku, hubspot_line_item_id)`), Ticket-Kontingent über `sync_ticket_allocations` (summiert alle gebuchten
-- Zeilen), Checkliste und `grants_role` über die Trigger. **Keine Mail** an den Partner bei einer Nachbuchung (Plan 08.10.).
--
-- Fehlerschlüssel unverändert (Gate: `primary_contact_missing`, `primary_contact_multiple`, `primary_conflict`, `invoice_email_missing` …).
set search_path = public, extensions;

-- === 1 · Spalte ===============================================================================================================
alter table org_product add column if not exists nachgebucht_am timestamptz;
comment on column org_product.nachgebucht_am is
  'PART-102: Zeitpunkt der Nachbuchung (Upsell) — leer = Erstbuchung. Gesetzt vom Ingest, wenn zur Org-Edition beim Einfügen schon ein Deal (partner_deal) existierte; vorhandene Zeilen behalten ihren Wert.';

-- === 2 · ingest_partner_deal ===================================================================================================
-- Basis: supabase/snapshot/functions/ingest_partner_deal.sql.
create or replace function ingest_partner_deal(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_deal jsonb := coalesce(p->'deal', '{}'::jsonb); v_co jsonb := coalesce(p->'company', '{}'::jsonb);
  v_contacts jsonb := coalesce(p->'contacts', '[]'::jsonb); v_items jsonb := coalesce(p->'line_items', '[]'::jsonb);
  v_errors text[] := '{}'; v_ed event%rowtype; v_org_id uuid; v_oe_id uuid; v_new_org boolean := false;
  c jsonb; li jsonb; v_roles text[]; v_role text; v_primaries integer := 0; v_primary_email text; v_existing_primary text;
  v_n_contacts integer := 0; v_n_products integer := 0; v_n_alloc integer := 0; v_n_roles integer := 0; v_cnt integer;
  v_deal_id text := nullif(btrim(coalesce(v_deal->>'id', '')), ''); v_company_id text := nullif(btrim(coalesce(v_co->>'id', '')), '');
  v_invoice text := nullif(lower(btrim(coalesce(v_co->>'invoice_email', ''))), ''); v_acc_email text;
  v_err_id bigint; v_owner_pid uuid; v_notified integer := 0; v_vars jsonb; v_valid_to timestamptz; v_grant text;
  v_cust text := nullif(btrim(coalesce(v_co->>'customer_number', '')), ''); v_cust_alt text;
  v_has_primary boolean := false; v_nachbuchung boolean := false;
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
  if v_company_id is not null then
    select o.id, o.customer_number into v_org_id, v_cust_alt from organization o where o.hubspot_id = v_company_id;
  end if;
  -- PART-102 (Nachbuchung, K-82: ein neuer Deal in derselben Pipeline): Hat die Organisation schon einen Hauptkontakt, braucht der Folge-Deal
  -- keinen eigenen — `primary_contact_missing` entfällt. `primary_contact_multiple` und `primary_conflict` (anderer Hauptkontakt) bleiben.
  -- Die Suche nach der Organisation steht dafür vor der Prüfung (vorher kam sie danach; dazwischen liest nichts `v_org_id`).
  v_has_primary := v_org_id is not null and exists (select 1 from org_membership om where om.org_id = v_org_id and om.roles @> '{primary_ops}');
  if v_primaries = 0 then
    if not v_has_primary then v_errors := array_append(v_errors, 'primary_contact_missing'); end if;
  elsif v_primaries > 1 then v_errors := array_append(v_errors, 'primary_contact_multiple'); end if;
  -- ADM-057 Kundennummer (HubSpot `company_id`, Konrad 24.09.2026): sie ist ueber
  -- alle Organisationen eindeutig (Teilindex `organization_customer_number_key`).
  -- Haengt sie schon an einer **anderen** Firma, ist das kein technischer Fehler,
  -- sondern ein Tippfehler in HubSpot, der spaeter Belege falsch zuordnet — also
  -- ins Gate, mit der Nummer im Text, damit Sales sie ohne Nachfrage findet.
  -- Stichprobe 25.09.2026: 3542 Firmen, 35 Nummern an mehr als einer Firma.
  if v_cust is not null and exists (select 1 from organization o
        where o.customer_number = v_cust and (v_org_id is null or o.id <> v_org_id)) then
    v_errors := array_append(v_errors, 'customer_number_taken:' || v_cust);
  end if;
  if v_org_id is not null and v_primary_email is not null then
    select pe.email::text into v_existing_primary from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary
     where om.org_id = v_org_id and om.roles @> '{primary_ops}' limit 1;
    if v_existing_primary is not null and v_existing_primary <> v_primary_email then v_errors := array_append(v_errors, 'primary_conflict'); end if;
  end if;
  v_invoice := coalesce(v_invoice, v_acc_email);
  -- PART-102: Ein Folge-Deal ohne Buchhaltungskontakt braucht keine eigene Rechnungs-E-Mail, wenn die Organisation für diese Edition schon
  -- eine hat — sie gewinnt ohnehin (`coalesce(org_edition.invoice_email, …)` beim Schreiben). Ohne diese Zeile fiele ein Folge-Deal
  -- ohne Kontakte an der Rechnungs-E-Mail durch, obwohl der Hauptkontakt-Test ihn durchlässt.
  if v_invoice is null and v_org_id is not null and v_ed.id is not null then
    select oe.invoice_email::text into v_invoice from org_edition oe where oe.org_id = v_org_id and oe.edition_id = v_ed.id;
  end if;
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

  -- Nur ergaenzen, nie ueberschreiben — wie die uebrigen Firmendaten. Steht bei
  -- uns schon eine Nummer, gewinnt sie; das Auseinanderlaufen steht im Audit.
  -- Der eigene Satz mit Abfangen ist der Wettlauf zwischen Webhook und Sweep:
  -- die Gate-Pruefung oben liest vor dem Schreiben, ein zweiter Ingest kann
  -- dieselbe Nummer dazwischen festgeschrieben haben. Dann bricht dieser Lauf
  -- ab, die Datenbank bleibt unberuehrt, und der naechste Durchgang faellt
  -- regulaer ins Gate — mit Fehlerdatensatz und Mail an den Deal-Owner.
  if v_cust is not null then
    begin
      update organization set customer_number = v_cust where id = v_org_id and customer_number is null;
    exception when unique_violation then
      raise exception 'customer_number_taken' using errcode = 'P0001', detail = v_cust;
    end;
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

  -- PART-102: Gibt es zu dieser Org-Edition schon einen Deal, ist dieser eine Nachbuchung (Upsell); seine neuen Leistungen tragen `nachgebucht_am`.
  -- Vor dem Eintrag des eigenen Deals gelesen, sonst wäre jeder Deal sein eigener Vorgänger.
  v_nachbuchung := exists (select 1 from partner_deal pd where pd.org_edition_id = v_oe_id);
  insert into partner_deal (hubspot_deal_id, org_edition_id, deal_name, payload)
  values (v_deal_id, v_oe_id, v_deal->>'name', jsonb_build_object('deal', v_deal - 'owner_email' - 'owner_name', 'line_items', v_items, 'company_id', v_company_id));

  for li in select * from jsonb_array_elements(v_items) loop
    if coalesce((li->>'qty')::numeric, 1) <= 0 then continue; end if;
    -- `nachgebucht_am` nur beim Anlegen: trifft die Zeile auf eine vorhandene (gleiche Line-Item-Id), bleibt der Wert, wie er war.
    insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, hubspot_line_item_id, status, nachgebucht_am)
    values (v_oe_id, li->>'sku', coalesce((li->>'qty')::numeric, 1), (li->>'unit_price_cents')::integer, nullif(li->>'id', ''), 'booked',
            case when v_nachbuchung then now() end)
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
                    jsonb_build_object('deal_id', v_deal_id, 'org_edition_id', v_oe_id, 'new_org', v_new_org, 'contacts', v_n_contacts, 'products', v_n_products, 'allocations', v_n_alloc, 'roles', v_n_roles,
                                       'customer_number', coalesce(v_cust_alt, v_cust), 'nachbuchung', v_nachbuchung,
                                       -- Behalten heisst nicht verschweigen: weicht HubSpot von
                                       -- unserer Nummer ab, steht das hier und nicht nur im Kopf.
                                       'customer_number_conflict', v_cust_alt is not null and v_cust is not null and v_cust_alt <> v_cust));
  return jsonb_build_object('ok', true, 'already', false, 'org_id', v_org_id, 'org_edition_id', v_oe_id, 'new_org', v_new_org, 'contacts', v_n_contacts, 'products', v_n_products,
                            'allocations', v_n_alloc, 'roles', v_n_roles, 'nachbuchung', v_nachbuchung, 'deliverables', (select count(*) from deliverable d where d.org_edition_id = v_oe_id and d.status <> 'not_required'));
end $$;;

-- === 3 · partner_overview ======================================================================================================
-- Basis: supabase/snapshot/functions/partner_overview.sql. Geändert: `nachgebucht_am` in `products[]`.
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
                                                                'status', op.status, 'format_key', pr.format_key, 'nachgebucht_am', op.nachgebucht_am) order by pr.type, pr.name_de)
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
end $$;;

-- === 4 · sync_granted_roles ===================================================================================================
-- Basis: supabase/snapshot/functions/sync_granted_roles.sql. Geändert: die Zeile mit `product.grants_role` in Entziehen und Löschen (siehe Kopf, Punkt 4).
create or replace function sync_granted_roles(p_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; g record; v_n integer := 0; v_cnt integer; v_valid_to timestamptz;
begin
  for r in select oe.edition_id, oe.id as org_edition_id, e.end_date
           from org_edition oe join event e on e.id = oe.edition_id
           where oe.org_id = p_org_id and coalesce(e.end_date, current_date) >= current_date loop
    v_valid_to := case when r.end_date is not null then (r.end_date + 1)::timestamptz else null end;
    -- vergeben: je gebuchtem Produkt mit Rolle × Hauptkontakt (bestehende aktive Zuweisung, auch manuelle, bleibt)
    for g in select distinct pr.grants_role as role from org_product op join product pr on pr.sku = op.product_sku
             where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role is not null loop
      insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_to, note)
      select om.person_id, g.role, 'org', p_org_id, r.edition_id, v_valid_to, 'auto:product'
      from org_membership om
      where om.org_id = p_org_id and om.roles @> '{primary_ops}'
        and not exists (select 1 from role_assignment ra where ra.person_id = om.person_id and ra.role = g.role and ra.scope_type = 'org' and ra.scope_id = p_org_id
                          and (ra.valid_to is null or ra.valid_to > now()));
      get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
    end loop;
    -- entziehen: automatisch vergebene Rollen, deren Produkt nicht mehr gebucht ist oder deren Person nicht mehr Hauptkontakt ist
    update role_assignment ra set valid_to = now()
     where ra.scope_type = 'org' and ra.scope_id = p_org_id and coalesce(ra.edition_id, r.edition_id) = r.edition_id
       and ra.note in ('auto:product', 'hubspot') and (ra.valid_to is null or ra.valid_to > now()) and ra.valid_from < now()
       -- PART-102: nur Rollen, die ein Produkt vergibt (`product.grants_role`). Der Ingest legt auch die Kontaktrolle `partner_contact` mit der Notiz
       -- 'hubspot' an; ohne diese Zeile endete sie bei jeder Änderung an `org_product` — also bei der ersten Nachbuchung.
       and ra.role in (select pg.grants_role from product pg where pg.grants_role is not null)
       and (not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                         where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role = ra.role)
            or not exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id = ra.person_id and om.roles @> '{primary_ops}'));
    get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
    delete from role_assignment ra
     where ra.scope_type = 'org' and ra.scope_id = p_org_id and coalesce(ra.edition_id, r.edition_id) = r.edition_id
       and ra.note in ('auto:product', 'hubspot') and ra.valid_from >= now()
       and ra.role in (select pg.grants_role from product pg where pg.grants_role is not null)
       and (not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                         where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role = ra.role)
            or not exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id = ra.person_id and om.roles @> '{primary_ops}'));
    get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
  end loop;
  return v_n;
end $$;;

select harden_definer_functions();
