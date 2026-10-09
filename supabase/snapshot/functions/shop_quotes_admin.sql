create or replace function shop_quotes_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(order_id uuid, order_no text, org_id uuid, org_name text, edition_id uuid, quote_number text, valid_until timestamp with time zone, net_cents bigint, probe boolean, started_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.order_no, oe.org_id, coalesce(org.communication_name, org.legal_name), oe.edition_id, x.meta->>'number', o.quote_valid_until, t.net_cents,
           coalesce((x.meta->>'probe')::boolean, false), o.quote_started_at
      from shop_order o
      join org_edition oe on oe.id = o.org_edition_id
      join organization org on org.id = oe.org_id
      cross join lateral shop_order_totals(o.id) t
      left join external_ref x on x.system = 'sevdesk' and x.object_type = 'shop_quote' and x.object_id = o.id
     where o.status = 'quoted' and (p_edition_id is null or oe.edition_id = p_edition_id)
     order by o.quote_valid_until nulls first, o.quote_started_at;
end $$;
