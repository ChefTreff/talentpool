-- =============================================================================
-- 0124 · Welle 6 · Stände tagesweise (A3.5, ADM-022)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Initiativen bekommen einen Stand für **einen** Tag (`INI-STAND-1T`, 0116) —
-- zwei teilen sich dieselbe Fläche, eine am Donnerstag, eine am Freitag. Das
-- ging bisher nicht: `booth.org_edition_id` war eindeutig, ein Stand gehörte
-- genau einer Teilnahme.
--
-- **Der Stand wird zur Fläche, die Zuordnung zur Belegung.** `booth` führt nur
-- noch Nummer, Art, Segment und Masse; wer wann dort steht, sagt
-- `booth_assignment`. `event_day_id is null` heisst „beide Tage" — der
-- Normalfall, und deshalb der Vorgabewert.
--
-- **Das ist keine Ergänzung, sondern ein Umzug.** `booth.org_edition_id` fällt
-- weg. Zwei Wahrheiten über dieselbe Frage wären schlimmer als die alte
-- Einschränkung: die eine Hälfte des Portals läse die Spalte, die andere die
-- Zuordnung, und beim ersten geteilten Stand widersprächen sie sich.
--
-- **Sieben Funktionen hängen daran** — Partner-Übersicht, Admin-Übersicht,
-- Ausstellerliste, Event-App, Produktions-Checkliste, `org_has_booth` und
-- `upsert_booth`. Alle sieben sind hier neu, Grundlage sind die Live-Fassungen
-- aus `supabase/snapshot/functions/` (Stand nach 0123). Bei den Lesern ist es
-- je genau eine Zeile: der Weg über die Zuordnung statt über die Spalte.
--
-- **Ein Befund dabei:** `partner_admin_overview` holte die Standnummer als
-- Unterabfrage **ohne** `limit`. Mit einem geteilten Stand hätte das nicht
-- falsch angezeigt, sondern die ganze Übersicht mit „more than one row returned
-- by a subquery" abgebrochen. Jetzt mit `limit 1` wie die anderen.
--
-- **Welche Zuordnung gewinnt, wenn mehrere passen?** `event_day_id nulls first`:
-- die Belegung für beide Tage geht vor der für einen einzelnen. Wer einen
-- Hauptstand hat und zusätzlich einen Tag woanders, sieht in der Übersicht
-- seinen Hauptstand. Das ist eine Entscheidung und keine Zufälligkeit der
-- Sortierung, deshalb steht sie in jeder der sieben Funktionen ausgeschrieben.
--
-- **Eine Voraussetzung, die heute noch fehlt:** `event_day` ist für FLS27 leer.
-- Das Programm-Gerüst (0110) kann die Tage, gepflegt sind sie nicht. Bis Konrad
-- sie einträgt, gibt es nur Belegungen „für beide Tage" und `booth_day_plan`
-- liefert nichts — richtig so, aber es gehört gesagt, damit niemand den leeren
-- Plan für einen Fehler hält. Der Test legt sich deshalb eigene Tage an.
--
-- **Drei Objekte hingen an der Spalte** (`pg_depend`): der Fremdschlüssel, die
-- Eindeutigkeit und die Lesepolitik `booth_read`. Die ersten beiden nimmt
-- Postgres beim `drop column` mit, die Policy nicht — sie wird vorher ersetzt.
--
-- Fehlerschlüssel: 42501 ohne Partner-/Produktions-Team · 22023 `invalid_day`
-- (Tag gehört nicht zur Edition) · P0002 `booth_not_found` ·
-- P0002 `org_edition_not_found` · 23505 bei doppelter Belegung.
--
-- Test: supabase/tests/v6_staende_tagesweise.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Zuordnung

