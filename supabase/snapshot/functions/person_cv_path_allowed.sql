create or replace function person_cv_path_allowed(p_name text, p_write boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_owner uuid;
begin
  if v_me is null or p_name is null then return false; end if;
  if split_part(p_name, '/', 2) = '' or split_part(p_name, '/', 3) <> '' then return false; end if;
  begin
    v_owner := split_part(p_name, '/', 1)::uuid;
  exception when others then return false; end;
  if v_owner = v_me then return true; end if;
  if p_write then return false; end if;
  if coalesce(is_staff(), false) then return true; end if;
  return coalesce(exists (
    select 1 from application a join session s on s.id = a.session_id
     where a.person_id = v_owner and a.consent_share
       and s.host_org_id is not null and is_partner_of(s.host_org_id)
  ), false);
end $$;
