create or replace function trg_org_product_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  perform sync_deliverables(coalesce(new.org_edition_id, old.org_edition_id));
  return coalesce(new, old);
end $$;
