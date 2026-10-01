create or replace function set_award_organization(p_application_id uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_org_id is not null and not exists (select 1 from organization o where o.id = p_org_id) then
    raise exception 'org_not_found' using errcode = 'P0002';
  end if;
  select a.organization_id into v_alt from award_application a where a.id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  update award_application set organization_id = p_org_id where id = p_application_id;
  perform log_audit('award.organization', 'award_application', p_application_id::text,
                    jsonb_build_object('organization_id', v_alt), jsonb_build_object('organization_id', p_org_id));
end $$;
