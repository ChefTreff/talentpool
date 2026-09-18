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
      or exists (select 1 from booth b where b.org_edition_id = p_org_edition_id)
$$;
