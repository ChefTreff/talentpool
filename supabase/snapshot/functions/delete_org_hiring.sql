create or replace function delete_org_hiring(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_row org_hiring; v_org uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_row from org_hiring where id = p_id for update;
  if not found then raise exception 'hiring_not_found' using errcode = 'P0002'; end if;
  select oe.org_id into v_org from org_edition oe where oe.id = v_row.org_edition_id;
  if v_org is null or not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from org_hiring where id = p_id;
  perform log_audit('partner.org_hiring_remove', 'org_edition', v_row.org_edition_id::text, null,
                    jsonb_build_object('org_id', v_org, 'hiring_id', p_id,
                                       'career_opportunity', v_row.career_opportunity, 'function_area', v_row.function_area));
end $$;
