-- Logokategorie je Partner und Edition: Presenting, Premium, Official, Small, Startup (ADM-046)
--
-- Zweck: Website, Swapcard und der Druck der Logo-Wand brauchen dieselbe
-- Einordnung der Logos — Grösse und Platz auf der Website, Kategorie im
-- Swapcard-Bereich „Sponsoring & Werbung", Gruppierung auf der Foto-Wand.
-- Bisher leitete sie sich nur aus der Sponsoring-Stufe ab (0141: Stufe →
-- Swapcard-Kategorie), ausdrücklich als Übergang (Konrad 22.09.). Konrad 25.09.:
-- Kategorien **Presenting, Premium, Official, Small, Startup**, je Edition und
-- Company.
--
-- Umsetzung:
--   * Vokabular `logo_category` mit den fünf Begriffen; Elternbegriff ist der
--     Name in Swapcard (`swapcard_sponsor_category`). Swapcard kennt kein
--     „Small" — `small` zeigt dort vorerst auf Official Partner (in der
--     Vokabularpflege änderbar, sobald es drüben eine Kategorie gibt).
--   * Die Sponsoring-Stufen zeigen jetzt auf die Logokategorie statt direkt auf
--     Swapcard (gleiche Zuordnung wie 0141: Signature ⇒ Presenting, Lounge und
--     Premium ⇒ Premium, General/Intro/Gemeinschaftsstand ⇒ Official,
--     Start-Up ⇒ Startup; Main Stage Loge weiter ohne — nicht geraten).
--   * `org_edition.logo_category`: das Feld. Leer heisst „aus der Stufe".
--   * `logo_category_of(org_edition)` (intern): Feld, sonst aus der Stufe,
--     sonst **`official`** — der Auffangsatz bleibt (Konrad: „Es darf auf
--     jeden Fall niemand durchrutschen"). Eine Stelle, damit Website, Swapcard
--     und Foto-Wand nie auseinanderlaufen.
--   * `event_app_exhibitors` liefert die Kategorie mit (Website-Lauf und
--     Swapcard), `sponsor_category` kommt jetzt aus ihr.
--   * `partner_logo_production` (Foto-Wand, ADM-048) liefert sie mit und
--     sortiert danach.
--   * `set_logo_category` setzt oder leert das Feld; Abschnitt `logoWall`,
--     Audit.
--
-- Basis: snapshot/functions/event_app_exhibitors.sql,
-- snapshot/functions/partner_logo_production.sql. Rückgabetypen ändern sich ⇒
-- droppen; nur hinten angehängte Spalten, Reihenfolge der alten bleibt.
set search_path = public, extensions;

-- 1 · Die Kategorien -----------------------------------------------------------
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active, parent_vocabulary, parent_key) values
  ('logo_category', 'presenting', 'Presenting', 'Presenting', 10, true, 'swapcard_sponsor_category', 'presenting_partner'),
  ('logo_category', 'premium',    'Premium',    'Premium',    20, true, 'swapcard_sponsor_category', 'premium_partner'),
  ('logo_category', 'official',   'Official',   'Official',   30, true, 'swapcard_sponsor_category', 'official_partner'),
  ('logo_category', 'small',      'Small',      'Small',      40, true, 'swapcard_sponsor_category', 'official_partner'),
  ('logo_category', 'startup',    'Startup',    'Startup',    50, true, 'swapcard_sponsor_category', 'startup_partner')
on conflict (vocabulary, key) do nothing;

-- 2 · Stufe → Logokategorie (statt Stufe → Swapcard) ------------------------------
update vocab_term t set parent_vocabulary = 'logo_category', parent_key = m.kategorie
  from (values
    ('signature',          'presenting'),
    ('lounge',             'premium'),
    ('premium',            'premium'),
    ('general',            'official'),
    ('intro',              'official'),
    ('gemeinschaftsstand', 'official'),
    ('start_up',           'startup')
  ) as m(stufe, kategorie)
 where t.vocabulary = 'sponsoring_level' and t.key = m.stufe;

-- 3 · Das Feld ------------------------------------------------------------------
alter table org_edition add column logo_category text;
comment on column org_edition.logo_category is
  'ADM-046: Logokategorie (Vokabular logo_category) je Partner und Edition. Leer = aus der Sponsoring-Stufe, sonst official (logo_category_of).';

