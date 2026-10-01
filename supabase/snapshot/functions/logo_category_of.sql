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
