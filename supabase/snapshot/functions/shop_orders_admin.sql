create or replace function shop_orders_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, order_no text, org_id uuid, org_name text, edition_id uuid, phase integer, status text, note text, internal_note text, po_number text, confirmed_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, net_cents bigint, vat_cents bigint, gross_cents bigint, lines jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.order_no, oe.org_id, coalesce(org.communication_name, org.legal_name), oe.edition_id, o.phase, o.status,
           o.note, o.internal_note, o.po_number, o.confirmed_at,
           o.completed_at, o.cancelled_at, t.net_cents, t.vat_cents, t.gross_cents, shop_order_lines_json(o.id), o.created_at, o.updated_at
      from shop_order o join org_edition oe on oe.id = o.org_edition_id join organization org on org.id = oe.org_id
      cross join lateral shop_order_totals(o.id) t
     where p_edition_id is null or oe.edition_id = p_edition_id
     order by case o.status when 'pending' then 0 when 'editing' then 1 when 'draft' then 2 when 'completed' then 3 else 4 end, o.updated_at desc;
end $$;
