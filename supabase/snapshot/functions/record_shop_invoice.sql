create or replace function record_shop_invoice(p_org_id uuid, p_order_ids uuid[], p_sevdesk_invoice_id text, p_sevdesk_contact_id text DEFAULT NULL::text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer := 0; v_id uuid; v_no text;
begin
  if not (auth.uid() is null or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_sevdesk_invoice_id, '')), '') is null then raise exception 'invoice_id_required' using errcode = '22023'; end if;
  if p_order_ids is null or cardinality(p_order_ids) = 0 then raise exception 'orders_required' using errcode = '22023'; end if;
  foreach v_id in array p_order_ids loop
    select o.order_no into v_no from shop_order o join org_edition oe on oe.id = o.org_edition_id where o.id = v_id and oe.org_id = p_org_id and o.status = 'completed';
    if not found then raise exception 'order_not_completed' using errcode = 'P0001', detail = v_id::text; end if;
    insert into external_ref (system, object_type, object_id, external_id, meta)
    values ('sevdesk', 'shop_order', v_id, btrim(p_sevdesk_invoice_id) || '#' || v_no,
            coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('invoice_id', btrim(p_sevdesk_invoice_id), 'contact_id', p_sevdesk_contact_id, 'order_no', v_no))
    on conflict (system, object_type, object_id) do nothing;
    v_n := v_n + 1;
  end loop;
  if nullif(btrim(coalesce(p_sevdesk_contact_id, '')), '') is not null then
    update organization set sevdesk_contact_id = coalesce(sevdesk_contact_id, btrim(p_sevdesk_contact_id)) where id = p_org_id;
  end if;
  perform log_audit('shop.invoice_draft', 'organization', p_org_id::text, null, jsonb_build_object('invoice_id', p_sevdesk_invoice_id, 'orders', cardinality(p_order_ids)));
  return v_n;
end $$;
