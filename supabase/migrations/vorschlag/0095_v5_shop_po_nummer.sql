-- 0095 · Welle 5 · PO-Nummer je Bestellung im Messeshop (F11.2)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Konrad: „Bei der Bestellung wäre es super, wenn man nochmal kurz die
-- Rechnungsadresse überprüfen kann plus erweiterte Infos wie ein PO eingeben
-- kann."
--
-- **Die Adresse wird bestätigt, nicht neu erfasst.** Sie steht in den
-- Stammdaten (`organization`, `org_edition.invoice_*`) und wird dort gepflegt;
-- ein zweites Adressfeld im Bestellweg hiesse, dass wir hinterher nicht mehr
-- wissen, welche gilt. Die Oberfläche zeigt sie und verlinkt zum Ändern —
-- dafür braucht es hier nichts.
--
-- **Die PO-Nummer gehört dagegen an die Bestellung**, nicht an die
-- Organisation: viele Häuser vergeben eine je Auftrag. In den Stammdaten steht
-- weiter eine Vorgabe (`org_edition.po_number`), die beim Bestätigen
-- übernommen wird, wenn niemand etwas anderes eingibt.
--
-- Zwei Funktionen ändern ihre Signatur bzw. ihren Rückgabetyp und müssen
-- deshalb **gelöscht und neu angelegt** werden (db-konventionen §1):
-- `shop_confirm` bekommt einen dritten Parameter, `shop_my_orders` und
-- `shop_orders_admin` eine Spalte.
--
-- Fehlerschlüssel: unverändert (28000, 42501, P0002 `order_not_found`,
-- P0001 `not_editable`/`phase_closed`/`merch_incomplete`, 22023 `empty_order`).

set search_path = public, extensions;

alter table shop_order add column if not exists po_number text;

comment on column shop_order.po_number is
  'Bestellnummer des Partners für diese Bestellung (F11.2). Vorgabe aus org_edition.po_number; je Auftrag überschreibbar. Wandert in den SevDesk-Entwurf.';

-- ------------------------------------------------- Bestätigen mit PO

drop function if exists shop_confirm(uuid, text);

/**
 * Bestätigen — jetzt mit PO-Nummer.
 *
 * `p_po_number` schlägt die Vorgabe aus den Stammdaten; wer nichts eingibt,
 * bekommt die Vorgabe. Leerer Text bedeutet „keine" und wird zu NULL, sonst
 * stünde in der Rechnung eine leere Zeile.
 *
 * Der Rest ist unverändert aus 0072: Snapshot auffrischen, Merch prüfen,
 * Lagerbuch abgleichen, Mail an Auslöser und Hauptkontakt.
 */
create or replace function shop_confirm(p_order_id uuid, p_note text default null, p_po_number text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_o shop_order; v_org uuid; v_oe org_edition; v_phase jsonb; v_org_name text; v_primary uuid; r record; v_locale text;
        v_lines_de text; v_lines_en text; v_tot record; v_tz text; v_bad record; v_po text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'editing') then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  v_phase := shop_phase(v_oe.edition_id);
  if (v_phase->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001', detail = 'order phase ' || v_o.phase::text; end if;
  if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;
  update shop_order_line l set price_net_cents = coalesce(p.net_price_cents, l.price_net_cents), vat_rate = p.vat_rate, name_de = p.name_de, name_en = p.name_en, unit = p.unit, category = p.category
    from product p where p.sku = l.product_sku and l.order_id = p_order_id;

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
         po_number = v_po
   where id = p_order_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = v_org;
  select e.timezone into v_tz from event e where e.id = v_oe.edition_id;
  select string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), sl.name_de, fmt_cents(sl.price_net_cents, 'de')), E'\n' order by sl.created_at),
         string_agg(format('- %s × %s (%s)', trim(to_char(sl.qty, 'FM999999990.##')), coalesce(sl.name_en, sl.name_de), fmt_cents(sl.price_net_cents, 'en')), E'\n' order by sl.created_at)
    into v_lines_de, v_lines_en from shop_order_line sl where sl.order_id = p_order_id;
  select * into v_tot from shop_order_totals(p_order_id);
  select om.person_id into v_primary from org_membership om where om.org_id = v_org and om.roles @> '{primary_ops}';
  for r in select distinct x as pid from unnest(array_remove(array[v_me, v_primary], null)) x loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.pid;
    perform queue_mail('shop_order_confirmed', r.pid,
                       jsonb_build_object('org_name', v_org_name, 'order_no', v_o.order_no, 'phase', v_o.phase,
                                          'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end,
                                          'total_net', fmt_cents(v_tot.net_cents::integer, v_locale),
                                          'ends_at', mail_fmt_ts((v_phase->>'ends_at')::timestamptz, coalesce(v_tz, 'Europe/Berlin'), v_locale)),
                       'shop_order', p_order_id);
  end loop;
  perform log_audit('shop.confirm', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status),
                    jsonb_build_object('order_no', v_o.order_no, 'net_cents', v_tot.net_cents, 'po_number', v_po));
  return jsonb_build_object('order_id', p_order_id, 'order_no', v_o.order_no, 'net_cents', v_tot.net_cents,
                            'vat_cents', v_tot.vat_cents, 'gross_cents', v_tot.gross_cents, 'po_number', v_po);
