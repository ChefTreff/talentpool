create or replace function session_asset_path_allowed(p_name text, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_session uuid;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin
    v_session := split_part(p_name, '/', 1)::uuid;
  exception when others then return false; end;
  if split_part(p_name, '/', 2) not in ('stage_photo', 'slot_graphic') then return false; end if;
  if split_part(p_name, '/', 3) = '' then return false; end if;
  if not exists (select 1 from session se where se.id = v_session) then return false; end if;
  if p_write then return is_marketing_team(); end if;
  return is_marketing_team()
      or can_edit_session(v_session)
      or exists (select 1 from session_speaker ss
                  where ss.session_id = v_session and ss.person_id = current_person_id());
end $$;
