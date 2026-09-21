create or replace function shop_requests_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, org_id uuid, org_name text, product_sku text, product_name text, text text, status text, answer text, created_by_name text, created_at timestamp with time zone, answered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, oe.org_id, coalesce(org.communication_name, org.legal_name), r.product_sku, p.name_de, r.text, r.status, r.answer,
           (select btrim(coalesce(pe.first_name, '') || ' ' || coalesce(pe.last_name, '')) from person pe where pe.id = r.created_by), r.created_at, r.answered_at
    from shop_request r join org_edition oe on oe.id = r.org_edition_id join organization org on org.id = oe.org_id left join product p on p.sku = r.product_sku
    where p_edition_id is null or oe.edition_id = p_edition_id
    order by case r.status when 'open' then 0 else 1 end, r.created_at desc;
end $$;