-- 4 · Die eine Ableitung ----------------------------------------------------------
create or replace function logo_category_of(p_org_edition_id uuid)
 RETURNS TABLE(category text, category_rank integer, category_source text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  with oe as (
    select o.id, o.logo_category, o.sponsoring_level from org_edition o where o.id = p_org_edition_id
  ), stufe as (
    -- Wie event_app_exhibitors (0135): gebuchtes Paket schlägt den HubSpot-Freitext.
    select coalesce(
      (select v.key from org_product op
         join product pr on pr.sku = op.product_sku
         join vocab_term v on v.vocabulary = 'sponsoring_level' and v.active and v.key = pr.sponsoring_level_key
        where op.org_edition_id = oe.id and op.status = 'booked'
        order by v.sort_order nulls last, v.key limit 1),
      sponsoring_level_key(oe.sponsoring_level)) as k
    from oe
  ), feld as (
    select c.key, c.sort_order from oe join vocab_term c
      on c.vocabulary = 'logo_category' and c.active and c.key = oe.logo_category
  ), abgeleitet as (
    select c.key, c.sort_order from stufe
      join vocab_term l on l.vocabulary = 'sponsoring_level' and l.active and l.key = stufe.k
                       and l.parent_vocabulary = 'logo_category'
      join vocab_term c on c.vocabulary = 'logo_category' and c.active and c.key = l.parent_key
  )
  select coalesce((select key from feld), (select key from abgeleitet), 'official'),
         coalesce((select sort_order from feld), (select sort_order from abgeleitet),
                  (select v.sort_order from vocab_term v where v.vocabulary = 'logo_category' and v.key = 'official')),
         case when exists (select 1 from feld) then 'manual'
              when exists (select 1 from abgeleitet) then 'level'
              else 'fallback' end
   where exists (select 1 from oe)
$$;
revoke execute on function logo_category_of(uuid) from public, anon, authenticated;

-- 5 · Ausstellerliste (Website-Lauf, Swapcard) -------------------------------------
drop function if exists event_app_exhibitors(uuid);
create or replace function event_app_exhibitors(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text, description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer, level_key text, level_rank integer, level_source text, categories text[], industry text, sponsor_category text, partner_category text, org_type text, booth_number text, onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb, logo_category text, logo_category_rank integer, logo_category_source text)
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
           -- Kategorie der Logo-Wand in Swapcard (0141, ADM-046): aus der
           -- Logokategorie, deren Elternbegriff der Swapcard-Name ist. Das
           -- `coalesce` bleibt Konrads Auffangnetz — „es darf niemand durchrutschen".
           coalesce((select k.key from vocab_term c
                       join vocab_term k on k.vocabulary = c.parent_vocabulary and k.key = c.parent_key and k.active
                      where c.vocabulary = 'logo_category' and c.key = lc.category
                        and c.parent_vocabulary = 'swapcard_sponsor_category'),
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
                     where m.org_id = o.id and m.roles @> '{event_app_member}'), '[]'::jsonb),
           lc.category, lc.category_rank, lc.category_source
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
    cross join lateral logo_category_of(oe.id) lc
    where o.active
      and (p_edition_id is null or oe.edition_id = p_edition_id)
      and (p_edition_id is not null or e.swapcard_event_id is not null)
    order by e.slug, coalesce(o.communication_name, o.legal_name);
end $$;


-- 6 · Foto-Wand (ADM-048) -----------------------------------------------------------
drop function if exists partner_logo_production(uuid);
create or replace function partner_logo_production(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, org_edition_id uuid, org_name text, sponsoring_level text, vektor_datei text, vektor_status text, vektor_seit timestamp with time zone, pixel_datei text, einwilligung timestamp with time zone, druckbar boolean, fehlt text, logo_category text, logo_category_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not has_admin_section('logoWall') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;

  return query
  with basis as (
    select oe.id as oe_id, oe.org_id, oe.sponsoring_level, oe.logo_whitening_consent_at,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name) as name,
           -- **Left join, nicht join**: ein Partner ohne jede Datei muss in der
           -- Liste stehen, sonst faellt genau er wieder durch.
           (select a.filename from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor,
           (select a.status from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor_status,
           (select a.created_at from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_vector' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as vektor_seit,
           (select a.filename from partner_asset a
             where a.org_edition_id = oe.id and a.kind = 'logo_png' and a.is_current
               and a.status <> 'rejected'
             order by a.version desc limit 1) as pixel
      from org_edition oe
      join organization o on o.id = oe.org_id
     where oe.edition_id = v_ed
  )
  select b.org_id, b.oe_id, b.name, b.sponsoring_level,
         b.vektor, b.vektor_status, b.vektor_seit, b.pixel, b.logo_whitening_consent_at,
         b.vektor is not null and b.logo_whitening_consent_at is not null,
         -- Sagt, was zu tun ist. Drei Spalten zu lesen und daraus zu schliessen
         -- ist im Druckstress genau die Arbeit, die niemand macht.
         nullif(concat_ws(' · ',
           case when b.vektor is null then 'Vektordatei fehlt' end,
           case when b.logo_whitening_consent_at is null then 'Einwilligung zum Weissen fehlt' end,
           case when b.vektor is not null and b.vektor_status = 'pending' then 'Datei noch ungeprueft' end), ''),
         lc.category, lc.category_source
    from basis b
    cross join lateral logo_category_of(b.oe_id) lc
   order by lc.category_rank nulls last, b.name;
end $$;


-- 7 · Setzen und leeren -------------------------------------------------------------
create or replace function set_logo_category(p_org_edition_id uuid, p_category text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt text; v_neu text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('logoWall') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_neu is not null and not exists (select 1 from vocab_term v where v.vocabulary = 'logo_category' and v.active and v.key = v_neu) then
    raise exception 'invalid_category' using errcode = '22023', detail = v_neu;
  end if;
  select oe.logo_category into v_alt from org_edition oe where oe.id = p_org_edition_id for update;
  if not found then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  update org_edition set logo_category = v_neu where id = p_org_edition_id;
  perform log_audit('partner.logo_category', 'org_edition', p_org_edition_id::text,
                    jsonb_build_object('logo_category', v_alt), jsonb_build_object('logo_category', v_neu));
  return (select lc.category from logo_category_of(p_org_edition_id) lc);
end $$;

select harden_definer_functions();
