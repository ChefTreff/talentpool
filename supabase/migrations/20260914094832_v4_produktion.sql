-- 0082 · Produktion: Regie-Ablaufplan und Stand-Checkliste (Welle 4 A4).
--
-- **Abweichung vom Arbeitsauftrag, bewusst:** dort steht „`regie_cue` je Slot".
-- Die Vorlage aus 2026 (`docs/vorlagen/regie-2026-main-stage-fr.csv`) zeigt,
-- dass das zu eng ist: die Hälfte der Zeilen hat gar keinen Slot —
-- „Besprechung Technik und Team", „Soundcheck Moderator", „DOORS OPEN",
-- „Einlass", „Puffer", „Einspielen Countdown-Video". Ein Ablaufplan, der nur
-- Sessions kennt, wäre am ersten Tag unbrauchbar. Deshalb hängt ein Cue an
-- **Bühne × Tag**, und `slot_id` ist optional: ist es gesetzt, zieht die
-- Ansicht Titel, Format und Speaker aus der Session, statt sie abzuschreiben.
--
-- Die Spalten folgen den Spalten der Vorlage: Start, Dauer, Ende, Aktion,
-- Moderation, Regie, Backstage, Mobiliar, Notizen. Mikros und Medien bleiben
-- `jsonb` wie im Auftrag.
--
-- Dazu die Stand-Checkliste: was ein Partner gebucht hat (`org_product`),
-- abgehakt je Position (`booth_service_check`). Und `product.supplier` wird
-- vom Freitext zum Vokabular, damit die Exportliste je Dienstleister nicht an
-- „PartyRent" vs. „Party Rent" scheitert.
--
-- Fehlerschlüssel: 42501 (fremder Bereich), P0002 `<x>_not_found`,
-- 22023 `invalid_<x>`, P0001 `supplier_unknown` / `supplier_required`.
--
-- Abweichungen: `regie_cue` an Bühne × Tag statt je Slot (oben begründet).
-- Review Architektur-Session 14.09.2026: `is_production_team()` ohne
-- `programme_team` — der Bereich `/produktion` kennt nur `production_team` und
-- seine Leitung, und die Einkaufspreise in `supplier_order_list` gehen das
-- Programm-Team nichts an. `slot_id` muss zu Bühne und Tag des Cues gehören.
-- Trigger-Funktion ohne EXECUTE für authenticated (db-konventionen §4).
set search_path = public, extensions;

-- ---------------------------------------------------------------- Dienstleister

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select 'supplier',
       lower(regexp_replace(s.supplier, '[^A-Za-z0-9]+', '_', 'g')),
       s.supplier, s.supplier,
       row_number() over (order by s.supplier),
       true
  from (select distinct btrim(supplier) as supplier from product
         where supplier is not null and btrim(supplier) <> '') s
on conflict (vocabulary, key) do nothing;

-- Freitext auf die Schlüssel ziehen, bevor die Prüfung greift.
update product p
   set supplier = lower(regexp_replace(btrim(p.supplier), '[^A-Za-z0-9]+', '_', 'g'))
 where p.supplier is not null and btrim(p.supplier) <> '';

/**
 * Shop-Artikel brauchen einen Dienstleister aus dem Vokabular.
 *
 * Als Trigger und nicht als CHECK: eine Prüfung gegen `vocab_term` ist nicht
 * `immutable`, in einem CHECK wäre sie eine stille Lüge (Postgres prüft sie
 * beim Restore nicht neu). Dasselbe Muster wie bei `speaker_profile.pass_type`.
 */
create or replace function trg_product_supplier() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.supplier is not null and btrim(new.supplier) <> ''
     and not is_vocab_key('supplier', new.supplier) then
    raise exception 'supplier_unknown' using errcode = 'P0001',
      detail = format('%s steht nicht im Vokabular supplier', new.supplier);
  end if;
  if new.shop_visible and coalesce(btrim(new.supplier), '') = '' then
    raise exception 'supplier_required' using errcode = 'P0001',
      detail = 'Shop-Artikel brauchen einen Dienstleister';
  end if;
  return new;
end $$;
revoke execute on function trg_product_supplier() from public, anon, authenticated;

drop trigger if exists product_supplier_chk on product;
create trigger product_supplier_chk before insert or update of supplier, shop_visible
  on product for each row execute function trg_product_supplier();

-- ---------------------------------------------------------------- Regie

