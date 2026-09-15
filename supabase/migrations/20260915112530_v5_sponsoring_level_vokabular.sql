-- 0097 · Welle 5 · Sponsoring-Level als Vokabular mit Rang; Logo-Pflicht verlangt Transparenz
--
-- Anlass: Antwort des Website-Teams vom 15.09.2026 zum Sanity-Kontrakt (Partner-Logo-Wand,
-- docs/runbooks/sanity-partner-logos.md). Die Website sortiert die Logos nach einem numerischen
-- Rang (`sponsoringRank`) statt nach dem Text des Levels und rendert sie als einfarbige Maske
-- auf Navy — ein Logo mit deckendem Hintergrund wird dort zum gefüllten Rechteck.
--
-- 1. Vokabular `sponsoring_level`: die Standtypen aus HubSpot (`fls_booth_type` ohne
--    Größenangabe, lib/hubspot/mapping.ts `levelFromBoothType`) als Schlüssel mit Rang
--    (`sort_order`, klein = oben). Die Reihenfolge folgt der Paketgröße und ist ein
--    Vorschlag — Daten, keine Codeänderung, wenn Konrad sie anders will (Entscheidungslog 15.09.).
-- 2. `sponsoring_level_key(text)`: derselbe Schlüssel, den lib/sanity/mapping.ts bildet
--    (klein, Nicht-Alphanumerisches zu `_`, Rand-`_` weg). `org_edition.sponsoring_level`
--    bleibt Freitext aus HubSpot; der Schlüssel entsteht beim Lesen, nichts wird umgeschrieben.
-- 3. `event_app_exhibitors()` liefert zusätzlich `sponsoring_key` und `sponsoring_rank`.
--    Rückgabetyp ändert sich ⇒ drop + create (Konvention §1); Aufrufer lib/sanity/publish.ts
--    und lib/event-app/sync.ts lesen nach Spaltenname. Rechteprüfung unverändert
--    (service_role oder Partner-Team, sonst 42501).
-- 4. Pflicht `logo_vector`: die Beschreibung nennt jetzt „freigestellt, transparenter
--    Hintergrund" — das Kriterium, das das Team beim Freigeben prüft. Die Heuristik in
--    lib/sanity/svg.ts setzt zusätzlich `logoTransparent` im Sanity-Dokument; die Website
--    lässt Logos mit `false` aus.
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('sponsoring_level', 'main_stage_loge',    'Main Stage Loge',    'Main Stage Box', 10, true),
  ('sponsoring_level', 'signature',          'Signature',          'Signature',      20, true),
  ('sponsoring_level', 'lounge',             'Lounge',             'Lounge',         30, true),
  ('sponsoring_level', 'premium',            'Premium',            'Premium',        40, true),
  ('sponsoring_level', 'general',            'General',            'General',        50, true),
  ('sponsoring_level', 'intro',              'Intro',              'Intro',          60, true),
  ('sponsoring_level', 'start_up',           'Start-Up',           'Start-up',       70, true),
  ('sponsoring_level', 'gemeinschaftsstand', 'Gemeinschaftsstand', 'Shared booth',   80, true)
on conflict (vocabulary, key) do update
  set label_de = excluded.label_de, label_en = excluded.label_en, sort_order = excluded.sort_order, active = excluded.active;

-- Reiner Textschlüssel, kein Datenzugriff; für authenticated gesperrt (interner Helfer, Konvention §2).
create or replace function sponsoring_level_key(p_level text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(lower(btrim(coalesce(p_level, ''))), '[^a-z0-9]+', '_', 'g'), '_'), '')
$$;
revoke execute on function sponsoring_level_key(text) from public, anon, authenticated;

drop function if exists event_app_exhibitors(uuid);
create function event_app_exhibitors(p_edition_id uuid default null)
returns table (org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text,
               description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer,
               partner_category text, org_type text, booth_number text,
               onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.id, o.id, e.id, e.slug, e.swapcard_event_id, coalesce(o.communication_name, o.legal_name), o.legal_name, o.slug,
           coalesce(oe.description_de, o.description), oe.description_en, o.website, oe.sponsoring_level,
           sponsoring_level_key(oe.sponsoring_level),
           (select v.sort_order from vocab_term v
             where v.vocabulary = 'sponsoring_level' and v.active and v.key = sponsoring_level_key(oe.sponsoring_level)),
           o.partner_category, o.type,
           (select b.booth_number from booth b where b.org_edition_id = oe.id order by b.created_at limit 1),
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

update deliverable_template
   set description_de = 'Vektordatei im SVG-Format für Website und Drucksachen: freigestellt, mit transparentem Hintergrund und ohne Hintergrundfläche. Wird nach Prüfung durch das Team veröffentlicht.',
       description_en = 'Vector file in SVG format for the website and print: cut out, with a transparent background and no background shape. Published after review by the team.'
 where key = 'logo_vector';

select harden_definer_functions();
