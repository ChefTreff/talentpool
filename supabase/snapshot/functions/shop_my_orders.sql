create or replace function shop_my_orders(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, order_no text, phase integer, status text, note text, po_number text, confirmed_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, net_cents bigint, vat_cents bigint, gross_cents bigint, lines jsonb, editable boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_p integer;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  v_p := (shop_phase(v_oe.edition_id)->>'phase')::integer;
  return query
    select o.id, o.order_no, o.phase, o.status, o.note, o.po_number, o.confirmed_at, o.completed_at, o.cancelled_at,
           t.net_cents, t.vat_cents, t.gross_cents, shop_order_lines_json(o.id),
           (o.status in ('draft', 'editing', 'pending') and o.phase = v_p), o.created_at, o.updated_at
      from shop_order o cross join lateral shop_order_totals(o.id) t
     where o.org_edition_id = v_oe.id
     order by o.created_at desc;
end $$;
