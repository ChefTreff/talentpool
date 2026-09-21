create or replace function event_app_exhibitors(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, edition_id uuid, edition_slug text, swapcard_event_id text, name text, legal_name text, slug text, description_de text, description_en text, website text, sponsoring_level text, sponsoring_key text, sponsoring_rank integer, level_key text, level_rank integer, level_source text, categories text[], industry text, partner_category text, org_type text, booth_number text, onboarding_status text, logo_svg_path text, logo_png_path text, logo_png_asset_id uuid, swapcard_exhibitor_id text, members jsonb)
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
