create or replace function shop_sku_via_deliverable(p_org_edition_id uuid, p_sku text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from deliverable d join deliverable_template t on t.id = d.template_id
     where d.org_edition_id = p_org_edition_id
       and t.fulfilled_by_sku = p_sku
       and d.status <> 'not_required')
$$;
