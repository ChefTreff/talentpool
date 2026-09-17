-- 0112 · Welle 6 B2: Messeshop — zwei Bestellphasen, Zugang nur mit Messestand,
--         Lunch-Paket aus dem Shop herausgelöst (PART-037, PART-038, PART-049).
--
-- **Setzt 0110 voraus** (`product.format_key`): `org_has_booth` entscheidet über den Schlüssel,
-- welches Produkt als Messestand zählt. Ohne 0110 fehlt die Spalte und die Funktion scheitert.
--
-- Anlass: Konrads Walkthrough vom 17.09. (Abgleich `docs/abgleich/messeshop.md`, Antworten 9 und
-- 12) und seine Antwort auf die Rückfrage der Build-Session, dazu Arbeitsauftrag Welle 6 §B, B2
-- und A4.2.
--
-- Drei Änderungen, die zusammengehören:
--
-- 1. **Zwei Phasen statt drei.** 19.03.2027 voller Shop, 09.04.2027 nur noch Artikel mit dem
--    Kennzeichen „kurzfristig bestellbar". Die mittlere Frist (02.04.) entfällt; der 02.04.
--    bleibt als Messestand-Frist (`booth_changes_until`) bestehen und ist davon unberührt.
--
-- 2. **Der Shop ist nur mit gebuchtem Messestand sichtbar.** Als Stand zählen die
--    Standflächen-Pakete und die Standbühne, **nicht** der Hackathon-Stand (Konrad, 17.09.).
--    Geprüft wird das serverseitig in jeder Lese- und Schreib-RPC: ein verstecktes Menü ist
--    keine Sicherheitsgrenze, die Adresse `/partner/shop` bliebe sonst offen.
--
-- 3. **Das Lunch-Paket verlässt den Shop** (PART-049). Konrad: „super wichtig, dass alle
--    Partner das sehen — wenn man nur dafür in den Shop gehen muss, überlädt das vielleicht."
--    Es wird zum Checklistenpunkt, den jeder Partner hat und direkt dort bestellt. Der
--    Bestellweg bleibt derselbe: `order_lunch_package` ruft `shop_upsert_line` und
--    `shop_confirm` auf, damit Phasenprüfung, Lagerbuch, PO-Nummer, Mail und Produktionsliste
--    unverändert mitlaufen — **kein zweiter Schreibweg auf `shop_order`** (Bedingung 1 der
--    Architektur-Session).
--
-- Kennzeichen „kurzfristig bestellbar": bleibt `product.late_orderable` (seit 0038). Der
-- Arbeitsauftrag nannte eine neue Spalte `available_phase2`; die Architektur-Session hat den
-- Befund der Build-Session angenommen, dass das Feld bereits existiert und dieselbe Bedeutung
-- trägt — eine zweite Spalte wäre Doppelung.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Zwei Phasen

-- Die alten Schlüssel heißen um: `shop_phase_1` ⇒ `shop_phase1_end`, `shop_phase_2` verfällt,
-- `shop_phase_3` wird zur zweiten Phase. Umbenennen statt neu anlegen, damit die Fristen ihre
-- Historie und ihre Beschreibungen behalten.
update deadline
   set key = 'shop_phase1_end',
       due_at = timestamptz '2027-03-19 23:59 Europe/Berlin',
       label_de = 'Messeshop: erste Bestellphase',
       label_en = 'Trade fair shop: first ordering phase',
       description_de = 'Bis hierhin könnt ihr alles bestellen. Danach geht nur noch, was kurzfristig lieferbar ist.',
       description_en = 'Until this date you can order everything. After that, only short-notice items remain available.'
 where key = 'shop_phase_1';

update deadline
   set key = 'shop_phase2_end',
       due_at = timestamptz '2027-04-09 23:59 Europe/Berlin',
       label_de = 'Messeshop: Nachbestellung',
       label_en = 'Trade fair shop: late orders',
       description_de = 'Letzte Frist. Bestellbar ist nur noch, was als kurzfristig lieferbar gekennzeichnet ist.',
       description_en = 'Final deadline. Only items marked as available at short notice can still be ordered.'
 where key = 'shop_phase_3';

delete from deadline where key = 'shop_phase_2';

-- Bestellungen der alten Phasen 2 und 3 auf die neue Zählung heben. Heute gibt es noch keine
-- (die Edition läuft 2027), aber die Migration darf keinen Bestand hinterlassen, den
-- `run_shop_finalization` nicht mehr findet.
update shop_order set phase = 2 where phase = 3;

