-- 00NN · Angebot aus dem Messeshop-Warenkorb: Zustand `quoted`, Funktionen, Housekeeping (PART-116)
--
-- Anlass: PART-116 (Konrad & Leopold 05.10.): Kunden brauchen für eine PO oft ein Angebot — „Angebot erstellen“ neben „Verbindlich bestellen“. K-81 (Konrad
-- 08.10.): sofort verbindlich mit Angebotsnummer (SevDesk `AN-####`), **die Bestellung wird mit dem Angebot vorläufig festgesetzt** (Warenkorb gesperrt, bis die
-- PO-Nummer kommt oder das Angebot verfällt/zurückgezogen wird), 30 Tage, Kontakt per Kundennummer, EU-/Auslandspartner „beim Team anfragen“. Datenmodell und
-- Zustände von Plan freigegeben (Vorschlag `docs/vorschlag-part116-angebot.md`, #408, Antworten Q1–Q5: Bestand reservieren, ohne Kundennummer „beim Team
-- anfragen“, SevDesk-Angebot bleibt in v1 offen, keine Mail, höchstens drei Angebote je Bestellung). **Diese Migration ist nur die Datenbank**; Route
-- (SevDesk-Aufrufe, PDF) und Oberfläche folgen nach „Migration live“ in einem zweiten PR.
--
-- Was die Migration tut
--   1  `shop_order`: Spalten `quote_started_at` (Beginn des Angebots-Vorgangs) und `quote_valid_until` (gesetzt, wenn der SevDesk-Beleg eingetragen ist), Status
--      `quoted` im Check-Constraint, und der Teilindex `shop_order_active_uidx` (eine aktive Bestellung je Org-Edition und Phase) nimmt `quoted` auf.
--   2  Neue Funktionen (alle Definer, `search_path` gepinnt):
--        shop_quote_begin(order)  — Partner mit Bearbeitungsrecht und Partner-Team. **Nur aus dem Entwurf** (eine schon verbindlich bestellte Bestellung braucht
--          kein Angebot; Abweichung vom Vorschlag, der `draft`/`editing` nannte: `editing` ist eine bestellte Bestellung, die das Phasenende abschließt — ein
--          zurückgezogenes Angebot müsste sonst verbindlich werden). Prüft Phase, Positionen, Kundennummer (`quote_customer_number_required`), Land Deutschland
--          (`quote_country_unsupported`), vollständige Rechnungsadresse (`quote_address_incomplete`), höchstens drei Angebote (`quote_limit_reached`), Merch und
--          Bestand. Dann **in einem Zug**: Preise frisch aus dem Katalog (wie `shop_confirm`), Bestand reservieren, Status `quoted`, `quote_started_at`; liefert die
--          Grundlage für das Angebot (Positionen, Summen, Firmierung, Adresse, USt-ID, Rechnungs-E-Mail, Kundennummer, vorhandene SevDesk-Kontakt-Id, Hash der Positionen).
--        record_shop_quote(order, SevDesk-Id, Nummer, Kontakt-Id, Netto, Hash, Probebetrieb) — **nur service_role**: trägt den Beleg ein (`external_ref`
--          `sevdesk`/`shop_quote`, bei einem zweiten Angebot rückt das erste in `meta.history`), setzt `quote_valid_until` = heute + 30 Tage, ergänzt
--          `organization.sevdesk_contact_id`, Audit `shop.quote_created` (Bestell-Id, Nummer, Netto-Summe — keine Adresse). Prüft Status und Hash.
--        shop_quote_abort(order, Grund) — **nur service_role**: scheitert die Route vor dem Anlegen, zurück in den Entwurf, Reservierung frei.
--        shop_quote_withdraw(order) — Partner mit Bearbeitungsrecht und Team: Angebot zurückziehen (Entwurf, Reservierung frei, Audit `shop.quote_withdrawn`); das
--          SevDesk-Angebot bleibt offen (Q3).
--        shop_quote_info(order) — Mitglied der Organisation und Team: Nummer, Gültigkeit, Probebetrieb, bisherige Angebote (SevDesk-Id nur fürs Team).
--        shop_quotes_admin(edition) — Team: die Angebote im Stand `quoted` mit Organisation, Nummer, Frist, Summe.
--        shop_quotes_housekeeping() — intern, im Lauf `run_partner_housekeeping`: abgelaufene Angebote (`quote_valid_until` überschritten) und hängengebliebene
--          Vorgänge (kein Beleg nach zehn Minuten — die Route ist abgestürzt) gehen zurück in den Entwurf.
--        shop_quote_lines_hash(order) — intern, Hash der Positionen (SKU, Menge, Preis, USt) für Begin und Record.
--   3  Geänderte Funktionen (Basis: Snapshot, `fn-diff`): shop_upsert_line und shop_remove_line (Fehler `order_quoted`), shop_confirm (nimmt `quoted`
--      an: **Preise und Mengen des Angebots** statt Katalogpreise, `quote_expired`/`quote_in_progress`, Referenz `closed: ordered`, Audit `from_quote`),
--      shop_cancel (`quoted` stornierbar), shop_admin_set_status und shop_admin_set_line (Team ändert ein Angebot nicht, es zieht es zurück oder storniert),
--      shop_orders_admin (Reihenfolge), run_shop_finalization (ein Angebot ohne Bestellung bis zum Phasenende wird wie ein Entwurf storniert),
--      run_partner_housekeeping (ruft `shop_quotes_housekeeping`). `shop_my_orders` bleibt unverändert: `editable` ist für `quoted` falsch, `status` zeigt es.
--
-- Was gleich bleibt: der Rechnungslauf (`shop_invoice_candidates`/`record_shop_invoice` lesen nur `completed` und den Objekttyp `shop_order`; das Angebot
-- liegt unter `shop_quote`), `shop_sync_fulfilled_deliverables` zählt `quoted` nicht (nicht verbindlich), keine Mail.
--
-- Fehlerschlüssel (neu): P0001 `order_quoted`, `quote_customer_number_required`, `quote_country_unsupported`, `quote_address_incomplete`, `quote_limit_reached`,
-- `quote_expired`, `quote_in_progress`, `not_quoted`, `quote_hash_mismatch`, `quote_recorded`; 22023 `quote_id_required`.
set search_path = public, extensions;

