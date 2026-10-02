-- 0254 · Produktionsliste je Stand aus Paket, Angebot und Messeshop, Lieferantenliste, interne Prüfung je Stand (PROD-004, PROD-005)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002085454.
-- Produktionsliste je Stand mit Paketausstattung und Shop-Bestellungen (PROD-004), interne Prüfung je Stand (PROD-005)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PROD-004 (Konrad 17./25.09.): „je Stand: Standardausstattung des Pakets **plus** Shop-Bestellungen =
-- Produktionsliste; die Lieferantenliste summiert beides — elementar.“ PROD-005 (Konrad 25.09.): interne
-- Checkliste je Stand, erster Punkt „Bestellungen passen zur Standgröße“ (kein Kicker auf 4 qm), weitere Punkte
-- kommen dazu. Übernommen vom Admin-Chat (Umverteilung 01.10.).
--
-- Befund: `booth_checklist` und `supplier_order_list` lesen nur `org_product`. Die Stückliste des Pakets
-- (`product_component`) klappt keine von beiden auf, Shop-Bestellungen (`shop_order_line`) kommen nicht vor, und
-- `set_booth_service_check` lehnt jede Position ab, die nicht in `org_product` steht.
--
-- **PROD-004**
-- * `booth_production_lines(edition, org)` — **intern**, die eine Quelle für alles Weitere: je Stand (org_edition)
--   und Artikel drei Mengen — `qty_package` (Stückliste der gebuchten Pakete × Menge des Pakets), `qty_offer`
--   (direkt gebuchte Leistungen aus dem Angebot) und `qty_shop` (Messeshop-Bestellungen in `pending`, `editing`
--   und `completed`; `draft` ist noch der Warenkorb, `cancelled` zählt nicht). `qty_shop_open` ist der Teil davon,
--   der noch nicht abgeschlossen ist (`pending`/`editing`) und sich bis zur Frist ändern kann. Dieselbe
--   Lieferfilterung wie bisher: nur `shop_item` und `addon`, keine Tickets, keine Pässe — das Paket selbst ist
--   keine Lieferung, seine Bestandteile sind es. Nicht aufrufbar für Clients; die Rechte prüfen die Aufrufer.
-- * `booth_checklist` (aus dem Snapshot, drop + create): alte Spalten unverändert, dazu `unit`, `qty_package`,
--   `qty_offer`, `qty_shop`, `qty_shop_open`; `qty` ist die Summe.
-- * `supplier_order_list` (aus dem Snapshot, drop + create): summiert alle drei Quellen, dieselbe Aufschlüsselung.
-- * `set_booth_service_check` (aus dem Snapshot): Haken setzen verlangt die Position in der Produktionsliste
--   (also auch aus Paket und Shop); Haken **nehmen** geht immer, damit nach einer Stornierung nichts stehen bleibt.
--
-- **PROD-005**
-- * Vokabular `booth_review_item` (Begriff `orders_fit_size`) mit Eintrag in `vocab_binding` — weitere Prüfpunkte
--   legt das Team im Vokabular an, ohne Schemaänderung.
-- * Tabelle `booth_review` (Stand × Prüfpunkt: `ok` oder `problem`, Notiz, wer, wann). Ohne Grants, nur über RPCs.
--   Sie merkt sich einen Fingerabdruck der Positionen zum Zeitpunkt der Prüfung (`basis_hash`): ändert der Partner
--   danach seine Bestellung, steht die Prüfung als **veraltet** da, statt still weiterzugelten.
-- * `set_booth_review(org_edition, punkt, status, notiz)` — `ok`, `problem` (verlangt eine Notiz) oder `open`
--   (nimmt die Prüfung zurück); Audit `booth.review` mit vorher/nachher.
-- * `booth_production_summary(edition)` — eine Zeile je Stand: Standnummer, Maße des zugeordneten Stands,
--   gebuchte Standfläche (`area_sqm` × Menge der Standpakete), Tage (`stand_days`, 0240), Namen der Standpakete
--   und alle aktiven Prüfpunkte mit Stand und „veraltet“.
--
-- **Rechte:** `has_admin_section('productionBooths')` für Stand-Liste, Haken, Zusammenfassung und Prüfung,
-- `has_admin_section('productionOrders')` für die Lieferantenliste — statt `is_production_team()`. Dieselbe
-- Rollenmenge (admin, production_team, area_lead_production), aber eine Ausnahme aus der Verwaltung gilt jetzt
-- auch in der Datenbank und nicht nur an der Seite. Wer sonst nichts darf (Partner-Team, Programm-Team), bleibt
-- draußen (42501).
--
-- Fehlerschlüssel: 42501 not allowed · 22023 invalid_status, invalid_vocab_value, note_required, text_too_long ·
-- P0002 booth_item_not_found, org_edition_not_found.
-- Test: `supabase/tests/v6_produktionsliste_stand.sql`. Endet mit `select harden_definer_functions();`.

