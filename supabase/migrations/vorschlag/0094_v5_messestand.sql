-- 0094 · Welle 5 · Messestand: Standgrößen, Editionsdateien, Ausstellerliste (F10)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Vier Dinge, die die Seite `/partner/messestand` braucht:
--
-- 1. **Standgröße am Paket.** Konrads Tabelle hat eine Spalte „Standgröße"
--    („1,5 qm (1m x 1,5m)"). Im Produktmodell stand sie bisher nur im Namen und
--    im Fliesstext — beides nichts, woraus sich eine Tabellenspalte bauen lässt,
--    ohne Namen zu zerlegen. Deshalb zwei Spalten: `area_sqm` als Zahl und
--    `size_note` für das Maß. Beide sind **sprachneutral** (Ziffern, „×"), damit
--    sie nicht doppelt gepflegt werden müssen — „qm" bzw. „sqm" setzt die
--    Oberfläche. ⚠️ Abweichung vom Entscheid 1 der Architektur-Session (dort:
--    „Freitext über description_de/en"); Begründung siehe oben, steht im PR.
--
-- 2. **Eine Frist statt zweier.** Konrad am 14.09.: der 02.04.2027 gilt, der
--    13.03. stammte aus dem Vorjahr. Die bestehende Frist `booth_backdrop`
--    (12.03.2027) wird deshalb umbenannt und umdatiert, nicht ergänzt — zwei
--    Countdowns zu derselben Sache wären genau die Verwirrung, die wir gerade
--    abräumen. Die Verweise in `deliverable_template` und die schon erzeugten
--    `deliverable`-Zeilen ziehen mit, sonst stünde in der Checkliste weiter das
--    alte Datum.
--
-- 3. **Dateien je Edition** (Hallenplan, Anfahrt, Aufbauplan) in einem neuen
--    **privaten** Bucket `edition-files`. Nicht in `partner-assets`: dessen
--    Pfadregel ist je Organisation, Editionsdateien sind für alle da. Gelesen
--    wird von jedem angemeldeten Konto, geschrieben nur über `service_role` aus
--    einer Admin-/Produktionsroute — ein Hallenplan ist nichts, was ein Partner
--    austauschen können soll.
--
-- 4. **Ausstellerliste.** `exhibitor_list()` gibt Organisation, Standnummer und
--    Paket heraus — nichts Personenbezogenes. **Ohne Logo**: die Logos liegen in
--    `partner-assets`, dessen Policy je Organisation greift; sie quer lesbar zu
--    machen, wäre ein Loch im Bucket für eine Verzierung. Steht als Abweichung
--    im PR.
--
-- Dazu: `upsert_booth` darf jetzt auch die Produktion (Entscheid 2) — die
-- Standnummern vergibt sie, nicht das Partner-Team.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht ·
-- 22023 `invalid_kind` · P0002 `edition_file_not_found` / `edition_not_found`.

set search_path = public, extensions;

-- ------------------------------------------------- 1) Standgröße am Paket

alter table product add column if not exists area_sqm numeric(6, 2)
  check (area_sqm is null or area_sqm > 0);
alter table product add column if not exists size_note text;

comment on column product.area_sqm is
  'Standfläche eines Pakets in Quadratmetern. Zahl, nicht Text — die Einheit setzt die Oberfläche (qm/sqm).';
comment on column product.size_note is
  'Maß als sprachneutrale Notiz, z. B. „6 m × 3 m". Ergänzt `area_sqm` in der Übersichtstabelle.';

update product set area_sqm = v.a, size_note = v.n
  from (values
    ('I-65476', 1.5,  '1 m × 1,5 m'),
    ('I-39740', 4.0,  '2 m × 2 m'),
    ('I-50131', 9.0,  '3 m × 3 m'),
    ('I-39709', 18.0, '6 m × 3 m'),
    ('I-84869', 9.0,  '3 m × 3 m'),
    ('I-36848', 18.0, '6 m × 3 m'),
    ('I-79031', 18.0, '6 m × 3 m'),
    ('I-79895', 18.0, '6 m × 3 m')
  ) as v(sku, a, n)
 where product.sku = v.sku and product.area_sqm is null;

-- ------------------------------------------------- 2) Eine Frist

update deadline
   set key = 'booth_changes_until',
       due_at = timestamptz '2027-04-02 23:59 Europe/Berlin',
       label_de = 'Änderungen am Messestand',
       label_en = 'Booth changes',
       description_de = 'Bis zu diesem Tag könnt ihr eure Rückwand hochladen und Angaben zum Stand über das Portal ändern. Danach geht die Datei in den Druck; Änderungen laufen dann über einen Änderungswunsch im Portal.',
       description_en = 'Until this date you can upload your backdrop and change booth details in the portal. After that the file goes to print; later changes go through a change request in the portal.'
 where key = 'booth_backdrop';

update deliverable_template
   set due_rule = jsonb_build_object('deadline_key', 'booth_changes_until')
 where due_rule->>'deadline_key' = 'booth_backdrop';

-- Schon erzeugte Pflichten tragen das Datum als Kopie. Ohne diese Zeile stünde
-- in der Checkliste weiter der 12.03. und im Countdown der 02.04.
update deliverable d
   set due_at = dl.due_at
  from deliverable_template t, org_edition oe, deadline dl
 where d.template_id = t.id
   and d.org_edition_id = oe.id
   and dl.edition_id = oe.edition_id
   and dl.key = 'booth_changes_until'
   and t.due_rule->>'deadline_key' = 'booth_changes_until'
   and d.due_at is distinct from dl.due_at;

-- ------------------------------------------------- 3) Dateien je Edition

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('edition_file_kind', 'hallenplan', 'Hallenplan',  'Floor plan',    1, true),
  ('edition_file_kind', 'anfahrt',    'Anfahrt',     'Directions',    2, true),
  ('edition_file_kind', 'aufbauplan', 'Aufbauplan',  'Set-up plan',   3, true),
  ('edition_file_kind', 'sonstiges',  'Sonstiges',   'Other',         9, true)