create or replace function shop_phase(p_edition_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with d as (
    select max(due_at) filter (where key = 'shop_phase1_end') as d1,
           max(due_at) filter (where key = 'shop_phase2_end') as d2
    from deadline where edition_id = p_edition_id
  )
  select jsonb_build_object(
    'phase', case when d1 is not null and now() <= d1 then 1
                  when d2 is not null and now() <= d2 then 2
                  else 0 end,
    'ends_at', case when d1 is not null and now() <= d1 then d1
                    when d2 is not null and now() <= d2 then d2
                    else null end,
    -- In der zweiten Phase gehen nur noch Artikel mit `late_orderable`.
    'late_only', ((d1 is null or now() > d1) and d2 is not null and now() <= d2),
    'phase1_ends', d1, 'phase2_ends', d2)
  from d
$$;

-- Finalisierung: der Schlüssel heißt jetzt anders, und es gibt nur noch zwei Phasen.
create or replace function shop_phase_deadline_key(p_phase integer) returns text
language sql immutable set search_path = public, extensions as $$
  select case p_phase when 1 then 'shop_phase1_end' when 2 then 'shop_phase2_end' else null end
$$;
revoke execute on function shop_phase_deadline_key(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) Zugang nur mit Messestand

-- Was als Messestand zählt (Konrad, 17.09.): eine gebuchte Standfläche, die Standbühne, oder
-- ein Stand, den das Team von Hand zugewiesen hat. Der Hackathon-Stand zählt **nicht** — er
-- trägt `format_key = 'hackathon'` und fällt damit aus dieser Prüfung heraus, ohne dass hier
-- eine SKU stehen muss.
create or replace function org_has_booth(p_org_edition_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
      select 1 from org_product op join product p on p.sku = op.product_sku
       where op.org_edition_id = p_org_edition_id and op.status = 'booked'
         and p.format_key in ('booth', 'stage'))
      or exists (select 1 from booth b where b.org_edition_id = p_org_edition_id)
$$;
comment on function org_has_booth(uuid) is
  'Hat diese Organisation einen Messestand? Standfläche oder Standbühne als gebuchtes Produkt, oder ein vom Team zugewiesener Stand. Steuert den Zugang zum Messeshop (PART-037).';
revoke execute on function org_has_booth(uuid) from public, anon;

-- Ausnahme vom Zugang: Artikel, die über einen Checklistenpunkt bestellt werden, darf jeder
-- Partner kaufen — sonst wäre das Lunch-Paket für Partner ohne Stand unerreichbar, und genau
-- das soll PART-049 verhindern. Die Ausnahme steht **an den Daten** (`fulfilled_by_sku`), nicht
-- als SKU-Liste im Code: was künftig als Pflicht bestellbar wird, ist automatisch erlaubt.
create or replace function shop_sku_via_deliverable(p_org_edition_id uuid, p_sku text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from deliverable d join deliverable_template t on t.id = d.template_id
     where d.org_edition_id = p_org_edition_id
       and t.fulfilled_by_sku = p_sku
       and d.status <> 'not_required')
$$;
revoke execute on function shop_sku_via_deliverable(uuid, text) from public, anon;

create or replace function shop_catalogue(p_org_id uuid, p_edition_id uuid default null)
returns table (sku text, name_de text, name_en text, description_de text, description_en text, category text, unit text, net_price_cents integer, vat_rate numeric,
               images jsonb, shop_hint_de text, shop_hint_en text, merch_config jsonb, late_orderable boolean, available_until timestamptz,
               stock_available integer, track_stock boolean, request_only boolean, orderable boolean, shop_sort integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_phase jsonb; v_p integer; v_late boolean;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  -- Ohne Stand kein Katalog (PART-037). Kein Fehler, sondern eine leere Liste: die Seite
  -- erklärt es, und das Team sieht in `shop_catalogue` für eine fremde Org weiterhin alles.
  if not (org_has_booth(v_oe.id) or is_partner_team()) then return; end if;
  v_phase := shop_phase(v_oe.edition_id); v_p := (v_phase->>'phase')::integer; v_late := (v_phase->>'late_only')::boolean;
  return query
    select p.sku, p.name_de, p.name_en, p.description_de, p.description_en, p.category, p.unit, p.net_price_cents, p.vat_rate, p.images, p.shop_hint_de, p.shop_hint_en,
           p.merch_config, p.late_orderable, p.available_until, shop_stock_available(p.sku), p.track_stock,
           (coalesce(p.net_price_cents, 0) = 0),
           (v_p > 0 and coalesce(p.net_price_cents, 0) > 0 and (not v_late or p.late_orderable) and (p.available_until is null or p.available_until > now())
            and (not p.track_stock or coalesce(shop_stock_available(p.sku), 0) > 0)),
           p.shop_sort
    from product p
    where p.active and p.shop_visible and (p.edition_id is null or p.edition_id = v_oe.edition_id)
    order by p.shop_sort nulls last, p.category, p.name_de;
end $$;

-- `shop_upsert_line` prüft den Zugang zusätzlich je Artikel: ohne Stand geht nur, was an einer
-- Pflicht hängt. Grundlage ist die Fassung aus 0061 (Bestandsprüfung beim Einlegen).
create or replace function shop_upsert_line(p_org_id uuid, p_sku text, p_qty numeric, p_merch_config jsonb default null, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_phase jsonb; v_p integer; v_late boolean; v_o shop_order; v_pr product; v_free integer; v_other integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  v_phase := shop_phase(v_oe.edition_id); v_p := (v_phase->>'phase')::integer; v_late := (v_phase->>'late_only')::boolean;
  if v_p = 0 then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  -- Zugang (PART-037/049): Stand, oder der Artikel hängt an einer Pflicht dieser Org.
  if not (org_has_booth(v_oe.id) or shop_sku_via_deliverable(v_oe.id, p_sku)) then
    raise exception 'booth_required' using errcode = 'P0001', detail = p_sku;
  end if;
  select * into v_pr from product where sku = p_sku and active;
  if not found then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
  -- `shop_visible` ist die Sichtbarkeit im Katalog. Ein Artikel, der über eine Pflicht
  -- bestellt wird, darf unsichtbar sein (Lunch-Paket, PART-049) — dann entscheidet die Pflicht.
  if not v_pr.shop_visible and not shop_sku_via_deliverable(v_oe.id, p_sku) then
    raise exception 'unknown_sku' using errcode = '22023', detail = p_sku;
  end if;
  if coalesce(v_pr.net_price_cents, 0) = 0 then raise exception 'request_only' using errcode = '22023', detail = p_sku; end if;
  if v_late and not v_pr.late_orderable then raise exception 'late_only' using errcode = 'P0001', detail = p_sku; end if;
  if v_pr.available_until is not null and v_pr.available_until <= now() then raise exception 'not_available' using errcode = 'P0001', detail = p_sku; end if;
  if v_pr.edition_id is not null and v_pr.edition_id <> v_oe.edition_id then raise exception 'wrong_edition' using errcode = '22023', detail = p_sku; end if;
  select * into v_o from shop_order where org_edition_id = v_oe.id and phase = v_p and status in ('draft', 'pending', 'editing') for update;
  if not found then
    if coalesce(p_qty, 0) <= 0 then raise exception 'empty_order' using errcode = '22023'; end if;
    insert into shop_order (org_edition_id, order_no, phase, status, created_by)
    values (v_oe.id, 'MS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('shop_order_seq')::text, 4, '0'), v_p, 'draft', v_me) returning * into v_o;
  elsif v_o.status = 'pending' then
    raise exception 'order_pending' using errcode = 'P0001', detail = v_o.id::text;
  end if;
  -- Bestand sofort prüfen (0061): die eigene Reservierung dieser Bestellung zählt nicht gegen sich.
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

-- ---------------------------------------------------------------- 3) Lunch-Paket (PART-049)

-- Der Artikel verschwindet aus dem Katalog, bleibt aber bestellbar — über die Pflicht.
-- `late_orderable` bleibt gesetzt, damit er bis zur zweiten Frist geht (Bedingung 2).
update product set shop_visible = false where sku = 'I-79520';

-- Die Pflicht galt nur für Standflächen. Jetzt hat sie jeder Partner: Konrad will, dass alle
-- sie sehen. `required = false`, weil niemand Essen kaufen *muss* — sie zählt damit nicht in
-- die Vollständigkeit der Checkliste und löst keine Überfälligkeit aus (Bedingung 3).
update deliverable_template
   set category = null,
       required = false,
       label_de = 'Lunch-Paket fürs Team vor Ort',
       label_en = 'Lunch package for your team on site',
       description_de = 'Verpflegung für alle, die für euch vor Ort sind — an beiden Tagen. Ihr bestellt es direkt hier; es läuft über denselben Weg wie eure Messeshop-Bestellungen.',
       description_en = 'Catering for everyone working for you on site, on both days. Order it right here; it goes through the same route as your trade fair shop orders.'
 where key = 'lunch_package';

-- Die Pflicht entsteht bisher nur bei Standflächen-Orgs. Für alle übrigen anlegen.
select sync_deliverables(oe.id) from org_edition oe
  join event e on e.id = oe.edition_id
 where e.is_edition and coalesce(e.end_date, current_date) >= current_date;

-- Eine schon erzeugte Pflicht behält ihren Status; `overdue` ergibt bei einem Angebot keinen
-- Sinn mehr und wird zurückgenommen.
update deliverable d
   set status = 'open'
  from deliverable_template t
 where d.template_id = t.id and t.key = 'lunch_package' and d.status = 'overdue';

-- Bestellen am Checklistenpunkt. **Derselbe Weg, andere Tür:** die Funktion schreibt nicht
-- selbst auf `shop_order`, sondern ruft die bestehenden RPCs auf. Phasenprüfung, Lagerbuch,
-- PO-Nummer, Bestätigungsmail und die Produktionsliste je Stand laufen damit unverändert mit.
create or replace function order_lunch_package(p_org_id uuid, p_qty integer, p_edition_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_order uuid; v_sku text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'invalid_qty' using errcode = '22023', detail = coalesce(p_qty::text, 'null'); end if;

  -- Welcher Artikel das Lunch-Paket ist, steht an der Vorlage — nicht hier.
  select t.fulfilled_by_sku into v_sku from deliverable_template t where t.key = 'lunch_package' and t.active;
  if v_sku is null then raise exception 'deliverable_not_found' using errcode = 'P0002', detail = 'lunch_package'; end if;

  v_order := shop_upsert_line(p_org_id, v_sku, p_qty, null, p_edition_id);
  -- Bestätigen macht die Bestellung verbindlich und setzt die Pflicht über den Trigger aus
  -- 0054 auf `accepted`. Eine offene Bestellung derselben Phase nimmt die Zeile mit auf.
  perform shop_confirm(v_order, null, null);
  perform log_audit('shop.lunch_package', 'shop_order', v_order::text, null,
                    jsonb_build_object('org_id', p_org_id, 'sku', v_sku, 'qty', p_qty));
  return jsonb_build_object('order_id', v_order, 'sku', v_sku, 'qty', p_qty);
end $$;

-- ---------------------------------------------------------------- 4) Finalisierung auf zwei Phasen
--
-- Nur der Frist-Schlüssel ändert sich. Grundlage ist die Live-Fassung aus 0048 mit
-- Lagerabgleich, Konflikt-Protokoll und der Abschlussmail an Bestätigende und Hauptkontakt —
-- die dürfen hier nicht verloren gehen.

create or replace function run_shop_finalization() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_completed integer := 0; v_cancelled integer := 0; v_primary uuid; m record; v_locale text; v_org_name text; v_lines_de text; v_lines_en text; v_tot record;
begin
  for r in
    select o.*, oe.org_id, oe.edition_id
    from shop_order o join org_edition oe on oe.id = o.org_edition_id
    where o.status in ('draft', 'pending', 'editing')
      and exists (select 1 from deadline d
                   where d.edition_id = oe.edition_id
                     and d.key = shop_phase_deadline_key(o.phase)
                     and d.due_at < now())
    order by o.created_at
  loop
    if r.status = 'draft' or not exists (select 1 from shop_order_line where order_id = r.id) then
      perform shop_reconcile_ledger(r.id, true);
      update shop_order set status = 'cancelled', cancelled_at = now() where id = r.id;
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
      perform queue_mail('shop_order_completed', m.pid,
                         jsonb_build_object('org_name', v_org_name, 'order_no', r.order_no, 'phase', r.phase,
                                            'lines', case when v_locale = 'en' then v_lines_en else v_lines_de end, 'total_net', fmt_cents(v_tot.net_cents::integer, v_locale)),
                         'shop_order', r.id);
    end loop;
  end loop;
  if v_completed > 0 or v_cancelled > 0 then
    insert into audit_log (action, object_type, object_id, after) values ('shop.finalize', 'system', 'cron', jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled));
  end if;
  return jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled);
end $$;
revoke execute on function run_shop_finalization() from public, anon, authenticated;

select harden_definer_functions();
