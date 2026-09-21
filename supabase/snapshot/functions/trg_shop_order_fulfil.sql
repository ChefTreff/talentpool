create or replace function trg_shop_order_fulfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  perform shop_sync_fulfilled_deliverables(coalesce(new.org_edition_id, old.org_edition_id));
  return coalesce(new, old);
end $$;
