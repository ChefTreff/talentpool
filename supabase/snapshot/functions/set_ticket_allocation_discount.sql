create or replace function set_ticket_allocation_discount(p_org_edition_id uuid, p_pass_type text, p_discount_percent integer, p_quantity integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_id uuid; v_vorher jsonb;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_discount_percent is null or p_discount_percent not in (50, 100) then
    raise exception 'invalid_discount' using errcode = '22023',
      detail = coalesce(p_discount_percent::text, 'null');
  end if;
  if p_discount_percent = 100 then
    raise exception 'derived_allocation' using errcode = 'P0001',
      detail = 'Die 100-Prozent-Zeile leitet sich aus den Produkten ab.';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'invalid_quantity' using errcode = '22023', detail = coalesce(p_quantity::text, 'null');
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;

  select to_jsonb(a) - 'coupon_code' into v_vorher from org_ticket_allocation a
   where a.event_id = v_oe.edition_id and a.org_id = v_oe.org_id
     and a.pass_type = p_pass_type and a.discount_percent = p_discount_percent;

  insert into org_ticket_allocation (event_id, org_id, org_edition_id, pass_type,
                                     quantity, discount_percent, status)
  values (v_oe.edition_id, v_oe.org_id, v_oe.id, p_pass_type,
          p_quantity, p_discount_percent,
          case when p_quantity = 0 then 'disabled' else 'pending_vivenu' end)
  on conflict (event_id, org_id, pass_type, discount_percent) do update set
    quantity = excluded.quantity,
    org_edition_id = excluded.org_edition_id,
    status = case when excluded.quantity = 0 then 'disabled' else 'pending_vivenu' end,
    -- Menge geändert heisst: der Coupon drüben stimmt nicht mehr.
    synced_at = case when org_ticket_allocation.quantity <> excluded.quantity then null
                     else org_ticket_allocation.synced_at end
  returning id into v_id;

  perform log_audit('allocation.discount', 'org_edition', p_org_edition_id::text,
                    coalesce(v_vorher, 'null'::jsonb),
                    jsonb_build_object('pass_type', p_pass_type,
                                       'discount_percent', p_discount_percent,
                                       'quantity', p_quantity));
  return v_id;
end $$;
