create or replace function trg_org_edition_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  perform sync_deliverables(new.id);
  return new;
end $$;