end $$;

-- ------------------------------------------------- PO-Nummer mitlesen

drop function if exists shop_my_orders(uuid, uuid);

create or replace function shop_my_orders(p_org_id uuid, p_edition_id uuid default null)
returns table (id uuid, order_no text, phase integer, status text, note text, po_number text,
               confirmed_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
               net_cents bigint, vat_cents bigint, gross_cents bigint, lines jsonb, editable boolean,
               created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_p integer;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  v_p := (shop_phase(v_oe.edition_id)->>'phase')::integer;
  return query
    select o.id, o.order_no, o.phase, o.status, o.note, o.po_number, o.confirmed_at, o.completed_at, o.cancelled_at,
           t.net_cents, t.vat_cents, t.gross_cents, shop_order_lines_json(o.id),
           (o.status in ('draft', 'editing', 'pending') and o.phase = v_p), o.created_at, o.updated_at
      from shop_order o cross join lateral shop_order_totals(o.id) t
     where o.org_edition_id = v_oe.id
     order by o.created_at desc;
end $$;

drop function if exists shop_orders_admin(uuid);

create or replace function shop_orders_admin(p_edition_id uuid default null)
returns table (id uuid, order_no text, org_id uuid, org_name text, edition_id uuid, phase integer, status text,
               note text, internal_note text, po_number text, confirmed_at timestamptz,
               completed_at timestamptz, cancelled_at timestamptz, net_cents bigint, vat_cents bigint,
               gross_cents bigint, lines jsonb, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.order_no, oe.org_id, coalesce(org.communication_name, org.legal_name), oe.edition_id, o.phase, o.status,
           o.note, o.internal_note, o.po_number, o.confirmed_at,
           o.completed_at, o.cancelled_at, t.net_cents, t.vat_cents, t.gross_cents, shop_order_lines_json(o.id), o.created_at, o.updated_at
      from shop_order o join org_edition oe on oe.id = o.org_edition_id join organization org on org.id = oe.org_id
      cross join lateral shop_order_totals(o.id) t
     where p_edition_id is null or oe.edition_id = p_edition_id
     order by case o.status when 'pending' then 0 when 'editing' then 1 when 'draft' then 2 when 'completed' then 3 else 4 end, o.updated_at desc;
end $$;

-- ------------------------------------------------- PO in den Rechnungsentwurf

drop function if exists shop_invoice_candidates(uuid);

/**
 * Wie 0052, mit einem Unterschied: die PO-Nummer kommt jetzt aus den
 * **Bestellungen** dieser Rechnung und nur ersatzweise aus den Stammdaten.
 *
 * Eine Rechnung deckt mehrere Bestellungen ab; tragen die verschiedene
 * Nummern, stehen sie alle im Kopftext. Sie stillschweigend auf eine zu
 * reduzieren, hiesse, in der Buchhaltung des Partners die falsche zu nennen.
 */
create or replace function shop_invoice_candidates(p_edition_id uuid)
returns table (org_id uuid, legal_name text, communication_name text, address_street text, address_zip text, address_city text, address_country text,
               invoice_email text, invoice_name text, vat_id text, po_number text, sevdesk_contact_id text,
               order_ids uuid[], order_nos text[], positions jsonb, net_cents bigint, vat_cents bigint, gross_cents bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
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
           (select coalesce(sum(l.line_net) + sum(round(l.line_net * l.line_vat / 100)), 0)::bigint from lines l where l.ord_org = org.id)
    from organization org
    join org_edition oe on oe.org_id = org.id and oe.edition_id = p_edition_id
    where exists (select 1 from orders ord where ord.ord_org = org.id)
    order by coalesce(org.communication_name, org.legal_name);
end $$;

select harden_definer_functions();