-- === 1 · Schema ================================================================================================================
alter table shop_order add column if not exists quote_started_at timestamptz;
alter table shop_order add column if not exists quote_valid_until timestamptz;
comment on column shop_order.quote_started_at is
  'PART-116: Beginn des Angebots-Vorgangs (shop_quote_begin); leer, wenn die Bestellung kein Angebot trägt. Ohne quote_valid_until nach zehn Minuten ⇒ der Vorgang gilt als abgebrochen (Housekeeping).';
comment on column shop_order.quote_valid_until is
  'PART-116: Gültig bis (heute + 30 Tage), gesetzt von record_shop_quote, wenn der SevDesk-Beleg eingetragen ist. Danach verfällt das Angebot (Housekeeping) und die Bestellung ist wieder ein Entwurf.';
alter table shop_order drop constraint if exists shop_order_status_check;
alter table shop_order add constraint shop_order_status_check check (status in ('draft', 'pending', 'editing', 'quoted', 'completed', 'cancelled'));
drop index if exists shop_order_active_uidx;
create unique index shop_order_active_uidx on shop_order (org_edition_id, phase) where status in ('draft', 'pending', 'editing', 'quoted');

-- === 2 · Neue Funktionen ========================================================================================================
-- Hash der Positionen: SKU, Menge, Nettopreis, USt-Satz in fester Reihenfolge — das Angebot gilt für genau diesen Stand.
create or replace function shop_quote_lines_hash(p_order_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
  select md5(coalesce((select string_agg(l.product_sku || ':' || l.qty::text || ':' || l.price_net_cents::text || ':' || l.vat_rate::text, '|' order by l.product_sku)
                         from shop_order_line l where l.order_id = p_order_id), ''))
$$;

create or replace function shop_quote_begin(p_order_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare
  v_me uuid := current_person_id(); v_o shop_order; v_org uuid; v_oe org_edition; v_co organization%rowtype; v_bad record; v_ref external_ref%rowtype;
  v_used integer := 0; v_tot record; v_hash text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status = 'quoted' then raise exception 'order_quoted' using errcode = 'P0001', detail = v_o.id::text; end if;
  if v_o.status <> 'draft' then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  if (shop_phase(v_oe.edition_id)->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001', detail = 'order phase ' || v_o.phase::text; end if;
  if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;

  select * into v_co from organization where id = v_org;
  -- K-81: der Abgleich mit SevDesk läuft über die Kundennummer (HubSpot company_id, ADM-057); ohne sie „Angebot beim Team anfragen“.
  if nullif(btrim(coalesce(v_co.customer_number, '')), '') is null then raise exception 'quote_customer_number_required' using errcode = 'P0001'; end if;
  -- K-81: Auslandspartner (andere Steuerregel) „beim Team anfragen“.
  if upper(btrim(coalesce(nullif(btrim(v_co.address_country), ''), 'DE'))) not in ('DE', 'DEUTSCHLAND', 'GERMANY') then
    raise exception 'quote_country_unsupported' using errcode = 'P0001', detail = coalesce(v_co.address_country, '-');
  end if;
  if nullif(btrim(coalesce(v_co.address_street, '')), '') is null or nullif(btrim(coalesce(v_co.address_zip, '')), '') is null
     or nullif(btrim(coalesce(v_co.address_city, '')), '') is null then
    raise exception 'quote_address_incomplete' using errcode = 'P0001';
  end if;
  -- Q5: höchstens drei Angebote je Bestellung (Schutz des Nummernkreises): das letzte plus die in meta.history.
  select * into v_ref from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  if found then v_used := 1 + coalesce(jsonb_array_length(v_ref.meta->'history'), 0); end if;
  if v_used >= 3 then raise exception 'quote_limit_reached' using errcode = 'P0001', detail = v_used::text; end if;

  -- Merch (S4): jede Zeile mit Schema muss vollständig konfiguriert sein (wie bei der Bestellung).
  select l.product_sku as sku, merch_problem(p.merch_config, l.merch_config, l.qty) as problem
    into v_bad
    from shop_order_line l join product p on p.sku = l.product_sku
   where l.order_id = p_order_id
     and jsonb_array_length(merch_fields(p.merch_config)) > 0
     and merch_problem(p.merch_config, l.merch_config, l.qty) is not null
   order by l.created_at limit 1;
  if v_bad.sku is not null then
    raise exception 'merch_incomplete' using errcode = 'P0001', detail = v_bad.sku || ':' || v_bad.problem;
  end if;

  -- Festsetzen in einem Zug: Preise frisch aus dem Katalog, Bestand reservieren (Q1), Status.
  update shop_order_line l set price_net_cents = coalesce(p.net_price_cents, l.price_net_cents), vat_rate = p.vat_rate, name_de = p.name_de, name_en = p.name_en, unit = p.unit, category = p.category
    from product p where p.sku = l.product_sku and l.order_id = p_order_id;
  perform shop_reconcile_ledger(p_order_id, false);
  update shop_order set status = 'quoted', quote_started_at = now(), quote_valid_until = null where id = p_order_id;
  select * into v_tot from shop_order_totals(p_order_id);
  v_hash := shop_quote_lines_hash(p_order_id);
  perform log_audit('shop.quote_begin', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status),
                    jsonb_build_object('order_no', v_o.order_no, 'net_cents', v_tot.net_cents, 'quotes_before', v_used));

  return jsonb_build_object(
    'order_id', p_order_id, 'order_no', v_o.order_no, 'phase', v_o.phase, 'po_number', v_o.po_number,
    'org', jsonb_build_object(
      'id', v_org, 'legal_name', v_co.legal_name, 'communication_name', v_co.communication_name, 'customer_number', btrim(v_co.customer_number),
      'sevdesk_contact_id', v_co.sevdesk_contact_id, 'address_street', v_co.address_street, 'address_zip', v_co.address_zip, 'address_city', v_co.address_city,
      'address_country', v_co.address_country, 'address_extra', v_co.address_extra,
      'vat_id', v_oe.vat_id, 'invoice_email', v_oe.invoice_email::text, 'invoice_name', v_oe.invoice_name),
    'lines', shop_order_lines_json(p_order_id),
    'totals', jsonb_build_object('net_cents', v_tot.net_cents, 'vat_cents', v_tot.vat_cents, 'gross_cents', v_tot.gross_cents),
    'lines_hash', v_hash, 'quotes_used', v_used);
end $$;

create or replace function record_shop_quote(p_order_id uuid, p_sevdesk_order_id text, p_number text, p_contact_id text, p_net_cents bigint, p_lines_hash text, p_probe boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_o shop_order; v_org uuid; v_tot record; v_ref external_ref%rowtype; v_meta jsonb; v_number text := nullif(btrim(coalesce(p_number, '')), '');
begin
  -- Nur die Route (service_role): ein Partner darf kein Angebot „melden“, das es nicht gibt.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_sevdesk_order_id, '')), '') is null then raise exception 'quote_id_required' using errcode = '22023'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status <> 'quoted' or v_o.quote_started_at is null then raise exception 'not_quoted' using errcode = 'P0001', detail = v_o.status; end if;
  if v_o.quote_valid_until is not null then raise exception 'quote_recorded' using errcode = 'P0001'; end if;
  select * into v_tot from shop_order_totals(p_order_id);
  if shop_quote_lines_hash(p_order_id) is distinct from p_lines_hash or v_tot.net_cents is distinct from p_net_cents then
    raise exception 'quote_hash_mismatch' using errcode = 'P0001';
  end if;
  v_org := shop_order_org(p_order_id);
  v_meta := jsonb_build_object('number', v_number, 'contact_id', nullif(btrim(coalesce(p_contact_id, '')), ''), 'net_cents', p_net_cents, 'lines_hash', p_lines_hash,
                               'order_no', v_o.order_no, 'quoted_at', now(), 'probe', coalesce(p_probe, false));
  select * into v_ref from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id for update;
  if found then
    -- Zweites Angebot nach Rücknahme oder Ablauf: das erste rückt in den Verlauf (Q5 zählt daran).
    update external_ref
       set external_id = btrim(p_sevdesk_order_id),
           meta = v_meta || jsonb_build_object('history', coalesce(v_ref.meta->'history', '[]'::jsonb) || jsonb_build_array(v_ref.meta - 'history'))
     where id = v_ref.id;
  else
    insert into external_ref (system, object_type, object_id, external_id, meta)
    values ('sevdesk', 'shop_quote', p_order_id, btrim(p_sevdesk_order_id), v_meta || jsonb_build_object('history', '[]'::jsonb));
  end if;
  update shop_order set quote_valid_until = now() + interval '30 days' where id = p_order_id;
  if nullif(btrim(coalesce(p_contact_id, '')), '') is not null then
    update organization set sevdesk_contact_id = coalesce(sevdesk_contact_id, btrim(p_contact_id)) where id = v_org;
  end if;
  -- Audit ohne Klartext-Adresse: Bestell-Id, Nummer, Summe.
  perform log_audit('shop.quote_created', 'shop_order', p_order_id::text, null,
                    jsonb_build_object('order_no', v_o.order_no, 'quote_number', v_number, 'net_cents', p_net_cents, 'probe', coalesce(p_probe, false)));