set search_path = public, extensions;

-- 1 · Die Quelle: Positionen je Stand ------------------------------------------------------------------------
create or replace function booth_production_lines(p_edition_id uuid, p_org_id uuid default null)
 returns table (org_edition_id uuid, org_id uuid, product_sku text,
                qty_package numeric, qty_offer numeric, qty_shop numeric, qty_shop_open numeric)
 language sql
 stable security definer
 set search_path = public, extensions
as $$
  with src as (
    -- Angebot: direkt gebuchte Leistungen
    select oe.id as oe_id, oe.org_id as o_id, op.product_sku as sku, 'offer'::text as kind,
           op.qty as qty, 0::numeric as open_qty
      from org_edition oe
      join org_product op on op.org_edition_id = oe.id and op.status <> 'cancelled'
     where oe.edition_id = p_edition_id and (p_org_id is null or oe.org_id = p_org_id)
    union all
    -- Standardausstattung: Stückliste jedes gebuchten Pakets × Menge des Pakets
    select oe.id, oe.org_id, pc.component_sku, 'package', op.qty * pc.qty, 0::numeric
      from org_edition oe
      join org_product op on op.org_edition_id = oe.id and op.status <> 'cancelled'
      join product_component pc on pc.bundle_sku = op.product_sku
     where oe.edition_id = p_edition_id and (p_org_id is null or oe.org_id = p_org_id)
    union all
    -- Messeshop: bestätigte Bestellungen; `open_qty` ist der Teil, der sich bis zur Frist noch ändern kann
    select oe.id, oe.org_id, sl.product_sku, 'shop', sl.qty,
           case when so.status in ('pending', 'editing') then sl.qty else 0::numeric end
      from org_edition oe
      join shop_order so on so.org_edition_id = oe.id and so.status in ('pending', 'editing', 'completed')
      join shop_order_line sl on sl.order_id = so.id
     where oe.edition_id = p_edition_id and (p_org_id is null or oe.org_id = p_org_id)
  )
  select s.oe_id, s.o_id, s.sku,
         coalesce(sum(s.qty) filter (where s.kind = 'package'), 0),
         coalesce(sum(s.qty) filter (where s.kind = 'offer'), 0),
         coalesce(sum(s.qty) filter (where s.kind = 'shop'), 0),
         coalesce(sum(s.open_qty) filter (where s.kind = 'shop'), 0)
    from src s
    join product p on p.sku = s.sku
   -- Was am Stand ankommt: Messeshop-Artikel und Add-ons. `package` ist das Sponsoring-Paket selbst, keine
   -- Lieferung. Ticket-Kontingente und Pässe laufen über vivenu.
   where p.type in ('shop_item', 'addon')
     and coalesce(p.category, '') <> 'tickets'
     and p.pass_type is null
   group by s.oe_id, s.o_id, s.sku
$$;

comment on function booth_production_lines(uuid, uuid) is
  'PROD-004: Positionen je Stand und Artikel in drei Mengen (Paketausstattung, Angebot, Shop). Intern — nicht für Clients; die aufrufenden Funktionen prüfen die Rechte.';

-- Fingerabdruck der Positionen je Stand: ändert sich eine Menge, ändert sich der Wert (PROD-005, „veraltet“).
create or replace function booth_basis_hash(p_edition_id uuid, p_org_id uuid default null)
 returns table (org_edition_id uuid, basis_hash text)
 language sql
 stable security definer
 set search_path = public, extensions
