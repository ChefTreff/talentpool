create or replace function admin_products(p_only_active boolean DEFAULT false)
 RETURNS SETOF product
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.* from product p
    where (not p_only_active or p.active)
    order by p.category, p.shop_sort nulls last, p.name_de;
end $$;
