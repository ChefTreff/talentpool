-- 0141 · Sponsoren-Kategorien: vom gebuchten Paket zur Logo-Wand in Swapcard
-- Angewendet von der Architektur-Session am 22.09.2026 als 20260922095139 (Kopfnummer 0139 → 0141: 0139 ist v6_partner_speaker_pflege).
--
-- (Nummer vorläufig — die Architektur-Session vergibt sie beim Merge.)
--
-- Zweck: Swapcard führt neben den Ausstellern einen Bereich „Sponsoring &
-- Werbung": Logos, nach Kategorien sortiert. Die Kategorien im 27er-Event sind
-- die Sponsoring-Stufen (Presenting, Premium, Official, Hackathon, Startup,
-- Family Partner, ZEIT:Future Forum). Konrad pflegt diese Wand bisher von Hand —
-- „das ist immer super viel Arbeit". Diese Migration legt die Zuordnung ab, aus
-- der der Lauf sie künftig füllt.
--
-- Zuordnung von Konrad, 21.09.2026:
--   Premium ⇒ Premium · General ⇒ Official · Lounge ⇒ Premium ·
--   Signature ⇒ Presenting · Intro ⇒ Official · Start-Up ⇒ Startup ·
--   Gemeinschaftsstand ⇒ Official
--
-- **Auffangnetz.** Konrad: „Es gibt dann aber ja einige Partner, die nicht
-- repräsentiert wären. Bspw. nur mit Masterclass, Company Tour oder Speaking.
-- Die sollen alle als Official Partner gelistet werden. Es darf auf jeden Fall
-- niemand durchrutschen." Wer keine Standfläche gebucht hat und damit kein Level
-- trägt, bekommt deshalb `official_partner` — nicht null. Die Regel steht
-- bewusst in der Funktion und nicht im Anwendungscode: eine Ausstellerliste, die
-- für manche Zeilen keine Kategorie liefert, wäre genau das Loch, das er nicht
-- will.
--
-- Abgelegt wird die Zuordnung über `vocab_term.parent_vocabulary`/`parent_key` —
-- dieselbe Eltern-Kind-Mechanik wie `study_program` → `study_field`. Damit lässt
-- sie sich über die Vokabularpflege (0130) ändern, ohne Migration.
--
-- Abweichungen: `main_stage_loge` bleibt **ohne** Zuordnung. Konrad hat die Stufe
-- nicht genannt, und zurzeit trägt sie kein Produkt (0135), also kann sie an
-- keinem Partner hängen; das Auffangnetz greift ohnehin. Nicht geraten.

set search_path = public, extensions;

-- 1 · Die Kategorien der Logo-Wand -----------------------------------------------
-- Schlüssel sind unsere Schreibweise, `label_de`/`label_en` **wörtlich** der Name
-- in Swapcard: der Lauf sucht die Kategorie drüben über den Namen, weil die API
-- keine stabile Kennung dafür anbietet, die man hier ablegen könnte.

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('swapcard_sponsor_category', 'presenting_partner', 'Presenting Partner', 'Presenting Partner', 10, true),
  ('swapcard_sponsor_category', 'premium_partner',    'Premium Partner',    'Premium Partner',    20, true),
  ('swapcard_sponsor_category', 'official_partner',   'Official Partner',   'Official Partner',   30, true),
  ('swapcard_sponsor_category', 'hackathon_partner',  'Hackathon Partner',  'Hackathon Partner',  40, true),
  ('swapcard_sponsor_category', 'startup_partner',    'Startup Partner',    'Startup Partner',    50, true),
  ('swapcard_sponsor_category', 'family_partner',     'Family Partner',     'Family Partner',     60, true),
  ('swapcard_sponsor_category', 'zeit_future_forum',  'ZEIT:Future Forum',  'ZEIT:Future Forum',  70, true)
on conflict (vocabulary, key) do nothing;

-- 2 · Welche Stufe in welche Kategorie ---------------------------------------------

update vocab_term t set parent_vocabulary = 'swapcard_sponsor_category', parent_key = m.kategorie
  from (values
    ('premium',            'premium_partner'),
    ('lounge',             'premium_partner'),
    ('signature',          'presenting_partner'),
    ('general',            'official_partner'),
    ('intro',              'official_partner'),
    ('gemeinschaftsstand', 'official_partner'),
    ('start_up',           'startup_partner')
  ) as m(stufe, kategorie)
 where t.vocabulary = 'sponsoring_level' and t.key = m.stufe
   and (t.parent_key is distinct from m.kategorie or t.parent_vocabulary is distinct from 'swapcard_sponsor_category');

-- 3 · Die Ausstellerliste nennt die Kategorie ---------------------------------------
-- Basis: supabase/snapshot/functions/event_app_exhibitors.sql (Stand nach 0138).
-- Neu ist eine Ausgabespalte hinter `industry`; der Rest ist unverändert.
-- Rückgabetyp ändert sich ⇒ droppen.

