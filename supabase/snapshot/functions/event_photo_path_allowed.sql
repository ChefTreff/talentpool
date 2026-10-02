create or replace function event_photo_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_p event_photo;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin v_event := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  if can_manage_event_photos() then return true; end if;
  select * into v_p from event_photo p where p.storage_path = p_name and p.event_id = v_event;
  if not found then return false; end if;
  return v_p.published and attended_event(v_event);
end $$;