create table if not exists regie_cue (
  id               uuid primary key default gen_random_uuid(),
  stage_id         uuid not null references stage(id) on delete cascade,
  event_day_id     uuid not null references event_day(id) on delete cascade,
  -- Optional: viele Cues sind Ablauf, keine Session (siehe Kopf).
  slot_id          uuid references slot(id) on delete set null,
  cue_start        timestamptz not null,
  cue_end          timestamptz not null,
  sort_order       integer not null default 0,
  action           text not null,
  umbau_min        integer,
  moderation       text,
  regie            text,
  backstage        text,
  mobiliar         text,
  notes            text,
  mic_assignments  jsonb not null default '{}'::jsonb,
  media            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references person(id),
  updated_by       uuid references person(id),
  constraint regie_cue_time_chk check (cue_end >= cue_start),
  constraint regie_cue_umbau_chk check (umbau_min is null or umbau_min >= 0)
);

create index if not exists regie_cue_stage_day_idx on regie_cue (stage_id, event_day_id, cue_start, sort_order);
create index if not exists regie_cue_slot_idx on regie_cue (slot_id) where slot_id is not null;

comment on table regie_cue is
  'Ablaufplan je Bühne und Tag (Vorlage regie-2026). `slot_id` optional — Doors open und Puffer haben keine Session.';

create table if not exists booth_service_check (
  id              uuid primary key default gen_random_uuid(),
  org_edition_id  uuid not null references org_edition(id) on delete cascade,
  product_sku     text not null references product(sku) on delete cascade,
  checked_by      uuid references person(id),
  checked_at      timestamptz not null default now(),
  note            text,
  created_at      timestamptz not null default now(),
  unique (org_edition_id, product_sku)
);

comment on table booth_service_check is
  'Abgehakte Position der Stand-Checkliste. Eine Zeile je Stand und Artikel; fehlt sie, ist die Position offen.';

alter table regie_cue enable row level security;
alter table booth_service_check enable row level security;

-- Keine Grants für anon, keine Grants für authenticated: gelesen und
-- geschrieben wird ausschliesslich über die RPCs unten.
revoke all on regie_cue from anon, authenticated;
revoke all on booth_service_check from anon, authenticated;
grant all on regie_cue to service_role;
grant all on booth_service_check to service_role;

-- ---------------------------------------------------------------- Rechte

/**
 * Produktion: das Produktionsteam, seine Bereichsleitung, Admin.
 *
 * Bewusst **nicht** `is_staff()`: „Team" ist im Datenmodell weit (jede Person
 * mit einer Teamrolle). Regie-Notizen enthalten Namen und Hinweise wie
 * „Speaker kommt zu spät" — das geht nicht jeden an. Und bewusst ohne
 * `programme_team`: der Bereich `/produktion` steht nur der Produktion offen,
 * die Bestellliste nennt Einkaufspreise (Review 14.09.2026).
 */
create or replace function is_production_team() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('production_team')
      or has_role('area_lead_production')
$$;

comment on function is_production_team() is
  'Produktion, deren Bereichsleitung oder Admin — die einzigen Augen auf Regie, Stand-Checkliste und Bestellliste.';

-- ---------------------------------------------------------------- Regie lesen

