-- 0048 · Welle 3 A9: Messeshop-Backend. Bestellungen je Org × Edition × Phase (Entwurf → bestätigt → ggf. Bearbeitung → zur Frist verbindlich), Zeilen mit
-- Snapshots (Name, Kategorie, Einheit, USt, Nettopreis), Bestand ausschließlich über das Lagerbuch (append-only; verfügbar = stock_total + Σ delta),
-- Phasen aus deadline (shop_phase_1/2/3; Phase 3 nur late_orderable — Entscheidung 2), serverseitig in jeder Schreib-RPC; Anfrage-Produkte (Preis 0)
-- über shop_request statt Kauf; Finalisierung idempotent im Partner-Housekeeping; Team-RPCs für Support und Reporting (nur completed).
-- Abweichung zum Arbeitsauftrag: keine Rolle `shop` (Entscheidung 1 kennt primary_ops/additional/signing/event_app_member) — bestellen dürfen
-- primary_ops, additional, signing (partner_can_edit); lesen alle Mitglieder.
set search_path = public, extensions;

create sequence if not exists shop_order_seq;

create table if not exists shop_order (
  id             uuid primary key default gen_random_uuid(),
  org_edition_id uuid not null references org_edition (id) on delete cascade,
  order_no       text not null unique,
  phase          integer not null check (phase in (1, 2, 3)),
  status         text not null default 'draft' check (status in ('draft', 'pending', 'editing', 'completed', 'cancelled')),
  note           text,
  internal_note  text,
  created_by     uuid references person (id) on delete set null,
  confirmed_by   uuid references person (id) on delete set null,
  confirmed_at   timestamptz,
  completed_at   timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists shop_order_active_uidx on shop_order (org_edition_id, phase) where status in ('draft', 'pending', 'editing');
create index if not exists shop_order_status_idx on shop_order (status, phase);
comment on table shop_order is 'Messeshop-Bestellung je Partner × Edition × Phase; MS-JJJJ-NNNN; eine aktive je Org und Phase.';
drop trigger if exists trg_shop_order_updated on shop_order;
create trigger trg_shop_order_updated before update on shop_order for each row execute function set_updated_at();

create table if not exists shop_order_line (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references shop_order (id) on delete cascade,
  product_sku     text not null references product (sku),
  name_de         text not null,
  name_en         text,
  category        text,
  unit            text,
  vat_rate        numeric not null default 7,
  price_net_cents integer not null default 0 check (price_net_cents >= 0),
  qty             numeric not null check (qty > 0),
  merch_config    jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (order_id, product_sku)
);
comment on table shop_order_line is 'Bestellzeile mit Snapshot der Produktdaten zum Zeitpunkt der Bestätigung.';
drop trigger if exists trg_shop_order_line_updated on shop_order_line;
create trigger trg_shop_order_line_updated before update on shop_order_line for each row execute function set_updated_at();

create table if not exists stock_ledger (
  id          bigint generated always as identity primary key,
  product_sku text not null references product (sku),
  order_id    uuid references shop_order (id) on delete set null,
  delta       integer not null,
  comment     text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists stock_ledger_sku_idx on stock_ledger (product_sku);
create index if not exists stock_ledger_order_idx on stock_ledger (order_id);
comment on table stock_ledger is 'Lagerbuch, nur anhängen: Reservierung (negativ) und Freigabe (positiv) je Bestellung; Team-Korrekturen ohne Bestellung.';

create table if not exists shop_request (
  id             uuid primary key default gen_random_uuid(),
  org_edition_id uuid not null references org_edition (id) on delete cascade,
  product_sku    text references product (sku),
  text           text not null,
  status         text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answer         text,
  answered_by    uuid references person (id) on delete set null,
  answered_at    timestamptz,
  created_by     uuid references person (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists trg_shop_request_updated on shop_request;
create trigger trg_shop_request_updated before update on shop_request for each row execute function set_updated_at();

-- Rechte: Mitglieder lesen ihre Bestellungen und Anfragen, alles Schreiben über RPCs; Lagerbuch nur intern
alter table shop_order enable row level security;
alter table shop_order_line enable row level security;
alter table stock_ledger enable row level security;
alter table shop_request enable row level security;
drop policy if exists shop_order_read on shop_order;
create policy shop_order_read on shop_order for select to authenticated
  using (exists (select 1 from org_edition oe where oe.id = org_edition_id and (is_partner_of(oe.org_id) or is_staff())));
drop policy if exists shop_order_line_read on shop_order_line;
create policy shop_order_line_read on shop_order_line for select to authenticated
  using (exists (select 1 from shop_order o join org_edition oe on oe.id = o.org_edition_id where o.id = order_id and (is_partner_of(oe.org_id) or is_staff())));
drop policy if exists shop_request_read on shop_request;
create policy shop_request_read on shop_request for select to authenticated
  using (exists (select 1 from org_edition oe where oe.id = org_edition_id and (is_partner_of(oe.org_id) or is_staff())));
revoke all on shop_order, shop_order_line, stock_ledger, shop_request from anon, authenticated;
grant select on shop_order, shop_order_line, shop_request to authenticated;
grant select, insert, update, delete on shop_order, shop_order_line, shop_request to service_role;
grant select, insert on stock_ledger to service_role;

-- Phasen aus den Fristen der Edition
create or replace function shop_phase(p_edition_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with d as (
    select max(due_at) filter (where key = 'shop_phase_1') as d1,
           max(due_at) filter (where key = 'shop_phase_2') as d2,
           max(due_at) filter (where key = 'shop_phase_3') as d3
    from deadline where edition_id = p_edition_id
  )
  select jsonb_build_object(
    'phase', case when d1 is not null and now() <= d1 then 1 when d2 is not null and now() <= d2 then 2 when d3 is not null and now() <= d3 then 3 else 0 end,
    'ends_at', case when d1 is not null and now() <= d1 then d1 when d2 is not null and now() <= d2 then d2 when d3 is not null and now() <= d3 then d3 else null end,
    'late_only', ((d1 is null or now() > d1) and (d2 is null or now() > d2) and d3 is not null and now() <= d3),
    'phase1_ends', d1, 'phase2_ends', d2, 'phase3_ends', d3)
  from d
$$;

create or replace function shop_phase_info(p_org_id uuid, p_edition_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  return shop_phase(v_oe.edition_id);
end $$;

-- Bestand: nur für Produkte mit track_stock; verfügbar = stock_total + Σ Lagerbuch
create or replace function shop_stock_available(p_sku text) returns integer
language sql stable security definer set search_path = public, extensions as $$
  select case when p.track_stock then coalesce(p.stock_total, 0) + coalesce((select sum(l.delta) from stock_ledger l where l.product_sku = p.sku), 0)::integer else null end
  from product p where p.sku = p_sku
$$;
revoke execute on function shop_stock_available(text) from public, anon, authenticated;

create or replace function shop_order_reserved(p_order_id uuid, p_sku text) returns integer
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(-sum(l.delta), 0)::integer from stock_ledger l where l.order_id = p_order_id and l.product_sku = p_sku
$$;
revoke execute on function shop_order_reserved(uuid, text) from public, anon, authenticated;

-- Lagerbuch an die Bestellung anpassen: p_release ⇒ alles freigeben; sonst Reservierung = Zeilenmenge (Delta-bewusst, prüft Verfügbarkeit)
create or replace function shop_reconcile_ledger(p_order_id uuid, p_release boolean) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_n integer := 0; v_target integer; v_reserved integer; v_diff integer; v_avail integer;
begin
  if p_release then
    for r in select l.product_sku, -sum(l.delta)::integer as reserved from stock_ledger l where l.order_id = p_order_id group by l.product_sku having -sum(l.delta) <> 0 loop
      insert into stock_ledger (product_sku, order_id, delta, comment, created_by) values (r.product_sku, p_order_id, r.reserved, 'release', current_person_id());
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;
  -- Zeilen, die nicht mehr da sind, freigeben
  for r in select l.product_sku, -sum(l.delta)::integer as reserved from stock_ledger l where l.order_id = p_order_id
           and not exists (select 1 from shop_order_line sl where sl.order_id = p_order_id and sl.product_sku = l.product_sku)
           group by l.product_sku having -sum(l.delta) <> 0 loop
    insert into stock_ledger (product_sku, order_id, delta, comment, created_by) values (r.product_sku, p_order_id, r.reserved, 'line removed', current_person_id());
    v_n := v_n + 1;
  end loop;
  for r in select sl.product_sku, sl.qty from shop_order_line sl join product p on p.sku = sl.product_sku where sl.order_id = p_order_id and p.track_stock loop
    v_target := ceil(r.qty)::integer;
    v_reserved := shop_order_reserved(p_order_id, r.product_sku);
    v_diff := v_target - v_reserved;
    if v_diff > 0 then
      v_avail := shop_stock_available(r.product_sku);
      if v_avail is not null and v_avail < v_diff then raise exception 'out_of_stock' using errcode = 'P0001', detail = r.product_sku || ':' || v_avail::text; end if;
    end if;
    if v_diff <> 0 then
      insert into stock_ledger (product_sku, order_id, delta, comment, created_by) values (r.product_sku, p_order_id, -v_diff, case when v_diff > 0 then 'reserve' else 'reduce' end, current_person_id());
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function shop_reconcile_ledger(uuid, boolean) from public, anon, authenticated;

create or replace function shop_order_org(p_order_id uuid) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select oe.org_id from shop_order o join org_edition oe on oe.id = o.org_edition_id where o.id = p_order_id
$$;
revoke execute on function shop_order_org(uuid) from public, anon, authenticated;

create or replace function shop_order_lines_json(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('sku', sl.product_sku, 'name_de', sl.name_de, 'name_en', sl.name_en, 'category', sl.category, 'unit', sl.unit,
                                                 'vat_rate', sl.vat_rate, 'price_net_cents', sl.price_net_cents, 'qty', sl.qty,
                                                 'line_net_cents', round(sl.qty * sl.price_net_cents)::integer, 'merch_config', sl.merch_config) order by sl.created_at), '[]'::jsonb)
  from shop_order_line sl where sl.order_id = p_order_id
$$;
revoke execute on function shop_order_lines_json(uuid) from public, anon, authenticated;

create or replace function shop_order_totals(p_order_id uuid) returns table (net_cents bigint, vat_cents bigint, gross_cents bigint)
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(sum(round(sl.qty * sl.price_net_cents)), 0)::bigint,
         coalesce(sum(round(sl.qty * sl.price_net_cents * sl.vat_rate / 100)), 0)::bigint,
         coalesce(sum(round(sl.qty * sl.price_net_cents)) + sum(round(sl.qty * sl.price_net_cents * sl.vat_rate / 100)), 0)::bigint
  from shop_order_line sl where sl.order_id = p_order_id
$$;
revoke execute on function shop_order_totals(uuid) from public, anon, authenticated;

-- Katalog (S2: keine Rollentrennung, alle Mitglieder sehen dasselbe)
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

-- Zeile setzen (qty ≤ 0 entfernt); legt den Entwurf der laufenden Phase an
create or replace function shop_upsert_line(p_org_id uuid, p_sku text, p_qty numeric, p_merch_config jsonb default null, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_phase jsonb; v_p integer; v_late boolean; v_o shop_order; v_pr product;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  v_phase := shop_phase(v_oe.edition_id); v_p := (v_phase->>'phase')::integer; v_late := (v_phase->>'late_only')::boolean;
  if v_p = 0 then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  select * into v_pr from product where sku = p_sku and active and shop_visible;
  if not found then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
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

create or replace function shop_remove_line(p_order_id uuid, p_sku text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_o shop_order;
begin
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'editing') then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  delete from shop_order_line where order_id = p_order_id and product_sku = p_sku;
  update shop_order set updated_at = now() where id = p_order_id;
end $$;

-- Bestätigen: Snapshots aktualisieren, Bestand reservieren, Mail an Bestätigende + Hauptkontakt
create or replace function shop_confirm(p_order_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_o shop_order; v_org uuid; v_oe org_edition; v_phase jsonb; v_org_name text; v_primary uuid; r record; v_locale text;
        v_lines_de text; v_lines_en text; v_tot record; v_tz text;
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
  perform shop_reconcile_ledger(p_order_id, false);
  update shop_order set status = 'pending', confirmed_at = now(), confirmed_by = v_me, note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note) where id = p_order_id;
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
  perform log_audit('shop.confirm', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), jsonb_build_object('order_no', v_o.order_no, 'net_cents', v_tot.net_cents));
  return jsonb_build_object('order_id', p_order_id, 'order_no', v_o.order_no, 'net_cents', v_tot.net_cents, 'vat_cents', v_tot.vat_cents, 'gross_cents', v_tot.gross_cents);
end $$;

create or replace function shop_edit(p_order_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_o shop_order; v_oe org_edition;
begin
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status <> 'pending' then raise exception 'not_pending' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  if (shop_phase(v_oe.edition_id)->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  update shop_order set status = 'editing' where id = p_order_id;
  perform log_audit('shop.edit', 'shop_order', p_order_id::text, null, null);
end $$;

create or replace function shop_cancel(p_order_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_o shop_order; v_oe org_edition;
begin
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'pending', 'editing') then raise exception 'not_cancellable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  if (shop_phase(v_oe.edition_id)->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  perform shop_reconcile_ledger(p_order_id, true);
  update shop_order set status = 'cancelled', cancelled_at = now() where id = p_order_id;
  perform log_audit('shop.cancel', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), null);
end $$;

create or replace function shop_my_orders(p_org_id uuid, p_edition_id uuid default null)
returns table (id uuid, order_no text, phase integer, status text, note text, confirmed_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
               net_cents bigint, vat_cents bigint, gross_cents bigint, lines jsonb, editable boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_p integer;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  v_p := (shop_phase(v_oe.edition_id)->>'phase')::integer;
  return query
    select o.id, o.order_no, o.phase, o.status, o.note, o.confirmed_at, o.completed_at, o.cancelled_at, t.net_cents, t.vat_cents, t.gross_cents,
           shop_order_lines_json(o.id), (o.status in ('draft', 'editing', 'pending') and o.phase = v_p), o.created_at, o.updated_at
    from shop_order o cross join lateral shop_order_totals(o.id) t
    where o.org_edition_id = v_oe.id
    order by o.created_at desc;
end $$;

create or replace function shop_request_product(p_org_id uuid, p_text text, p_sku text default null, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_id uuid; v_org_name text; v_product text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_text, '')), '') is null then raise exception 'text_required' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if p_sku is not null and not exists (select 1 from product where sku = p_sku) then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
  insert into shop_request (org_edition_id, product_sku, text, created_by) values (v_oe.id, p_sku, btrim(p_text), v_me) returning id into v_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
  select name_de into v_product from product where sku = p_sku;
  perform notify_partner_leads('shop_request_received', jsonb_build_object('org_name', v_org_name, 'product', coalesce(v_product, '–'), 'text', btrim(p_text)), 'shop_request', v_id);
  perform log_audit('shop.request', 'shop_request', v_id::text, null, jsonb_build_object('org_id', p_org_id, 'sku', p_sku));
  return v_id;
end $$;

-- Finalisierung zur Frist (idempotent): bestätigte Bestellungen einer beendeten Phase werden verbindlich, nie bestätigte Entwürfe verfallen
create or replace function run_shop_finalization() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_completed integer := 0; v_cancelled integer := 0; v_primary uuid; m record; v_locale text; v_org_name text; v_lines_de text; v_lines_en text; v_tot record;
begin
  for r in
    select o.*, oe.org_id, oe.edition_id
    from shop_order o join org_edition oe on oe.id = o.org_edition_id
    where o.status in ('draft', 'pending', 'editing')
      and exists (select 1 from deadline d where d.edition_id = oe.edition_id and d.key = 'shop_phase_' || o.phase::text and d.due_at < now())
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

create or replace function run_partner_housekeeping() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_refreshed integer; v_overdue integer; v_digests integer; v_shop jsonb;
begin
  v_refreshed := refresh_deliverable_due();
  v_overdue := mark_overdue_deliverables();
  v_digests := send_partner_reminders();
  v_shop := run_shop_finalization();
  return jsonb_build_object('refreshed', v_refreshed, 'overdue', v_overdue, 'digests', v_digests, 'shop', v_shop);
end $$;
revoke execute on function run_partner_housekeeping() from public, anon, authenticated;

-- Team: Übersicht, Support-Eingriffe (Audit), Anfragen, Report (nur completed)
create or replace function shop_orders_admin(p_edition_id uuid default null)
returns table (id uuid, order_no text, org_id uuid, org_name text, edition_id uuid, phase integer, status text, note text, internal_note text, confirmed_at timestamptz,
               completed_at timestamptz, cancelled_at timestamptz, net_cents bigint, vat_cents bigint, gross_cents bigint, lines jsonb, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.order_no, oe.org_id, coalesce(org.communication_name, org.legal_name), oe.edition_id, o.phase, o.status, o.note, o.internal_note, o.confirmed_at,
           o.completed_at, o.cancelled_at, t.net_cents, t.vat_cents, t.gross_cents, shop_order_lines_json(o.id), o.created_at, o.updated_at
    from shop_order o join org_edition oe on oe.id = o.org_edition_id join organization org on org.id = oe.org_id
    cross join lateral shop_order_totals(o.id) t
    where p_edition_id is null or oe.edition_id = p_edition_id
    order by case o.status when 'pending' then 0 when 'editing' then 1 when 'draft' then 2 when 'completed' then 3 else 4 end, o.updated_at desc;
end $$;

create or replace function shop_admin_set_line(p_order_id uuid, p_sku text, p_qty numeric, p_merch_config jsonb default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_o shop_order; v_pr product;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status = 'cancelled' then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
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

create or replace function shop_admin_set_status(p_order_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_o shop_order;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'editing', 'completed', 'cancelled') then raise exception 'invalid_status' using errcode = '22023', detail = p_status; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
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
                        internal_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), internal_note)
   where id = p_order_id;
  perform log_audit('shop.admin_status', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), jsonb_build_object('status', p_status, 'note', p_note));
end $$;

create or replace function shop_requests_admin(p_edition_id uuid default null)
returns table (id uuid, org_id uuid, org_name text, product_sku text, product_name text, text text, status text, answer text, created_by_name text, created_at timestamptz, answered_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, oe.org_id, coalesce(org.communication_name, org.legal_name), r.product_sku, p.name_de, r.text, r.status, r.answer,
           (select btrim(coalesce(pe.first_name, '') || ' ' || coalesce(pe.last_name, '')) from person pe where pe.id = r.created_by), r.created_at, r.answered_at
    from shop_request r join org_edition oe on oe.id = r.org_edition_id join organization org on org.id = oe.org_id left join product p on p.sku = r.product_sku
    where p_edition_id is null or oe.edition_id = p_edition_id
    order by case r.status when 'open' then 0 else 1 end, r.created_at desc;
end $$;

create or replace function shop_request_answer(p_id uuid, p_answer text, p_status text default 'answered') returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('answered', 'closed', 'open') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update shop_request set answer = nullif(btrim(coalesce(p_answer, '')), ''), status = p_status, answered_by = current_person_id(), answered_at = now() where id = p_id;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  perform log_audit('shop.request_answer', 'shop_request', p_id::text, null, jsonb_build_object('status', p_status));
end $$;

create or replace function shop_report(p_edition_id uuid)
returns table (sku text, name_de text, category text, unit text, qty_total numeric, net_total_cents bigint, orders integer, orgs integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select sl.product_sku, max(sl.name_de), max(sl.category), max(sl.unit), sum(sl.qty), sum(round(sl.qty * sl.price_net_cents))::bigint,
           count(distinct o.id)::integer, count(distinct oe.org_id)::integer
    from shop_order_line sl join shop_order o on o.id = sl.order_id join org_edition oe on oe.id = o.org_edition_id
    where o.status = 'completed' and oe.edition_id = p_edition_id
    group by sl.product_sku
    order by max(sl.category), max(sl.name_de);
end $$;

-- Mails
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('shop_order_confirmed', 'de', 1, 'Bestellung {{order_no}} bestätigt – {{org_name}}',
   E'Hallo {{first_name}},\n\neure Bestellung **{{order_no}}** (Phase {{phase}}) ist eingegangen:\n\n{{lines}}\n\nSumme netto: **{{total_net}}** zzgl. USt.\n\nBis **{{ends_at}}** könnt ihr die Bestellung im Portal noch ändern oder stornieren; danach ist sie verbindlich. Die Rechnung kommt nach dem Summit über SevDesk.\n\n[Zum Messeshop]({{portal_url}}/partner/shop)\n\nViele Grüße\nChefTreff',
   'Bestätigung einer Shop-Bestellung (an Bestätigende + Hauptkontakt)', true),
  ('shop_order_confirmed', 'en', 1, 'Order {{order_no}} confirmed – {{org_name}}',
   E'Hi {{first_name}},\n\nwe received your order **{{order_no}}** (phase {{phase}}):\n\n{{lines}}\n\nNet total: **{{total_net}}** plus VAT.\n\nUntil **{{ends_at}}** you can still change or cancel the order in the portal; after that it is binding. The invoice follows after the summit via SevDesk.\n\n[Open the shop]({{portal_url}}/partner/shop)\n\nBest,\nChefTreff',
   'Confirmation of a shop order (submitter + primary contact)', true),
  ('shop_order_completed', 'de', 1, 'Bestellung {{order_no}} ist verbindlich – {{org_name}}',
   E'Hallo {{first_name}},\n\ndie Bestellfrist ist vorbei, eure Bestellung **{{order_no}}** (Phase {{phase}}) ist damit verbindlich:\n\n{{lines}}\n\nSumme netto: **{{total_net}}** zzgl. USt. Rechnung nach dem Summit über SevDesk.\n\n[Zur Bestellhistorie]({{portal_url}}/partner/shop)\n\nViele Grüße\nChefTreff',
   'Bestellung zur Frist verbindlich (Finalisierung im Housekeeping)', true),
  ('shop_order_completed', 'en', 1, 'Order {{order_no}} is now binding – {{org_name}}',
   E'Hi {{first_name}},\n\nthe ordering deadline has passed, so your order **{{order_no}}** (phase {{phase}}) is binding:\n\n{{lines}}\n\nNet total: **{{total_net}}** plus VAT. Invoice after the summit via SevDesk.\n\n[Order history]({{portal_url}}/partner/shop)\n\nBest,\nChefTreff',
   'Order became binding at the deadline (housekeeping)', true),
  ('shop_request_received', 'de', 1, 'Messeshop-Anfrage: {{org_name}}',
   E'Hallo {{first_name}},\n\n{{org_name}} fragt im Messeshop an — Produkt: **{{product}}**\n\n{{text}}\n\nAntwort im Admin unter Messeshop → Anfragen: [Admin]({{portal_url}}/admin/partner)\n\nChefTreff-Plattform',
   'Interne Mail an area_lead_partner (Fallback Admins) bei einer Anfrage aus dem Shop', true),
  ('shop_request_received', 'en', 1, 'Shop request: {{org_name}}',
   E'Hi {{first_name}},\n\n{{org_name}} sent a request in the shop — product: **{{product}}**\n\n{{text}}\n\nAnswer in the admin under shop → requests: [Admin]({{portal_url}}/admin/partner)\n\nChefTreff platform',
   'Internal mail to area_lead_partner (fallback admins) for a shop request', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
