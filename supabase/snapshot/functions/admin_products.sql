create or replace function admin_products(p_only_active boolean DEFAULT false)
 RETURNS SETOF product
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  -- PROD-006: auch der Abschnitt `productCatalog` (Produktion) pflegt den Stamm.
  if not (is_partner_team() or (current_person_id() is not null and has_admin_section('productCatalog'))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.* from product p
    where (not p_only_active or p.active)
    order by p.category, p.shop_sort nulls last, p.name_de;
end $$;