end $$;

create or replace function shop_quote_abort(p_order_id uuid, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_o shop_order;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status <> 'quoted' then return; end if;
  if v_o.quote_valid_until is not null then raise exception 'quote_recorded' using errcode = 'P0001'; end if;
  perform shop_reconcile_ledger(p_order_id, true);
  update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = p_order_id;
  perform log_audit('shop.quote_aborted', 'shop_order', p_order_id::text, null,
                    jsonb_build_object('order_no', v_o.order_no, 'reason', left(coalesce(nullif(btrim(p_reason), ''), 'unknown'), 40)));
end $$;

create or replace function shop_quote_withdraw(p_order_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_o shop_order;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status <> 'quoted' then raise exception 'not_quoted' using errcode = 'P0001', detail = v_o.status; end if;
  perform shop_reconcile_ledger(p_order_id, true);
  update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = p_order_id;
  update external_ref set meta = meta || jsonb_build_object('closed', 'withdrawn', 'closed_at', now())
   where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  perform log_audit('shop.quote_withdrawn', 'shop_order', p_order_id::text, jsonb_build_object('status', 'quoted'), jsonb_build_object('order_no', v_o.order_no));
end $$;

create or replace function shop_quote_info(p_order_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_o shop_order; v_org uuid; v_ref external_ref%rowtype;
begin
  select * into v_o from shop_order where id = p_order_id;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not (is_partner_of(v_org) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_ref from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'status', v_o.status, 'active', v_o.status = 'quoted', 'quote_number', v_ref.meta->>'number', 'valid_until', v_o.quote_valid_until,
    'probe', coalesce((v_ref.meta->>'probe')::boolean, false), 'closed', v_ref.meta->>'closed',
    'quotes_used', 1 + coalesce(jsonb_array_length(v_ref.meta->'history'), 0),
    'sevdesk_order_id', case when is_partner_team() then v_ref.external_id end);
end $$;

create or replace function shop_quotes_admin(p_edition_id uuid default null)
 returns table (order_id uuid, order_no text, org_id uuid, org_name text, edition_id uuid, quote_number text, valid_until timestamptz, net_cents bigint, probe boolean, started_at timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.order_no, oe.org_id, coalesce(org.communication_name, org.legal_name), oe.edition_id, x.meta->>'number', o.quote_valid_until, t.net_cents,
           coalesce((x.meta->>'probe')::boolean, false), o.quote_started_at
      from shop_order o
      join org_edition oe on oe.id = o.org_edition_id
      join organization org on org.id = oe.org_id
      cross join lateral shop_order_totals(o.id) t
      left join external_ref x on x.system = 'sevdesk' and x.object_type = 'shop_quote' and x.object_id = o.id
     where o.status = 'quoted' and (p_edition_id is null or oe.edition_id = p_edition_id)
     order by o.quote_valid_until nulls first, o.quote_started_at;
end $$;

-- Housekeeping (im Lauf run_partner_housekeeping): abgelaufene Angebote und hängengebliebene Vorgänge zurück in den Entwurf.
create or replace function shop_quotes_housekeeping()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare r record; v_expired integer := 0; v_stale integer := 0;
begin
  for r in select o.id from shop_order o where o.status = 'quoted' and o.quote_valid_until is not null and o.quote_valid_until < now() order by o.quote_valid_until for update loop
    perform shop_reconcile_ledger(r.id, true);
    update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = r.id;
    update external_ref set meta = meta || jsonb_build_object('closed', 'expired', 'closed_at', now())
     where system = 'sevdesk' and object_type = 'shop_quote' and object_id = r.id;
    insert into audit_log (action, object_type, object_id, after) values ('shop.quote_expired', 'shop_order', r.id::text, null);
    v_expired := v_expired + 1;
  end loop;
  for r in select o.id from shop_order o where o.status = 'quoted' and o.quote_valid_until is null and o.quote_started_at < now() - interval '10 minutes' order by o.quote_started_at for update loop
    perform shop_reconcile_ledger(r.id, true);
    update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = r.id;
    insert into audit_log (action, object_type, object_id, after) values ('shop.quote_aborted', 'shop_order', r.id::text, jsonb_build_object('reason', 'stale'));
    v_stale := v_stale + 1;
  end loop;
  return jsonb_build_object('expired', v_expired, 'stale', v_stale);
end $$;

-- === 3 · Geänderte Funktionen (Basis: Snapshot) ==================================================================================
-- shop_upsert_line: die Suche nach der aktiven Bestellung nimmt `quoted` auf, ein Angebot sperrt das Ändern (`order_quoted`) — sonst entstünde neben dem
-- Angebot ein zweiter Entwurf (der Teilindex ließe es ohnehin nicht zu).
create or replace function shop_upsert_line(p_org_id uuid, p_sku text, p_qty numeric, p_merch_config jsonb DEFAULT NULL::jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_phase jsonb; v_p integer; v_late boolean; v_o shop_order; v_pr product; v_free integer; v_other integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  v_phase := shop_phase(v_oe.edition_id); v_p := (v_phase->>'phase')::integer; v_late := (v_phase->>'late_only')::boolean;
  if v_p = 0 then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  if not (org_has_booth(v_oe.id) or shop_sku_via_deliverable(v_oe.id, p_sku)) then
    raise exception 'booth_required' using errcode = 'P0001', detail = p_sku;
  end if;
  select * into v_pr from product where sku = p_sku and active;
  if not found then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
  if not v_pr.shop_visible and not shop_sku_via_deliverable(v_oe.id, p_sku) then
    raise exception 'unknown_sku' using errcode = '22023', detail = p_sku;
  end if;
  if coalesce(v_pr.net_price_cents, 0) = 0 then raise exception 'request_only' using errcode = '22023', detail = p_sku; end if;
  if v_late and not v_pr.late_orderable then raise exception 'late_only' using errcode = 'P0001', detail = p_sku; end if;
  if v_pr.available_until is not null and v_pr.available_until <= now() then raise exception 'not_available' using errcode = 'P0001', detail = p_sku; end if;
  if v_pr.edition_id is not null and v_pr.edition_id <> v_oe.edition_id then raise exception 'wrong_edition' using errcode = '22023', detail = p_sku; end if;
  select * into v_o from shop_order where org_edition_id = v_oe.id and phase = v_p and status in ('draft', 'pending', 'editing', 'quoted') for update;
  if not found then
    if coalesce(p_qty, 0) <= 0 then raise exception 'empty_order' using errcode = '22023'; end if;
    insert into shop_order (org_edition_id, order_no, phase, status, created_by)
    values (v_oe.id, 'MS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('shop_order_seq')::text, 4, '0'), v_p, 'draft', v_me) returning * into v_o;
  elsif v_o.status = 'pending' then
    raise exception 'order_pending' using errcode = 'P0001', detail = v_o.id::text;
  elsif v_o.status = 'quoted' then
    -- PART-116: mit dem Angebot ist der Warenkorb festgesetzt; zurückziehen (shop_quote_withdraw) oder bestellen.
    raise exception 'order_quoted' using errcode = 'P0001', detail = v_o.id::text;
  end if;
  if coalesce(p_qty, 0) > 0 and v_pr.track_stock then
    v_free := coalesce(shop_stock_available(p_sku), 0);
    v_other := coalesce(shop_order_reserved(v_o.id, p_sku), 0);
    if p_qty > v_free + v_other then
      raise exception 'out_of_stock' using errcode = 'P0001', detail = p_sku || ':' || (v_free + v_other)::text;
    end if;
  end if;
  if coalesce(p_qty, 0) <= 0 then
    delete from shop_order_line where order_id = v_o.id and product_sku = p_sku;
  else
    insert into shop_order_line (order_id, product_sku, name_de, name_en, category, unit, vat_rate, price_net_cents, qty, merch_config)
    values (v_o.id, p_sku, v_pr.name_de, v_pr.name_en, v_pr.category, v_pr.unit, v_pr.vat_rate, v_pr.net_price_cents, p_qty, p_merch_config)
    on conflict (order_id, product_sku) do update set qty = excluded.qty, merch_config = coalesce(excluded.merch_config, shop_order_line.merch_config),
      name_de = excluded.name_de, name_en = excluded.name_en, category = excluded.category, unit = excluded.unit, vat_rate = excluded.vat_rate, price_net_cents = excluded.price_net_cents;
  end if;
  update shop_order set updated_at = now() where id = v_o.id;
  return v_o.id;
end $$;

-- shop_remove_line: `order_quoted` statt „nicht editierbar“.
create or replace function shop_remove_line(p_order_id uuid, p_sku text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order;
begin
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status = 'quoted' then raise exception 'order_quoted' using errcode = 'P0001', detail = v_o.id::text; end if;
  if v_o.status not in ('draft', 'editing') then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  delete from shop_order_line where order_id = p_order_id and product_sku = p_sku;
  update shop_order set updated_at = now() where id = p_order_id;
end $$;

-- shop_confirm: nimmt `quoted` an — Preise und Mengen des Angebots, `quote_expired`/`quote_in_progress`, die Referenz wird als bestellt geschlossen.
create or replace function shop_confirm(p_order_id uuid, p_note text DEFAULT NULL::text, p_po_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_o shop_order; v_org uuid; v_oe org_edition; v_phase jsonb; v_org_name text; v_primary uuid; r record; v_locale text;
        v_lines_de text; v_lines_en text; v_tot record; v_tz text; v_bad record; v_po text; v_mail bigint;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'editing', 'quoted') then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  v_phase := shop_phase(v_oe.edition_id);
  if (v_phase->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001', detail = 'order phase ' || v_o.phase::text; end if;
  if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;
  -- PART-116: ein Angebot gilt, bis es verfällt; solange sein SevDesk-Beleg noch nicht eingetragen ist (`quote_valid_until` leer), ist es nicht bestellbar.
  if v_o.status = 'quoted' then
    if v_o.quote_valid_until is null then raise exception 'quote_in_progress' using errcode = 'P0001'; end if;
    if v_o.quote_valid_until < now() then raise exception 'quote_expired' using errcode = 'P0001'; end if;
  end if;
  -- Preise: bei einem Angebot gelten die des Angebots (die Zeilen sind seit `shop_quote_begin` festgesetzt), sonst die des Katalogs.
  if v_o.status <> 'quoted' then
  update shop_order_line l set price_net_cents = coalesce(p.net_price_cents, l.price_net_cents), vat_rate = p.vat_rate, name_de = p.name_de, name_en = p.name_en, unit = p.unit, category = p.category
    from product p where p.sku = l.product_sku and l.order_id = p_order_id;
  end if;

  -- Merch (S4): jede Zeile mit Schema muss vollständig konfiguriert sein.
  select l.product_sku as sku, merch_problem(p.merch_config, l.merch_config, l.qty) as problem
    into v_bad
    from shop_order_line l join product p on p.sku = l.product_sku
   where l.order_id = p_order_id
     and jsonb_array_length(merch_fields(p.merch_config)) > 0
     and merch_problem(p.merch_config, l.merch_config, l.qty) is not null
   order by l.created_at limit 1;
  if v_bad.sku is not null then
    raise exception 'merch_incomplete' using errcode = 'P0001', detail = v_bad.sku || ':' || v_bad.problem;
  end if;

  -- Eingabe schlägt Vorgabe schlägt das, was schon dranstand.
  v_po := coalesce(nullif(btrim(coalesce(p_po_number, '')), ''),
                   nullif(btrim(coalesce(v_o.po_number, '')), ''),
                   nullif(btrim(coalesce(v_oe.po_number, '')), ''));

  perform shop_reconcile_ledger(p_order_id, false);
  update shop_order
     set status = 'pending', confirmed_at = now(), confirmed_by = v_me,
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
         po_number = v_po, quote_started_at = null, quote_valid_until = null
   where id = p_order_id;
  if v_o.status = 'quoted' then
    update external_ref set meta = meta || jsonb_build_object('closed', 'ordered', 'closed_at', now())
     where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  end if;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_org;
  select e.timezone into v_tz from event e where e.id = v_oe.edition_id;
  select string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), sl.name_de, fmt_cents(sl.price_net_cents, 'de')), E'\n' order by sl.created_at),
         string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), coalesce(sl.name_en, sl.name_de), fmt_cents(sl.price_net_cents, 'en')), E'\n' order by sl.created_at)
    into v_lines_de, v_lines_en from shop_order_line sl where sl.order_id = p_order_id;
  select * into v_tot from shop_order_totals(p_order_id);
  select om.person_id into v_primary from org_membership om where om.org_id = v_org and om.roles @> '{primary_ops}';
  for r in select distinct x as pid from unnest(array_remove(array[v_me, v_primary], null)) x loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
    v_mail := queue_mail('shop_order_confirmed', r.pid,
                       jsonb_build_object('org_name', v_org_name, 'order_no', v_o.order_no, 'phase', v_o.phase,
                                          'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end,
                                          'total_net', fmt_cents(v_tot.net_cents::integer, v_locale),
                                          'ends_at', mail_fmt_ts((v_phase->>'ends_at')::timestamptz, coalesce(v_tz, 'Europe/Berlin'), v_locale)),
                       'shop_order', p_order_id);
    -- CC-Kontakte in Kopie, genau an einer Mail: der an den Hauptkontakt, sonst der an die handelnde Person (PART-063).
    if r.pid = coalesce(v_primary, v_me) then perform partner_mail_cc(v_mail, v_org); end if;
  end loop;
  perform log_audit('shop.confirm', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status),
                    jsonb_build_object('order_no', v_o.order_no, 'net_cents', v_tot.net_cents, 'po_number', v_po, 'from_quote', v_o.status = 'quoted'));
  return jsonb_build_object('order_id', p_order_id, 'order_no', v_o.order_no, 'net_cents', v_tot.net_cents,
                            'vat_cents', v_tot.vat_cents, 'gross_cents', v_tot.gross_cents, 'po_number', v_po);
end $$;

-- shop_cancel: auch ein Angebot lässt sich stornieren.
create or replace function shop_cancel(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order; v_oe org_edition;
begin
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'pending', 'editing', 'quoted') then raise exception 'not_cancellable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  if (shop_phase(v_oe.edition_id)->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  perform shop_reconcile_ledger(p_order_id, true);
  update shop_order set status = 'cancelled', cancelled_at = now(), quote_started_at = null, quote_valid_until = null where id = p_order_id;
  if v_o.status = 'quoted' then
    update external_ref set meta = meta || jsonb_build_object('closed', 'cancelled', 'closed_at', now())
     where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  end if;
  perform log_audit('shop.cancel', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), null);