on conflict (vocabulary, key) do nothing;

create table if not exists edition_file (
  id           uuid primary key default gen_random_uuid(),
  edition_id   uuid not null references event(id) on delete cascade,
  kind         text not null,
  storage_path text not null unique,
  filename     text not null,
  mime         text,
  size_bytes   bigint,
  label_de     text,
  label_en     text,
  audience     text[] not null default '{partner,speaker,talent,volunteer,hackathon}',
  sort_order   integer not null default 0,
  uploaded_by  uuid references person(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint edition_file_audience_chk check (cardinality(audience) > 0)
);

comment on table edition_file is
  'Dateien, die einer Edition gehören und nicht einer Organisation: Hallenplan, Anfahrt, Aufbauplan. Privater Bucket `edition-files`, Pfad <edition_id>/<kind>/<datei>.';

create index if not exists edition_file_lookup_idx on edition_file (edition_id, kind, sort_order);

drop trigger if exists trg_edition_file_updated on edition_file;
create trigger trg_edition_file_updated before update on edition_file
  for each row execute function set_updated_at();

alter table edition_file enable row level security;
revoke all on edition_file from anon, authenticated;
grant all on edition_file to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('edition-files', 'edition-files', false, 26214400,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

/**
 * Lesen darf jedes angemeldete Konto, schreiben niemand über den Browser.
 *
 * Der Hallenplan ist für alle da — wer das Portal betritt, darf ihn sehen.
 * Geschrieben wird ausschliesslich mit `service_role` aus der Admin-Route,
 * die vorher `is_production_team()` oder `is_staff()` prüft. Deshalb gibt es
 * hier bewusst **nur** eine SELECT-Policy: eine INSERT-Policy für
 * `authenticated` wäre ein Weg, an dieser Prüfung vorbei Dateien abzulegen.
 */
drop policy if exists "edition files read" on storage.objects;
create policy "edition files read" on storage.objects for select to authenticated
  using (bucket_id = 'edition-files');

/** Dateien einer Edition für diese Zielgruppe. */
create or replace function edition_files(p_audience text, p_edition_id uuid default null)
returns table (id uuid, kind text, storage_path text, filename text, mime text,
               size_bytes bigint, label_de text, label_en text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Dieselbe Regel wie im Wiki: die Zielgruppe wird aus den Rollen abgeleitet,
  -- nicht geglaubt.
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select f.id, f.kind, f.storage_path, f.filename, f.mime, f.size_bytes,
           f.label_de, f.label_en, f.created_at
      from edition_file f
     where f.edition_id = v_ed
       and f.audience && array[p_audience]
     order by f.sort_order, f.created_at desc;
end $$;

/** Für die Verwaltung: alles, unabhängig von Zielgruppe. */
create or replace function edition_files_admin(p_edition_id uuid default null)
returns table (id uuid, edition_id uuid, edition_slug text, kind text, storage_path text,
               filename text, mime text, size_bytes bigint, label_de text, label_en text,
               audience text[], sort_order integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (is_staff() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.edition_id, e.slug, f.kind, f.storage_path, f.filename, f.mime, f.size_bytes,
           f.label_de, f.label_en, f.audience, f.sort_order, f.created_at
      from edition_file f join event e on e.id = f.edition_id
     where p_edition_id is null or f.edition_id = p_edition_id
     order by e.start_date desc nulls last, f.kind, f.sort_order;
end $$;

create or replace function set_edition_file(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_kind text; v_ed uuid; v_aud text[];
begin
  if not (is_staff() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_kind := coalesce(nullif(p_data->>'kind', ''), 'sonstiges');
  if not is_vocab_key('edition_file_kind', v_kind) then
    raise exception 'invalid_kind' using errcode = '22023', detail = v_kind;
  end if;
  v_aud := coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)),
    '{}');

  if v_id is null then
    v_ed := nullif(p_data->>'edition_id', '')::uuid;
    if v_ed is null then
      raise exception 'edition_not_found' using errcode = 'P0002', detail = 'edition_id fehlt';
    end if;
    insert into edition_file (edition_id, kind, storage_path, filename, mime, size_bytes,
                              label_de, label_en, audience, sort_order, uploaded_by)
    values (v_ed, v_kind, p_data->>'storage_path', coalesce(p_data->>'filename', 'datei'),
            nullif(p_data->>'mime', ''), nullif(p_data->>'size_bytes', '')::bigint,
            nullif(btrim(p_data->>'label_de'), ''), nullif(btrim(p_data->>'label_en'), ''),
            case when cardinality(v_aud) > 0 then v_aud
                 else '{partner,speaker,talent,volunteer,hackathon}'::text[] end,
            coalesce((p_data->>'sort_order')::integer, 0), current_person_id())
    returning id into v_id;
  else
    update edition_file set
      kind = v_kind,
      label_de = case when p_data ? 'label_de' then nullif(btrim(p_data->>'label_de'), '') else label_de end,
      label_en = case when p_data ? 'label_en' then nullif(btrim(p_data->>'label_en'), '') else label_en end,
      audience = case when cardinality(v_aud) > 0 then v_aud else audience end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_at = now()
     where id = v_id;
    if not found then raise exception 'edition_file_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;
  perform log_audit('edition_file.set', 'edition_file', v_id::text, null, p_data - 'storage_path');
  return v_id;
end $$;

/** Löscht nur den Eintrag; die Datei im Bucket räumt die Route mit `service_role`. */
create or replace function delete_edition_file(p_id uuid) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_path text;
begin
  if not (is_staff() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from edition_file where id = p_id returning storage_path into v_path;
  if v_path is null then
    raise exception 'edition_file_not_found' using errcode = 'P0002', detail = p_id::text;
  end if;
  perform log_audit('edition_file.delete', 'edition_file', p_id::text, null, null);
  return v_path;
end $$;

-- ------------------------------------------------- 4) Pakete und Aussteller

/**
 * Die Standardausstattung aller Standpakete — Grundlage der Übersichtstabelle.
 *
 * Die Ausstattung kommt aus `product_component`, nicht aus dem Wiki: sie ist
 * dieselbe Liste, aus der die Produktion bestellt. Steht sie zweimal, stimmt
 * spätestens im zweiten Jahr eine davon nicht mehr.
 */
create or replace function booth_packages()
returns table (sku text, name_de text, name_en text, description_de text, description_en text,
               area_sqm numeric, size_note text, net_price_cents integer, components jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select p.sku, p.name_de, p.name_en, p.description_de, p.description_en,
           p.area_sqm, p.size_note, p.net_price_cents,
           coalesce((select jsonb_agg(jsonb_build_object(
                              'sku', c.component_sku, 'qty', c.qty,
                              'unit', cp.unit,
                              'name_de', cp.name_de, 'name_en', cp.name_en)
                            order by cp.name_de)
                       from product_component c join product cp on cp.sku = c.component_sku
                      where c.bundle_sku = p.sku), '[]'::jsonb)
      from product p
     where p.type = 'package' and p.category = 'standflaeche' and p.active
     order by p.area_sqm nulls last, p.name_de;
end $$;

/**
 * Wer steht wo. Für angemeldete Partner und Speaker.
 *
 * **Ohne Logo und ohne Personen.** Die Logos liegen im Bucket `partner-assets`,
 * dessen Policy je Organisation greift; sie quer lesbar zu machen, wäre ein Loch
 * im Bucket für eine Verzierung.
 */
create or replace function exhibitor_list(p_edition_id uuid default null)
returns table (org_id uuid, name text, booth_number text, booth_type text,
               segment text, package_name_de text, package_name_en text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (my_kb_audiences() && array['partner', 'speaker']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), b.booth_number, b.booth_type, b.segment,
           pk.name_de, pk.name_en
      from org_edition oe
      join organization o on o.id = oe.org_id and o.active
      join booth b on b.org_edition_id = oe.id
      left join lateral (
        select p.name_de, p.name_en
          from org_product op join product p on p.sku = op.product_sku
         where op.org_edition_id = oe.id and op.status = 'booked'
           and p.type = 'package' and p.category = 'standflaeche'
         order by p.area_sqm desc nulls last
         limit 1) pk on true
     where oe.edition_id = v_ed
       -- Ohne Standnummer ist die Zeile für die Liste wertlos und verrät nur,
       -- wer gebucht hat. Sie kommt rein, sobald die Produktion zugeordnet hat.
       and nullif(btrim(coalesce(b.booth_number, '')), '') is not null
     order by b.booth_number;
end $$;

-- ------------------------------------------------- 5) Standnummern: Produktion

/**
 * `upsert_booth` darf jetzt auch die Produktion.
 *
 * Standnummern vergibt sie, nicht das Partner-Team (Entscheid 2 vom 14.09.).
 * Der Rest der Funktion bleibt wie in 0041.
 */
create or replace function upsert_booth(p_org_id uuid, p_data jsonb, p_edition_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_id uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  insert into booth (org_edition_id, booth_number, booth_type, segment, length_m, width_m, backdrop_w_mm, backdrop_h_mm, notes)
  values (v_oe.id, p_data->>'booth_number', p_data->>'booth_type', p_data->>'segment', (p_data->>'length_m')::numeric, (p_data->>'width_m')::numeric,
          (p_data->>'backdrop_w_mm')::integer, (p_data->>'backdrop_h_mm')::integer, p_data->>'notes')
  on conflict (org_edition_id) do update set
    booth_number  = case when p_data ? 'booth_number' then excluded.booth_number else booth.booth_number end,
    booth_type    = case when p_data ? 'booth_type' then excluded.booth_type else booth.booth_type end,
    segment       = case when p_data ? 'segment' then excluded.segment else booth.segment end,
    length_m      = case when p_data ? 'length_m' then excluded.length_m else booth.length_m end,
    width_m       = case when p_data ? 'width_m' then excluded.width_m else booth.width_m end,
    backdrop_w_mm = case when p_data ? 'backdrop_w_mm' then excluded.backdrop_w_mm else booth.backdrop_w_mm end,
    backdrop_h_mm = case when p_data ? 'backdrop_h_mm' then excluded.backdrop_h_mm else booth.backdrop_h_mm end,
    notes         = case when p_data ? 'notes' then excluded.notes else booth.notes end
  returning id into v_id;
  perform log_audit('partner.booth', 'organization', p_org_id::text, null, p_data);
  return v_id;
end $$;

select harden_definer_functions();
