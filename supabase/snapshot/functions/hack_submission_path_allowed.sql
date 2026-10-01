create or replace function hack_submission_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_team uuid;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin v_team := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  if not exists (select 1 from hack_submission_file f where f.storage_path = p_name and f.team_id = v_team) then
    return is_hack_team();   -- Waisen: nur das Hack-Team
  end if;
  return can_read_hack_submission(v_team);
end $$;
