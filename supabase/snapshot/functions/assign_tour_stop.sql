create or replace function assign_tour_stop(p_stop_id uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt uuid; v_tour uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_org_id is not null and not exists (select 1 from organization o where o.id = p_org_id) then
    raise exception 'org_not_found' using errcode = 'P0002';
  end if;
  select s.host_org_id, s.tour_id into v_alt, v_tour from company_tour_stop s where s.id = p_stop_id for update;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  begin
    update company_tour_stop set host_org_id = p_org_id, updated_at = now() where id = p_stop_id;
  exception when unique_violation then
    raise exception 'partner_already_on_tour' using errcode = 'P0001';
  end;
  perform log_audit('tour.assign', 'company_tour_stop', p_stop_id::text,
                    jsonb_build_object('host_org_id', v_alt), jsonb_build_object('host_org_id', p_org_id, 'tour_id', v_tour));
end $$;
