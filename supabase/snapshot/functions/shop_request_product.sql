create or replace function shop_request_product(p_org_id uuid, p_text text, p_sku text DEFAULT NULL::text, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_id uuid; v_org_name text; v_product text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_text, '')), '') is null then raise exception 'text_required' using errcode = '22023'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if p_sku is not null and not exists (select 1 from product where sku = p_sku) then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
  insert into shop_request (org_edition_id, product_sku, text, created_by) values (v_oe.id, p_sku, btrim(p_text), v_me) returning id into v_id;
  select coalesce(o.communication_name, o.legal_name) into v_org_name from organization o where o.id = p_org_id;
  select name_de into v_product from product where sku = p_sku;
  perform notify_partner_leads('shop_request_received', jsonb_build_object('org_name', v_org_name, 'product', coalesce(v_product, '–'), 'text', btrim(p_text)), 'shop_request', v_id);
  perform log_audit('shop.request', 'shop_request', v_id::text, null, jsonb_build_object('org_id', p_org_id, 'sku', p_sku));
  return v_id;
end $$;