create or replace function regie_view(p_stage_id uuid, p_event_day_id uuid)
returns table(
  cue_id uuid, cue_start timestamptz, cue_end timestamptz, sort_order integer,
  action text, umbau_min integer, moderation text, regie text, backstage text,
  mobiliar text, notes text, mic_assignments jsonb, media jsonb,
  slot_id uuid, slot_status text, session_id uuid, title text, format text,
  speakers jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.cue_start, c.cue_end, c.sort_order,
           c.action, c.umbau_min, c.moderation, c.regie, c.backstage,
           c.mobiliar, c.notes, c.mic_assignments, c.media,
           c.slot_id, sl.status, se.id,
           coalesce(se.title_de, se.title_en), se.format,
           case when se.id is null then '[]'::jsonb else session_speakers_public(se.id) end
      from regie_cue c
      left join slot sl on sl.id = c.slot_id
      left join session se on se.slot_id = sl.id
     where c.stage_id = p_stage_id and c.event_day_id = p_event_day_id
     order by c.cue_start, c.sort_order;
end $$;

/**
 * Slots des Tages, die noch in keinem Cue stehen — damit der Ablaufplan nicht
 * an einer Session vorbeiläuft, die im Board längst steht.
 */
create or replace function regie_open_slots(p_stage_id uuid, p_event_day_id uuid)
returns table(slot_id uuid, start_at timestamptz, end_at timestamptz, title text, format text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select sl.id, sl.start_at, sl.end_at, coalesce(se.title_de, se.title_en), se.format
      from slot sl
      left join session se on se.slot_id = sl.id
     where sl.stage_id = p_stage_id and sl.event_day_id = p_event_day_id
       and not exists (select 1 from regie_cue c where c.slot_id = sl.id)
     order by sl.start_at;
end $$;

-- ---------------------------------------------------------------- Regie schreiben

create or replace function upsert_regie_cue(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_stage uuid; v_day uuid; v_start timestamptz; v_end timestamptz;
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;

  v_id := nullif(p_data->>'id', '')::uuid;
  v_stage := nullif(p_data->>'stage_id', '')::uuid;
  v_day := nullif(p_data->>'event_day_id', '')::uuid;
  v_start := nullif(p_data->>'cue_start', '')::timestamptz;
  v_end := nullif(p_data->>'cue_end', '')::timestamptz;

  if v_id is null then
    if v_stage is null or v_day is null or v_start is null or v_end is null then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'stage_id, event_day_id, cue_start und cue_end sind Pflicht';
    end if;
    if not exists (select 1 from stage s join event_day d on d.event_id = s.event_id
                    where s.id = v_stage and d.id = v_day) then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'Bühne und Tag gehören zu verschiedenen Veranstaltungen';
    end if;
    if nullif(p_data->>'slot_id', '') is not null and not exists (
         select 1 from slot sl where sl.id = (p_data->>'slot_id')::uuid
            and sl.stage_id = v_stage and sl.event_day_id = v_day) then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'slot_id gehört nicht zu Bühne und Tag des Cues';
    end if;
    insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, sort_order,
                           action, umbau_min, moderation, regie, backstage, mobiliar, notes,
                           mic_assignments, media, created_by, updated_by)
    values (v_stage, v_day, nullif(p_data->>'slot_id', '')::uuid, v_start, v_end,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce(nullif(btrim(p_data->>'action'), ''), '—'),
            nullif(p_data->>'umbau_min', '')::integer,
            nullif(p_data->>'moderation', ''), nullif(p_data->>'regie', ''),
            nullif(p_data->>'backstage', ''), nullif(p_data->>'mobiliar', ''),
            nullif(p_data->>'notes', ''),
            coalesce(p_data->'mic_assignments', '{}'::jsonb),
            coalesce(p_data->'media', '{}'::jsonb),
            current_person_id(), current_person_id())
    returning id into v_id;
  else
    if p_data ? 'slot_id' and nullif(p_data->>'slot_id', '') is not null then
      select c.stage_id, c.event_day_id into v_stage, v_day from regie_cue c where c.id = v_id;
      if v_stage is null then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
      if not exists (select 1 from slot sl where sl.id = (p_data->>'slot_id')::uuid
                        and sl.stage_id = v_stage and sl.event_day_id = v_day) then
        raise exception 'invalid_cue' using errcode = '22023',
          detail = 'slot_id gehört nicht zu Bühne und Tag des Cues';
      end if;
    end if;
    -- Teilupdate über die mitgeschickten Schlüssel: was fehlt, bleibt stehen.
    update regie_cue set
      slot_id = case when p_data ? 'slot_id' then nullif(p_data->>'slot_id', '')::uuid else slot_id end,
      cue_start = coalesce(v_start, cue_start),
      cue_end = coalesce(v_end, cue_end),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      action = coalesce(nullif(btrim(p_data->>'action'), ''), action),
      umbau_min = case when p_data ? 'umbau_min' then nullif(p_data->>'umbau_min', '')::integer else umbau_min end,
      moderation = case when p_data ? 'moderation' then nullif(p_data->>'moderation', '') else moderation end,
      regie = case when p_data ? 'regie' then nullif(p_data->>'regie', '') else regie end,
      backstage = case when p_data ? 'backstage' then nullif(p_data->>'backstage', '') else backstage end,
      mobiliar = case when p_data ? 'mobiliar' then nullif(p_data->>'mobiliar', '') else mobiliar end,
      notes = case when p_data ? 'notes' then nullif(p_data->>'notes', '') else notes end,
      mic_assignments = coalesce(p_data->'mic_assignments', mic_assignments),
      media = coalesce(p_data->'media', media),
      updated_by = current_person_id(),
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  end if;

  perform log_audit('regie.cue_saved', 'regie_cue', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function delete_regie_cue(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from regie_cue where id = p_id;
  if not found then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  perform log_audit('regie.cue_deleted', 'regie_cue', p_id::text, null, null);
end $$;

-- ---------------------------------------------------------------- Stand-Checkliste

/**
 * Was ein Partner gebucht hat, Position für Position, mit Haken.
 *
 * Gezeigt werden nur Artikel, die am Stand ankommen: `shop_item` und `addon`.
 * `package` ist das Sponsoring-Paket selbst — nichts, was jemand anliefert und
 * abhakt.
 */
create or replace function booth_checklist(p_edition_id uuid, p_org_id uuid default null)
returns table(
  org_edition_id uuid, org_id uuid, org_name text, booth_number text,
  -- `qty` ist numeric(10,2), nicht integer. Eine RETURNS-TABLE-Spalte mit dem
  -- falschen Typ scheitert erst beim Aufruf (42804) — der Smoke-Test hat es
  -- gefunden, bevor die Migration lief.
  product_sku text, product_name text, supplier text, qty numeric,
  checked boolean, checked_at timestamptz, checked_by_name text, note text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.id, o.id, coalesce(o.communication_name, o.legal_name), b.booth_number,
           p.sku, coalesce(p.name_de, p.name_en), p.supplier, op.qty,
           c.id is not null, c.checked_at,
           coalesce(pe.first_name || ' ' || pe.last_name, null), c.note
      from org_edition oe
      join organization o on o.id = oe.org_id
      join org_product op on op.org_edition_id = oe.id
      join product p on p.sku = op.product_sku
      left join booth b on b.org_edition_id = oe.id
      left join booth_service_check c on c.org_edition_id = oe.id and c.product_sku = p.sku
      left join person pe on pe.id = c.checked_by
     where oe.edition_id = p_edition_id
       and (p_org_id is null or o.id = p_org_id)
       and op.status <> 'cancelled'
       -- Was am Stand ankommt: Messeshop-Artikel und Add-ons. `package` ist
       -- das Sponsoring-Paket selbst, keine Lieferung zum Abhaken.
       and p.type in ('shop_item', 'addon')
     order by coalesce(o.communication_name, o.legal_name), p.supplier, p.sku;
end $$;

create or replace function set_booth_service_check(
  p_org_edition_id uuid, p_product_sku text, p_checked boolean, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from org_product op
                  where op.org_edition_id = p_org_edition_id and op.product_sku = p_product_sku) then
    raise exception 'booth_item_not_found' using errcode = 'P0002';
  end if;
  if p_checked then
    insert into booth_service_check (org_edition_id, product_sku, checked_by, note)
    values (p_org_edition_id, p_product_sku, current_person_id(), nullif(btrim(p_note), ''))
    on conflict (org_edition_id, product_sku)
      do update set checked_by = excluded.checked_by, checked_at = now(), note = excluded.note;
  else
    delete from booth_service_check
     where org_edition_id = p_org_edition_id and product_sku = p_product_sku;
  end if;
  perform log_audit('booth.service_checked', 'org_edition', p_org_edition_id::text, null,
                    jsonb_build_object('sku', p_product_sku, 'checked', p_checked));
end $$;

/**
 * Bestellliste je Dienstleister: was die Edition bei wem bestellt, summiert
 * über alle Stände. Grundlage der CSV-Ausgabe.
 */
create or replace function supplier_order_list(p_edition_id uuid, p_supplier text default null)
returns table(supplier text, product_sku text, product_name text, unit text,
              qty numeric, orgs integer, purchase_price_cents integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select coalesce(p.supplier, ''), p.sku, coalesce(p.name_de, p.name_en), p.unit,
           sum(op.qty), count(distinct oe.org_id)::integer, p.purchase_price_cents
      from org_edition oe
      join org_product op on op.org_edition_id = oe.id
      join product p on p.sku = op.product_sku
     where oe.edition_id = p_edition_id
       and op.status <> 'cancelled'
       and p.type in ('shop_item', 'addon')
       and (p_supplier is null or p.supplier = p_supplier)
     group by p.supplier, p.sku, p.name_de, p.name_en, p.unit, p.purchase_price_cents
     order by coalesce(p.supplier, ''), p.sku;
end $$;

select harden_definer_functions();
