create or replace function partner_asset_path_allowed(p_name text, p_write boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_org uuid; v_edition uuid; v_kind text;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_org := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  v_kind := split_part(p_name, '/', 3);
  if v_kind !~ '^[a-z][a-z0-9_]{1,40}$' or split_part(p_name, '/', 4) = '' then return false; end if;
  if not exists (select 1 from org_edition oe where oe.org_id = v_org and oe.edition_id = v_edition) then return false; end if;
  if is_staff() then return true; end if;
  return case when p_write then partner_can_edit(v_org) else is_partner_of(v_org) end;
end $$;
