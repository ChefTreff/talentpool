create or replace function template_applies(p_template deliverable_template, p_org_edition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select (p_template.product_sku is null and p_template.category is null)
      or (p_template.product_sku is not null and exists (select 1 from org_product op where op.org_edition_id = p_org_edition_id and op.status = 'booked' and op.product_sku = p_template.product_sku))
      or (p_template.product_sku is null and p_template.category is not null and exists (
            select 1 from org_product op join product p on p.sku = op.product_sku
            where op.org_edition_id = p_org_edition_id and op.status = 'booked' and p.category = p_template.category))
$$;
