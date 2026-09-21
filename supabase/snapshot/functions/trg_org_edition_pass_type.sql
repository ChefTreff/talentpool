create or replace function trg_org_edition_pass_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.pass_type_choice is distinct from old.pass_type_choice then perform sync_ticket_allocations(new.id); end if;
  return new;
end $$;