end $$;

-- shop_admin_set_status / shop_admin_set_line: das Team ändert ein Angebot nicht (zurückziehen oder stornieren).
create or replace function shop_admin_set_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'editing', 'completed', 'cancelled') then raise exception 'invalid_status' using errcode = '22023', detail = p_status; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  -- PART-116: ein Angebot wird zurückgezogen (shop_quote_withdraw) oder die Bestellung storniert, nicht auf einen anderen Stand gesetzt.
  if v_o.status = 'quoted' and p_status <> 'cancelled' then raise exception 'order_quoted' using errcode = 'P0001', detail = v_o.id::text; end if;
  if p_status = 'cancelled' then
    perform shop_reconcile_ledger(p_order_id, true);
  elsif p_status = 'completed' then
    if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;
    perform shop_reconcile_ledger(p_order_id, false);
  elsif v_o.status = 'cancelled' then
    perform shop_reconcile_ledger(p_order_id, false);
  end if;
  update shop_order set status = p_status,
                        completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
                        cancelled_at = case when p_status = 'cancelled' then now() else null end,
                        confirmed_at = case when p_status in ('pending', 'completed') then coalesce(confirmed_at, now()) else confirmed_at end,
                        internal_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), internal_note),
                        quote_started_at = null, quote_valid_until = null
   where id = p_order_id;
  if v_o.status = 'quoted' then
    update external_ref set meta = meta || jsonb_build_object('closed', 'cancelled', 'closed_at', now())
     where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  end if;
  perform log_audit('shop.admin_status', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), jsonb_build_object('status', p_status, 'note', p_note));
