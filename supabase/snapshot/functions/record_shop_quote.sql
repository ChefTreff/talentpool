create or replace function record_shop_quote(p_order_id uuid, p_sevdesk_order_id text, p_number text, p_contact_id text, p_net_cents bigint, p_lines_hash text, p_probe boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order; v_org uuid; v_tot record; v_ref external_ref%rowtype; v_meta jsonb; v_number text := nullif(btrim(coalesce(p_number, '')), '');
begin
  -- Nur die Route (service_role): ein Partner darf kein Angebot „melden“, das es nicht gibt.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_sevdesk_order_id, '')), '') is null then raise exception 'quote_id_required' using errcode = '22023'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status <> 'quoted' or v_o.quote_started_at is null then raise exception 'not_quoted' using errcode = 'P0001', detail = v_o.status; end if;
  if v_o.quote_valid_until is not null then raise exception 'quote_recorded' using errcode = 'P0001'; end if;
  select * into v_tot from shop_order_totals(p_order_id);
  if shop_quote_lines_hash(p_order_id) is distinct from p_lines_hash or v_tot.net_cents is distinct from p_net_cents then
    raise exception 'quote_hash_mismatch' using errcode = 'P0001';
  end if;
  v_org := shop_order_org(p_order_id);
  v_meta := jsonb_build_object('number', v_number, 'contact_id', nullif(btrim(coalesce(p_contact_id, '')), ''), 'net_cents', p_net_cents, 'lines_hash', p_lines_hash,
                               'order_no', v_o.order_no, 'quoted_at', now(), 'probe', coalesce(p_probe, false));
  select * into v_ref from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id for update;
  if found then
    -- Zweites Angebot nach Rücknahme oder Ablauf: das erste rückt in den Verlauf (Q5 zählt daran).
    update external_ref
       set external_id = btrim(p_sevdesk_order_id),
           meta = v_meta || jsonb_build_object('history', coalesce(v_ref.meta->'history', '[]'::jsonb) || jsonb_build_array(v_ref.meta - 'history'))
     where id = v_ref.id;
  else
    insert into external_ref (system, object_type, object_id, external_id, meta)
    values ('sevdesk', 'shop_quote', p_order_id, btrim(p_sevdesk_order_id), v_meta || jsonb_build_object('history', '[]'::jsonb));
  end if;
  update shop_order set quote_valid_until = now() + interval '30 days' where id = p_order_id;
  if nullif(btrim(coalesce(p_contact_id, '')), '') is not null then
    update organization set sevdesk_contact_id = coalesce(sevdesk_contact_id, btrim(p_contact_id)) where id = v_org;
  end if;
  -- Audit ohne Klartext-Adresse: Bestell-Id, Nummer, Summe.
  perform log_audit('shop.quote_created', 'shop_order', p_order_id::text, null,
                    jsonb_build_object('order_no', v_o.order_no, 'quote_number', v_number, 'net_cents', p_net_cents, 'probe', coalesce(p_probe, false)));
end $$;