as $$
  select l.org_edition_id,
         md5(string_agg(l.product_sku || ':' || trim_scale(l.qty_package + l.qty_offer + l.qty_shop)::text,
                        ',' order by l.product_sku))
    from booth_production_lines(p_edition_id, p_org_id) l
   group by l.org_edition_id
$$;

comment on function booth_basis_hash(uuid, uuid) is
  'PROD-005: md5 über Artikel und Gesamtmenge je Stand. Intern; ein Stand ohne Positionen hat md5(''''), das die Aufrufer einsetzen.';

revoke execute on function booth_production_lines(uuid, uuid) from public, anon, authenticated;
revoke execute on function booth_basis_hash(uuid, uuid) from public, anon, authenticated;

-- 2 · Stand-Checkliste ---------------------------------------------------------------------------------------
drop function if exists booth_checklist(uuid, uuid);
create function booth_checklist(p_edition_id uuid, p_org_id uuid default null)
 returns table (org_edition_id uuid, org_id uuid, org_name text, booth_number text, product_sku text, product_name text,
                supplier text, qty numeric, checked boolean, checked_at timestamptz, checked_by_name text, note text,
                unit text, qty_package numeric, qty_offer numeric, qty_shop numeric, qty_shop_open numeric)
 language plpgsql
 stable security definer
 set search_path = public, extensions
as $$
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.org_edition_id, l.org_id, coalesce(o.communication_name, o.legal_name), b.booth_number,
           p.sku, coalesce(p.name_de, p.name_en), p.supplier,
           l.qty_package + l.qty_offer + l.qty_shop,
           c.id is not null, c.checked_at,
           coalesce(pe.first_name || ' ' || pe.last_name, null), c.note,
           p.unit, l.qty_package, l.qty_offer, l.qty_shop, l.qty_shop_open
      from booth_production_lines(p_edition_id, p_org_id) l
      join organization o on o.id = l.org_id
      join product p on p.sku = l.product_sku
      left join lateral (
        select b2.booth_number from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = l.org_edition_id
         order by ba.event_day_id nulls first, b2.created_at limit 1) b on true
      left join booth_service_check c on c.org_edition_id = l.org_edition_id and c.product_sku = p.sku
      left join person pe on pe.id = c.checked_by
     order by coalesce(o.communication_name, o.legal_name), p.supplier, p.sku;
end $$;

comment on function booth_checklist(uuid, uuid) is
  'PROD-004: Produktionsliste je Stand = Paketausstattung + Angebot + Messeshop, mit Haken. Nur has_admin_section(productionBooths).';

grant execute on function booth_checklist(uuid, uuid) to authenticated;

-- 3 · Lieferantenliste ---------------------------------------------------------------------------------------
drop function if exists supplier_order_list(uuid, text);
create function supplier_order_list(p_edition_id uuid, p_supplier text default null)
 returns table (supplier text, product_sku text, product_name text, unit text, qty numeric, orgs integer,
                purchase_price_cents integer,
                qty_package numeric, qty_offer numeric, qty_shop numeric, qty_shop_open numeric)
 language plpgsql
 stable security definer
 set search_path = public, extensions
as $$
begin
  if not has_admin_section('productionOrders') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select coalesce(p.supplier, ''), p.sku, coalesce(p.name_de, p.name_en), p.unit,
           sum(l.qty_package + l.qty_offer + l.qty_shop), count(distinct l.org_id)::integer, p.purchase_price_cents,
           sum(l.qty_package), sum(l.qty_offer), sum(l.qty_shop), sum(l.qty_shop_open)
      from booth_production_lines(p_edition_id) l
      join product p on p.sku = l.product_sku
     where (p_supplier is null or p.supplier = p_supplier)
     group by p.supplier, p.sku, p.name_de, p.name_en, p.unit, p.purchase_price_cents
     order by coalesce(p.supplier, ''), p.sku;
end $$;

comment on function supplier_order_list(uuid, text) is
  'PROD-004: Bestellliste je Dienstleister, summiert über alle Stände und alle drei Quellen (Paketausstattung, Angebot, Messeshop). Nur has_admin_section(productionOrders).';

grant execute on function supplier_order_list(uuid, text) to authenticated;

-- 4 · Haken (Basis: supabase/snapshot/functions/set_booth_service_check.sql) --------------------------------------
create or replace function set_booth_service_check(p_org_edition_id uuid, p_product_sku text, p_checked boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_edition uuid; v_org uuid;
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_checked then
    -- Abhaken lässt sich, was in der Produktionsliste steht: Paketausstattung, Angebot oder Shop.
    select oe.edition_id, oe.org_id into v_edition, v_org from org_edition oe where oe.id = p_org_edition_id;
    if not exists (select 1 from booth_production_lines(v_edition, v_org) l
                    where l.org_edition_id = p_org_edition_id and l.product_sku = p_product_sku) then
      raise exception 'booth_item_not_found' using errcode = 'P0002';
    end if;
    insert into booth_service_check (org_edition_id, product_sku, checked_by, note)
    values (p_org_edition_id, p_product_sku, current_person_id(), nullif(btrim(p_note), ''))
    on conflict (org_edition_id, product_sku)
      do update set checked_by = excluded.checked_by, checked_at = now(), note = excluded.note;
  else
    -- Den Haken nehmen geht immer — auch wenn die Position inzwischen storniert ist.
    delete from booth_service_check
     where org_edition_id = p_org_edition_id and product_sku = p_product_sku;
  end if;
  perform log_audit('booth.service_checked', 'org_edition', p_org_edition_id::text, null,
                    jsonb_build_object('sku', p_product_sku, 'checked', p_checked));
end $$;

grant execute on function set_booth_service_check(uuid, text, boolean, text) to authenticated;

-- 5 · Interne Prüfung je Stand (PROD-005) --------------------------------------------------------------------
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  ('booth_review_item', 'orders_fit_size', 'Bestellungen passen zur Standgröße', 'Orders fit the booth size', 1, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

create table if not exists booth_review (
  id             uuid primary key default gen_random_uuid(),
  org_edition_id uuid not null references org_edition(id) on delete cascade,
  item_key       text not null,
  status         text not null check (status in ('ok', 'problem')),
  note           text,
  basis_hash     text not null,
  checked_by     uuid references person(id) on delete set null,
  checked_at     timestamptz not null default now(),
  unique (org_edition_id, item_key),
  constraint booth_review_problem_note_chk check (status = 'ok' or nullif(btrim(coalesce(note, '')), '') is not null),
  constraint booth_review_note_len_chk check (note is null or char_length(note) <= 1000)
);

comment on table booth_review is
  'PROD-005: interne Prüfung je Stand und Prüfpunkt (Vokabular booth_review_item). Fehlt die Zeile, ist der Punkt offen. basis_hash = Fingerabdruck der Positionen zum Prüfzeitpunkt; weicht er ab, gilt die Prüfung als veraltet.';

alter table booth_review enable row level security;
revoke all on booth_review from anon, authenticated;
grant all on booth_review to service_role;

insert into vocab_binding (vocabulary, table_name, column_name, is_array, note)
values ('booth_review_item', 'booth_review', 'item_key', false, 'Prüfpunkte der Stand-Checkliste (PROD-005)')
on conflict (vocabulary, table_name, column_name) do nothing;

create or replace function set_booth_review(p_org_edition_id uuid, p_item_key text, p_status text, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare
  v_oe org_edition%rowtype;
  v_vorher booth_review%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_hash text;
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('ok', 'problem', 'open') then
    raise exception 'invalid_status' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  if not is_vocab_key('booth_review_item', p_item_key) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'booth_review_item';
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'text_too_long' using errcode = '22023', detail = 'note';
  end if;
  select * into v_vorher from booth_review r where r.org_edition_id = p_org_edition_id and r.item_key = p_item_key;

  if p_status = 'open' then
    delete from booth_review where org_edition_id = p_org_edition_id and item_key = p_item_key;
    -- Nichts zurückzunehmen: auch nichts zu protokollieren.
    if v_vorher.id is null then return; end if;
  else
    if p_status = 'problem' and v_note is null then
      raise exception 'note_required' using errcode = '22023';
    end if;
    select h.basis_hash into v_hash from booth_basis_hash(v_oe.edition_id, v_oe.org_id) h
     where h.org_edition_id = p_org_edition_id;
    insert into booth_review (org_edition_id, item_key, status, note, basis_hash, checked_by, checked_at)
    values (p_org_edition_id, p_item_key, p_status, v_note, coalesce(v_hash, md5('')), current_person_id(), now())
    on conflict (org_edition_id, item_key)
      do update set status = excluded.status, note = excluded.note, basis_hash = excluded.basis_hash,
                    checked_by = excluded.checked_by, checked_at = excluded.checked_at;
  end if;

  perform log_audit('booth.review', 'org_edition', p_org_edition_id::text,
                    case when v_vorher.id is null then null
                         else jsonb_build_object('item', p_item_key, 'status', v_vorher.status, 'note', v_vorher.note) end,
                    jsonb_build_object('item', p_item_key, 'status', p_status, 'note', v_note));
end $$;

comment on function set_booth_review(uuid, text, text, text) is
  'PROD-005: Prüfpunkt eines Stands setzen (ok | problem mit Notiz) oder zurücknehmen (open). Nur has_admin_section(productionBooths); Audit booth.review.';

grant execute on function set_booth_review(uuid, text, text, text) to authenticated;

create or replace function booth_production_summary(p_edition_id uuid)
 returns table (org_edition_id uuid, org_id uuid, org_name text, booth_number text,
                booth_length_m numeric, booth_width_m numeric,
                stand_sqm numeric, stand_days smallint, package_names text, reviews jsonb)
 language plpgsql
 stable security definer
 set search_path = public, extensions
as $$
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with basis as (select h.org_edition_id as oe_id, h.basis_hash as hash from booth_basis_hash(p_edition_id) h),
         staende as (
           select oe.id as oe_id, oe.org_id as o_id
             from org_edition oe
            where oe.edition_id = p_edition_id
              and (org_has_booth(oe.id) or exists (select 1 from basis b where b.oe_id = oe.id))
         )
    select s.oe_id, s.o_id, coalesce(o.communication_name, o.legal_name), bo.booth_number, bo.length_m, bo.width_m,
           fl.sqm, fl.tage, fl.namen,
           (select coalesce(jsonb_agg(jsonb_build_object(
                      'item_key', t.key, 'label_de', t.label_de, 'label_en', t.label_en,
                      'status', r.status, 'note', r.note, 'checked_at', r.checked_at,
                      'checked_by_name', nullif(btrim(coalesce(pe.first_name, '') || ' ' || coalesce(pe.last_name, '')), ''),
                      'stale', r.id is not null and r.basis_hash is distinct from coalesce(b.hash, md5(''))
                    ) order by t.sort_order, t.key), '[]'::jsonb)
              from vocab_term t
              left join booth_review r on r.org_edition_id = s.oe_id and r.item_key = t.key
              left join person pe on pe.id = r.checked_by
              left join basis b on b.oe_id = s.oe_id
             where t.vocabulary = 'booth_review_item' and t.active)
      from staende s
      join organization o on o.id = s.o_id
      left join lateral (
        select b2.booth_number, b2.length_m, b2.width_m from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = s.oe_id
         order by ba.event_day_id nulls first, b2.created_at limit 1) bo on true
      left join lateral (
        select sum(p.area_sqm * op.qty) as sqm, max(p.stand_days) as tage,
               string_agg(coalesce(p.name_de, p.name_en), ', ' order by p.sku) as namen
          from org_product op join product p on p.sku = op.product_sku
         where op.org_edition_id = s.oe_id and op.status <> 'cancelled'
           and p.type = 'package' and p.category = 'standflaeche') fl on true
     order by coalesce(o.communication_name, o.legal_name);
end $$;

comment on function booth_production_summary(uuid) is
  'PROD-005: eine Zeile je Stand mit Maßen, gebuchter Fläche, Tagen und den Prüfpunkten samt Stand und „veraltet“. Nur has_admin_section(productionBooths).';

grant execute on function booth_production_summary(uuid) to authenticated;

select harden_definer_functions();
