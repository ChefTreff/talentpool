create or replace function trg_hack_member_edition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  select t.edition_id into new.edition_id from hack_team t where t.id = new.team_id;
  if new.edition_id is null then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  return new;
end $$;
