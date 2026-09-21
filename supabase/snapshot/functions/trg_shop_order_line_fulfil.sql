create or replace function trg_shop_order_line_fulfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe uuid;
begin
  select o.org_edition_id into v_oe from shop_order o where o.id = coalesce(new.order_id, old.order_id);
  if v_oe is not null then perform shop_sync_fulfilled_deliverables(v_oe); end if;
  return coalesce(new, old);
end $$;
