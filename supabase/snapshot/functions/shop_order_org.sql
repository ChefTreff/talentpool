create or replace function shop_order_org(p_order_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select oe.org_id from shop_order o join org_edition oe on oe.id = o.org_edition_id where o.id = p_order_id
$$;