create table if not exists booth_assignment (
  id              uuid primary key default gen_random_uuid(),
  booth_id        uuid not null references booth (id) on delete cascade,
  org_edition_id  uuid not null references org_edition (id) on delete cascade,
  -- null = beide Tage. Der Normalfall, und deshalb der Vorgabewert.
  event_day_id    uuid references event_day (id) on delete cascade,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- `nulls not distinct`: zwei Zeilen „beide Tage" fuer denselben Stand waeren
  -- ein Widerspruch, und ohne diesen Zusatz liesse Postgres sie zu (NULL ist
  -- sonst nie gleich NULL).
  constraint booth_assignment_belegung_uniq unique nulls not distinct (booth_id, event_day_id)
);
create index if not exists booth_assignment_org_idx on booth_assignment (org_edition_id);
comment on table booth_assignment is
  'Wer wann an einem Stand steht (0124). event_day_id null = beide Tage. Ersetzt booth.org_edition_id: ein Stand kann tagesweise geteilt werden.';

drop trigger if exists trg_booth_assignment_updated on booth_assignment;
create trigger trg_booth_assignment_updated before update on booth_assignment
  for each row execute function set_updated_at();

alter table booth_assignment enable row level security;
revoke all on booth_assignment from anon;
revoke insert, update, delete on booth_assignment from authenticated;
grant select on booth_assignment to authenticated;

drop policy if exists booth_assignment_read on booth_assignment;
create policy booth_assignment_read on booth_assignment for select to authenticated
using (
  is_partner_team() or is_production_team()
  or exists (select 1 from org_edition oe
              where oe.id = booth_assignment.org_edition_id and is_partner_of(oe.org_id))
);

-- ---------------------------------------------------------------- Bestand

-- Jeder bestehende Stand behaelt seine Teilnahme, als Belegung fuer beide Tage.
-- Erst umziehen, dann die Spalte entfernen — in dieser Reihenfolge geht keine
-- Zuordnung verloren.
insert into booth_assignment (booth_id, org_edition_id, event_day_id)
select b.id, b.org_edition_id, null from booth b
where b.org_edition_id is not null
on conflict (booth_id, event_day_id) do nothing;

-- **Die Lesepolitik haengt an der Spalte und faellt nicht von allein.**
-- Fremdschluessel und Eindeutigkeit nimmt Postgres beim `drop column` mit, eine
-- Policy nicht — sie laesst den Drop mit 2BP01 scheitern (Probelauf der
-- Architektur-Session, 21.09.). Deshalb erst ersetzen, dann entfernen; ein
-- blosses Loeschen der Policy haette den Partnern den Blick auf ihren eigenen
-- Stand genommen.
--
-- `is_staff()` steht dabei jetzt **ausserhalb** der Unterabfrage. Vorher war es
-- darin, was nur deshalb gleichbedeutend war, weil jeder Stand eine Teilnahme
-- hatte. Seit dieser Migration kann eine Flaeche unbelegt sein — und eine
-- unbelegte Flaeche ist genau das, was das Team sehen muss, um sie zu vergeben.
drop policy if exists booth_read on booth;
create policy booth_read on booth for select to authenticated
using (
  is_staff()
  or exists (select 1 from booth_assignment ba
               join org_edition oe on oe.id = ba.org_edition_id
              where ba.booth_id = booth.id and is_partner_of(oe.org_id))
);

alter table booth drop constraint if exists booth_org_edition_id_key;
alter table booth drop column if exists org_edition_id;

-- ---------------------------------------------------------------- Pflegen