end $$;

create or replace function shop_admin_set_line(p_order_id uuid, p_sku text, p_qty numeric, p_merch_config jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order; v_pr product;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status = 'cancelled' then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  if v_o.status = 'quoted' then raise exception 'order_quoted' using errcode = 'P0001', detail = v_o.id::text; end if;
  select * into v_pr from product where sku = p_sku;
  if not found then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
  if coalesce(p_qty, 0) <= 0 then
    delete from shop_order_line where order_id = p_order_id and product_sku = p_sku;
  else
    insert into shop_order_line (order_id, product_sku, name_de, name_en, category, unit, vat_rate, price_net_cents, qty, merch_config)
    values (p_order_id, p_sku, v_pr.name_de, v_pr.name_en, v_pr.category, v_pr.unit, v_pr.vat_rate, coalesce(v_pr.net_price_cents, 0), p_qty, p_merch_config)
    on conflict (order_id, product_sku) do update set qty = excluded.qty, merch_config = coalesce(excluded.merch_config, shop_order_line.merch_config);
  end if;
  if v_o.status in ('pending', 'editing', 'completed') then perform shop_reconcile_ledger(p_order_id, false); end if;
  update shop_order set updated_at = now() where id = p_order_id;
  perform log_audit('shop.admin_line', 'shop_order', p_order_id::text, null, jsonb_build_object('sku', p_sku, 'qty', p_qty));
end $$;

-- shop_orders_admin: Reihenfolge der Stände.
create or replace function shop_orders_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, order_no text, org_id uuid, org_name text, edition_id uuid, phase integer, status text, note text, internal_note text, po_number text, confirmed_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, net_cents bigint, vat_cents bigint, gross_cents bigint, lines jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.order_no, oe.org_id, coalesce(org.communication_name, org.legal_name), oe.edition_id, o.phase, o.status,
           o.note, o.internal_note, o.po_number, o.confirmed_at,
           o.completed_at, o.cancelled_at, t.net_cents, t.vat_cents, t.gross_cents, shop_order_lines_json(o.id), o.created_at, o.updated_at
      from shop_order o join org_edition oe on oe.id = o.org_edition_id join organization org on org.id = oe.org_id
      cross join lateral shop_order_totals(o.id) t
     where p_edition_id is null or oe.edition_id = p_edition_id
     order by case o.status when 'pending' then 0 when 'quoted' then 1 when 'editing' then 2 when 'draft' then 3 when 'completed' then 4 else 5 end, o.updated_at desc;
end $$;

-- run_shop_finalization: ein Angebot ohne Bestellung bis zum Phasenende wird wie ein Entwurf storniert.
create or replace function run_shop_finalization()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_completed integer := 0; v_cancelled integer := 0; v_primary uuid; m record; v_locale text; v_org_name text; v_lines_de text; v_lines_en text; v_tot record; v_mail bigint;
begin
  for r in
    select o.*, oe.org_id, oe.edition_id
    from shop_order o join org_edition oe on oe.id = o.org_edition_id
    where o.status in ('draft', 'pending', 'editing', 'quoted')
      and exists (select 1 from deadline d
                   where d.edition_id = oe.edition_id
                     and d.key = shop_phase_deadline_key(o.phase)
                     and d.due_at < now())
    order by o.created_at
  loop
    -- PART-116: ein Angebot ohne Bestellung bis zum Phasenende verfällt wie ein Entwurf (Reservierung frei).
    if r.status in ('draft', 'quoted') or not exists (select 1 from shop_order_line where order_id = r.id) then
      perform shop_reconcile_ledger(r.id, true);
      update shop_order set status = 'cancelled', cancelled_at = now(), quote_started_at = null, quote_valid_until = null where id = r.id;
      if r.status = 'quoted' then
        update external_ref set meta = meta || jsonb_build_object('closed', 'phase_end', 'closed_at', now())
         where system = 'sevdesk' and object_type = 'shop_quote' and object_id = r.id;
      end if;
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    begin
      perform shop_reconcile_ledger(r.id, false);
    exception when others then
      insert into audit_log (action, object_type, object_id, after) values ('shop.finalize_stock_conflict', 'shop_order', r.id::text, jsonb_build_object('error', sqlerrm));
    end;
    update shop_order set status = 'completed', completed_at = now() where id = r.id;
    v_completed := v_completed + 1;
    select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = r.org_id;
    select string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), sl.name_de, fmt_cents(sl.price_net_cents, 'de')), E'\n' order by sl.created_at),
           string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), coalesce(sl.name_en, sl.name_de), fmt_cents(sl.price_net_cents, 'en')), E'\n' order by sl.created_at)
      into v_lines_de, v_lines_en from shop_order_line sl where sl.order_id = r.id;
    select * into v_tot from shop_order_totals(r.id);
    select om.person_id into v_primary from org_membership om where om.org_id = r.org_id and om.roles @> '{primary_ops}';
    for m in select distinct x as pid from unnest(array_remove(array[r.confirmed_by, v_primary], null)) x loop
      select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = m.pid;
      v_mail := queue_mail('shop_order_completed', m.pid,
                         jsonb_build_object('org_name', v_org_name, 'order_no', r.order_no, 'phase', r.phase,
                                            'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end, 'total_net', fmt_cents(v_tot.net_cents::integer, v_locale)),
                         'shop_order', r.id);
      -- CC-Kontakte in Kopie, genau an einer Mail: der an den Hauptkontakt, sonst der an die handelnde Person (PART-063).
      if m.pid = coalesce(v_primary, r.confirmed_by) then perform partner_mail_cc(v_mail, r.org_id); end if;
    end loop;
  end loop;
  if v_completed > 0 or v_cancelled > 0 then
    insert into audit_log (action, object_type, object_id, after) values ('shop.finalize', 'system', 'cron', jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled));
  end if;
  return jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled);
