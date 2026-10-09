create or replace function shop_quote_info(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order; v_org uuid; v_ref external_ref%rowtype;
begin
  select * into v_o from shop_order where id = p_order_id;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not (is_partner_of(v_org) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_ref from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'status', v_o.status, 'active', v_o.status = 'quoted', 'quote_number', v_ref.meta->>'number', 'valid_until', v_o.quote_valid_until,
    'probe', coalesce((v_ref.meta->>'probe')::boolean, false), 'closed', v_ref.meta->>'closed',
    'quotes_used', 1 + coalesce(jsonb_array_length(v_ref.meta->'history'), 0),
    'sevdesk_order_id', case when is_partner_team() then v_ref.external_id end);
end $$;
