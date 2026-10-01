create or replace function hack_dataset_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_challenge uuid; v_d hack_dataset;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin v_challenge := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  select * into v_d from hack_dataset d where d.storage_path = p_name and d.challenge_id = v_challenge;
  if not found then return is_hack_team(); end if;   -- Waisen: nur das Hack-Team
  if can_manage_hack_dataset(v_challenge) then return true; end if;
  return v_d.is_current and can_read_hack_dataset(v_challenge);
end $$;
