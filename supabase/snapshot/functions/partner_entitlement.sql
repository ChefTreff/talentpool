create or replace function partner_entitlement(p_org_edition_id uuid, p_format text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select greatest(
    coalesce((select sum(op.qty)::integer from org_product op join product p on p.sku = op.product_sku
               where op.org_edition_id = p_org_edition_id and op.status = 'booked' and p.format_key = p_format), 0)
    - coalesce((select count(*)::integer from session se
                 join org_edition oe on oe.id = p_org_edition_id
                 join event ev on ev.id = se.event_id
                where se.partner_org_id = oe.org_id and se.format = p_format
                  and se.publish_status <> 'cancelled'
                  and (ev.id = oe.edition_id or ev.edition_id = oe.edition_id)), 0),
    0)
$$;