create or replace function upsert_booth(p_org_id uuid, p_data jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_id uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;

  -- Welcher Stand gehoert dieser Teilnahme? Seit 0124 sagt das die Zuordnung und
  -- nicht mehr eine Spalte am Stand. Die Zuordnung fuer alle Tage gewinnt vor
  -- einer einzelnen Tageszuordnung — wer hier pflegt, meint den Hauptstand.
  select b.id into v_id
    from booth_assignment ba join booth b on b.id = ba.booth_id
   where ba.org_edition_id = v_oe.id
   order by ba.event_day_id nulls first, b.created_at
   limit 1;

  if v_id is null then
    insert into booth (booth_number, booth_type, segment, length_m, width_m, backdrop_w_mm, backdrop_h_mm, notes)
    values (p_data->>'booth_number', p_data->>'booth_type', p_data->>'segment', (p_data->>'length_m')::numeric, (p_data->>'width_m')::numeric,
            (p_data->>'backdrop_w_mm')::integer, (p_data->>'backdrop_h_mm')::integer, p_data->>'notes')
    returning id into v_id;
    -- Ohne Tag heisst: beide Tage. Wer den Stand teilt, traegt danach die
    -- Tageszuordnungen ueber `set_booth_assignment` nach.
    insert into booth_assignment (booth_id, org_edition_id, event_day_id) values (v_id, v_oe.id, null);
  else
    update booth set
      booth_number  = case when p_data ? 'booth_number' then p_data->>'booth_number' else booth_number end,
      booth_type    = case when p_data ? 'booth_type' then p_data->>'booth_type' else booth_type end,
      segment       = case when p_data ? 'segment' then p_data->>'segment' else segment end,
      length_m      = case when p_data ? 'length_m' then (p_data->>'length_m')::numeric else length_m end,
      width_m       = case when p_data ? 'width_m' then (p_data->>'width_m')::numeric else width_m end,
      backdrop_w_mm = case when p_data ? 'backdrop_w_mm' then (p_data->>'backdrop_w_mm')::integer else backdrop_w_mm end,
      backdrop_h_mm = case when p_data ? 'backdrop_h_mm' then (p_data->>'backdrop_h_mm')::integer else backdrop_h_mm end,
      notes         = case when p_data ? 'notes' then p_data->>'notes' else notes end,
      updated_at    = now()
     where id = v_id;
  end if;

  perform log_audit('partner.booth', 'organization', p_org_id::text, null, p_data);
  return v_id;
end $$;


/**
 * Eine Fläche belegen.
 *
 * Ohne Tag heisst beide Tage. Mit Tag steht dort an diesem Tag diese
 * Organisation — und nur sie: die Eindeutigkeit über `(booth_id, event_day_id)`
 * weist eine zweite Belegung ab, und das ist Absicht. Ein Stand, an dem an
 * einem Tag zwei Organisationen stehen, ist kein Datenfehler, den man später
 * bemerkt, sondern ein Aufbau, der vor Ort scheitert.
 */
create or replace function set_booth_assignment(
  p_booth_id uuid, p_org_edition_id uuid, p_event_day_id uuid default null, p_note text default null)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_oe org_edition; v_id uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from booth b where b.id = p_booth_id) then
    raise exception 'booth_not_found' using errcode = 'P0002', detail = coalesce(p_booth_id::text, 'null');
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = coalesce(p_org_edition_id::text, 'null');
  end if;
  -- Ein Tag einer anderen Edition waere eine Belegung, die es nie gibt.
  if p_event_day_id is not null and not exists (
       select 1 from event_day d where d.id = p_event_day_id and d.event_id = v_oe.edition_id) then
    raise exception 'invalid_day' using errcode = '22023', detail = p_event_day_id::text;
  end if;

  insert into booth_assignment (booth_id, org_edition_id, event_day_id, note)
  values (p_booth_id, p_org_edition_id, p_event_day_id, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (booth_id, event_day_id) do update
     set org_edition_id = excluded.org_edition_id, note = excluded.note, updated_at = now()
  returning id into v_id;

  perform log_audit('booth.assignment', 'booth', p_booth_id::text, null,
                    jsonb_build_object('org_edition_id', p_org_edition_id,
                                       'event_day_id', p_event_day_id, 'assignment_id', v_id));
  return v_id;
end $$;
grant execute on function set_booth_assignment(uuid, uuid, uuid, text) to authenticated;

/** Eine Belegung wieder lösen. Der Stand bleibt, die Fläche wird frei. */
create or replace function remove_booth_assignment(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_before jsonb;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select to_jsonb(a) into v_before from booth_assignment a where a.id = p_id;
  if v_before is null then
    raise exception 'assignment_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null');
  end if;
  delete from booth_assignment where id = p_id;
  perform log_audit('booth.assignment_removed', 'booth', (v_before->>'booth_id'), v_before, null);
end $$;
grant execute on function remove_booth_assignment(uuid) to authenticated;

/**
 * Der Standplan je Tag — das, wofür dieser Baustein gebaut ist.
 *
 * Eine Zeile je Stand und Tag, mit der Organisation, die dort steht. Eine
 * Belegung für beide Tage erscheint an beiden Tagen; so sieht die Produktion in
 * einer Liste, wer am Donnerstag aufbaut und wer am Freitag.
 */
create or replace function booth_day_plan(p_edition_id uuid default null)
returns table (event_day_id uuid, day_date date, day_label text,
               booth_id uuid, booth_number text, booth_type text, segment text,
               org_edition_id uuid, org_id uuid, org_name text, geteilt boolean, note text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if not (is_partner_team() or is_production_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by e.start_date desc limit 1)) into v_ed;
  return query
    select d.id, d.day_date, coalesce(d.label_de, to_char(d.day_date, 'DD.MM.')),
           b.id, b.booth_number, b.booth_type, b.segment,
           ba.org_edition_id, o.id, coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           -- „Geteilt" heisst: an diesem Stand haengt mindestens eine
           -- Tagesbelegung. Genau die Staende will die Produktion sehen.
           exists (select 1 from booth_assignment x
                    where x.booth_id = b.id and x.event_day_id is not null),
           ba.note
      from event_day d
      join booth_assignment ba
        on (ba.event_day_id = d.id or ba.event_day_id is null)
      join booth b on b.id = ba.booth_id
      join org_edition oe on oe.id = ba.org_edition_id and oe.edition_id = v_ed
      join organization o on o.id = oe.org_id
     where d.event_id = v_ed
     order by d.day_date, b.booth_number nulls last, 10;
end $$;
grant execute on function booth_day_plan(uuid) to authenticated;

-- ---------------------------------------------------------------- Leser

create or replace function org_has_booth(p_org_edition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
      select 1 from org_product op join product p on p.sku = op.product_sku
       where op.org_edition_id = p_org_edition_id and op.status = 'booked'
         and p.format_key in ('booth', 'stage'))
      or exists (select 1 from booth_assignment ba where ba.org_edition_id = p_org_edition_id)
$$;

create or replace function booth_checklist(p_edition_id uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, org_name text, booth_number text, product_sku text, product_name text, supplier text, qty numeric, checked boolean, checked_at timestamp with time zone, checked_by_name text, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
      left join lateral (
        select b2.* from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = oe.id
         order by ba.event_day_id nulls first, b2.created_at limit 1) b on true
      left join booth_service_check c on c.org_edition_id = oe.id and c.product_sku = p.sku
      left join person pe on pe.id = c.checked_by
     where oe.edition_id = p_edition_id
       and (p_org_id is null or o.id = p_org_id)
       and op.status <> 'cancelled'
       -- Was am Stand ankommt: Messeshop-Artikel und Add-ons. `package` ist
       -- das Sponsoring-Paket selbst, keine Lieferung zum Abhaken.
       and p.type in ('shop_item', 'addon')
       -- Ticket-Kontingente sind keine Lieferung. Sie laufen über vivenu.
       and coalesce(p.category, '') <> 'tickets'
       and p.pass_type is null
     order by coalesce(o.communication_name, o.legal_name), p.supplier, p.sku;
end $$;

create or replace function exhibitor_list(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, name text, booth_number text, booth_type text, segment text, package_name_de text, package_name_en text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
      join lateral (
        select b2.* from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = oe.id
         order by ba.event_day_id nulls first, b2.created_at limit 1) b on true
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

create or replace function event_app_exhibitors(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text, description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer, partner_category text, org_type text, booth_number text, onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.id, o.id, e.id, e.slug, e.swapcard_event_id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.slug,
           o.description_de, o.description_en, o.website, oe.sponsoring_level,
           sponsoring_level_key(oe.sponsoring_level),
           (select v.sort_order from vocab_term v
             where v.vocabulary = 'sponsoring_level' and v.active and v.key = sponsoring_level_key(oe.sponsoring_level)),
           o.partner_category, o.type,
           (select b.booth_number from booth_assignment ba join booth b on b.id = ba.booth_id
             where ba.org_edition_id = oe.id order by ba.event_day_id nulls first, b.created_at limit 1),
           oe.onboarding_status,
           (select a.storage_path from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_vector' and d.status = 'accepted' order by a.version desc limit 1),
           (select a.storage_path from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_png' and d.status = 'accepted' order by a.version desc limit 1),
           (select a.id from deliverable d join partner_asset a on a.deliverable_id = d.id and a.is_current
             where d.org_edition_id = oe.id and d.key = 'logo_png' and d.status = 'accepted' order by a.version desc limit 1),
           (select r.external_id from external_ref r where r.system = 'swapcard' and r.object_type = 'exhibitor' and r.object_id = oe.id),
           coalesce((select jsonb_agg(jsonb_build_object('person_id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
                                                         'email', pe.email::text, 'position', m.contact_position)
                                      order by p.last_name, p.first_name)
                     from org_membership m
                     join person p on p.id = m.person_id and p.deleted_at is null
                     left join person_email pe on pe.person_id = p.id and pe.is_primary
                     where m.org_id = o.id and m.roles @> '{event_app_member}'), '[]'::jsonb)
    from org_edition oe
    join organization o on o.id = oe.org_id
    join event e on e.id = oe.edition_id
    where o.active
      and (p_edition_id is null or oe.edition_id = p_edition_id)
      and (p_edition_id is not null or e.swapcard_event_id is not null)
    order by e.slug, coalesce(o.communication_name, o.legal_name);
end $$;

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
                              'address', jsonb_build_object('street', v_o.address_street, 'zip', v_o.address_zip, 'city', v_o.address_city, 'country', v_o.address_country),
                              'partner_category', v_o.partner_category),
    'roles', to_jsonb(v_roles),
    'team', is_partner_team(),
    'edition', case when v_oe.id is null then null else jsonb_build_object(
        'id', v_oe.id, 'edition_id', v_oe.edition_id, 'onboarding_status', v_oe.onboarding_status, 'invited_at', v_oe.invited_at,
        'onboarding_filled_at', v_oe.onboarding_filled_at, 'description_de', v_o.description_de, 'description_en', v_o.description_en,
        'invoice_email', case when v_full then v_oe.invoice_email::text end, 'invoice_name', case when v_full then v_oe.invoice_name end,
        'vat_id', case when v_full then v_oe.vat_id end, 'po_number', case when v_full then v_oe.po_number end,
        'pass_type_choice', v_oe.pass_type_choice, 'sponsoring_level', v_oe.sponsoring_level) end,
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

create or replace function partner_admin_overview(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, communication_name text, legal_name text, org_type text, edition_id uuid, onboarding_status text, invited_at timestamp with time zone, onboarding_filled_at timestamp with time zone, contacts integer, primary_email text, products integer, invoice_email text, hubspot_deal_id text, updated_at timestamp with time zone, deliverables_open integer, deliverables_submitted integer, deliverables_overdue integer, booth_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.type, oe.edition_id, oe.onboarding_status, oe.invited_at, oe.onboarding_filled_at,
           (select count(*)::integer from org_membership om where om.org_id = o.id),
           (select pe.email::text from org_membership om join person_email pe on pe.person_id = om.person_id and pe.is_primary where om.org_id = o.id and om.roles @> '{primary_ops}' limit 1),
           (select count(*)::integer from org_product op where op.org_edition_id = oe.id and op.status = 'booked'),
           oe.invoice_email::text, oe.hubspot_deal_id, oe.updated_at,
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status in ('open', 'rejected')),
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status = 'submitted'),
           (select count(*)::integer from deliverable d where d.org_edition_id = oe.id and d.status = 'overdue'),
           (select b.booth_number from booth_assignment ba join booth b on b.id = ba.booth_id
            where ba.org_edition_id = oe.id order by ba.event_day_id nulls first, b.created_at limit 1)
    from org_edition oe join organization o on o.id = oe.org_id
    where (p_edition_id is null or oe.edition_id = p_edition_id)
    order by oe.onboarding_status, coalesce(o.communication_name, o.legal_name);
end $$;

select harden_definer_functions();