drop function if exists event_app_exhibitors(uuid);
create or replace function event_app_exhibitors(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text, description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer, level_key text, level_rank integer, level_source text, categories text[], industry text, sponsor_category text, partner_category text, org_type text, booth_number text, onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
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
           -- Abgeleitetes Level (0135): gebuchtes Produkt schlägt Freitext. Ohne
           -- gebuchtes Produkt fällt die Ableitung auf den HubSpot-Freitext zurück,
           -- damit ein Partner, dessen Positionen noch nicht im Portal stehen, nicht
           -- ohne Level dasteht.
           coalesce(abl.level_key, sponsoring_level_key(oe.sponsoring_level)),
           coalesce(abl.level_rank, (select v.sort_order from vocab_term v
                                      where v.vocabulary = 'sponsoring_level' and v.active
                                        and v.key = sponsoring_level_key(oe.sponsoring_level))),
           case when abl.level_key is not null then 'product'
                when sponsoring_level_key(oe.sponsoring_level) is not null then 'hubspot' end,
           abl.categories,
           -- Branche (0138): nur, wenn sie im Vokabular steht. Ein Schlüssel, den
           -- jemand nachträglich deaktiviert hat, geht nicht mehr hinaus — Swapcard
           -- behält dann, was dort steht, statt eine tote Auswahl zu bekommen.
           (select v.key from vocab_term v
             where v.vocabulary = 'industry' and v.active and v.key = o.industry),
           -- Kategorie der Logo-Wand (0139): aus der Stufe, sonst `official_partner`.
           -- Das `coalesce` ist Konrads Auffangnetz — wer nur eine Masterclass,
           -- eine Company Tour oder einen Speaking Slot gebucht hat, traegt keine
           -- Stufe und wuerde sonst auf der Wand fehlen.
           coalesce((select k.key from vocab_term l
                       join vocab_term k on k.vocabulary = l.parent_vocabulary and k.key = l.parent_key and k.active
                      where l.vocabulary = 'sponsoring_level' and l.active
                        and l.key = coalesce(abl.level_key, sponsoring_level_key(oe.sponsoring_level))
                        and l.parent_vocabulary = 'swapcard_sponsor_category'),
                    'official_partner'),
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
    left join lateral (
      select
        (select v.key from org_product op
           join product pr on pr.sku = op.product_sku
           join vocab_term v on v.vocabulary = 'sponsoring_level' and v.active and v.key = pr.sponsoring_level_key
          where op.org_edition_id = oe.id and op.status = 'booked'
          order by v.sort_order nulls last, v.key
          limit 1) as level_key,
        (select v.sort_order from org_product op
           join product pr on pr.sku = op.product_sku
           join vocab_term v on v.vocabulary = 'sponsoring_level' and v.active and v.key = pr.sponsoring_level_key
          where op.org_edition_id = oe.id and op.status = 'booked'
          order by v.sort_order nulls last, v.key
          limit 1) as level_rank,
        -- Kategorien des Ausstellers: die Produktkategorien seiner gebuchten
        -- Pakete, in Vokabular-Reihenfolge. Zusatzleistungen und Shop-Artikel
        -- zählen nicht — ein Barhocker macht niemanden zum Hackathon-Partner.
        (select coalesce(array_agg(c.category order by c.sort_order nulls last, c.category), '{}'::text[])
           from (select distinct pr.category,
                        (select v.sort_order from vocab_term v
                          where v.vocabulary = 'product_category' and v.active and v.key = pr.category) as sort_order
                   from org_product op
                   join product pr on pr.sku = op.product_sku
                  where op.org_edition_id = oe.id and op.status = 'booked'
                    and pr.type = 'package' and pr.category is not null) c) as categories
    ) abl on true
    where o.active
      and (p_edition_id is null or oe.edition_id = p_edition_id)
      and (p_edition_id is not null or e.swapcard_event_id is not null)
    order by e.slug, coalesce(o.communication_name, o.legal_name);
end $$;

-- 4 · Fremdschlüssel: Aussteller **und** Logo-Wand ---------------------------------
-- Basis: supabase/snapshot/functions/set_event_app_ref.sql. Die Funktion schrieb
-- `object_type` fest als `'exhibitor'`. Für die Logo-Wand gebraucht, hätte sie
-- damit die Ausstellerreferenz derselben Teilnahme **überschrieben** — ein
-- stiller Datenverlust, der erst beim nächsten Standsync aufgefallen wäre.
-- Neu: `p_object_type` mit Vorgabe `exhibitor` (bestehende Aufrufer bleiben
-- unverändert) und einer Whitelist. Signatur erweitert ⇒ alte droppen, sonst
-- entsteht ein Overload (db-konventionen §1).

drop function if exists set_event_app_ref(uuid, text, text, jsonb);
create or replace function set_event_app_ref(p_org_edition_id uuid, p_system text, p_external_id text, p_meta jsonb DEFAULT NULL::jsonb, p_object_type text DEFAULT 'exhibitor'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('swapcard') then raise exception 'invalid_system' using errcode = '22023', detail = p_system; end if;
  if p_object_type not in ('exhibitor', 'sponsor') then
    raise exception 'invalid_object_type' using errcode = '22023', detail = coalesce(p_object_type, 'null');
  end if;
  if nullif(btrim(coalesce(p_external_id, '')), '') is null then raise exception 'external_id_required' using errcode = '22023'; end if;
  if not exists (select 1 from org_edition where id = p_org_edition_id) then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values (p_system, p_object_type, p_org_edition_id, btrim(p_external_id), coalesce(p_meta, '{}'::jsonb))
  on conflict (system, object_type, object_id) do update set external_id = excluded.external_id, meta = excluded.meta, updated_at = now();
end $$;

select harden_definer_functions();
