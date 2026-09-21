create or replace function shop_invoice_refs(p_edition_id uuid)
 RETURNS TABLE(org_id uuid, org_name text, order_id uuid, order_no text, sevdesk_invoice_id text, sevdesk_contact_id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.org_id, coalesce(org.communication_name, org.legal_name), o.id, o.order_no, x.meta->>'invoice_id', x.meta->>'contact_id', x.created_at
    from external_ref x
    join shop_order o on o.id = x.object_id
    join org_edition oe on oe.id = o.org_edition_id
    join organization org on org.id = oe.org_id
    where x.system = 'sevdesk' and x.object_type = 'shop_order' and oe.edition_id = p_edition_id
    order by x.created_at desc;
end $$;
