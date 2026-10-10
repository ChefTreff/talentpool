create or replace function partner_org_hiring(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, career_opportunity text, function_area text, role_text text, skills text[], study_fields text[], published boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_org_id is null or not (is_partner_of(p_org_id) or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  return query
    select h.id, h.career_opportunity, h.function_area, h.role_text, h.skills, h.study_fields, h.published, h.created_at, h.updated_at
      from org_hiring h
     where h.org_edition_id = v_oe.id
     order by h.created_at, h.id;
end $$;