end $$;

-- run_partner_housekeeping: ruft die Angebots-Aufräumung.
create or replace function run_partner_housekeeping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_refreshed integer; v_overdue integer; v_digests integer; v_shop jsonb; v_quotes jsonb;
begin
  v_refreshed := refresh_deliverable_due();
  v_overdue := mark_overdue_deliverables();
  v_digests := send_partner_reminders();
  v_quotes := shop_quotes_housekeeping();
  v_shop := run_shop_finalization();
  return jsonb_build_object('refreshed', v_refreshed, 'overdue', v_overdue, 'digests', v_digests, 'shop', v_shop, 'quotes', v_quotes);
end $$;

-- === 4 · Rechte ================================================================================================================
-- Intern: nur Definer-Aufrufer und die Service-Rolle.
revoke execute on function shop_quote_lines_hash(uuid) from public, anon, authenticated;
revoke execute on function record_shop_quote(uuid, text, text, text, bigint, text, boolean) from public, anon, authenticated;
revoke execute on function shop_quote_abort(uuid, text) from public, anon, authenticated;
revoke execute on function shop_quotes_housekeeping() from public, anon, authenticated;
-- Partner mit Bearbeitungsrecht und Team: shop_quote_begin, shop_quote_withdraw, shop_quote_info; Team: shop_quotes_admin (Rechteprüfung in der Funktion).

select harden_definer_functions();
