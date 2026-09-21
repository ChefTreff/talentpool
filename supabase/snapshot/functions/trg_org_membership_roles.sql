create or replace function trg_org_membership_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  perform sync_granted_roles(coalesce(new.org_id, old.org_id));
  return coalesce(new, old);
end $$;
