create or replace function set_company_tour_type(p_tour_id uuid, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt text; v_neu text := nullif(btrim(coalesce(p_type, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tourAssignment') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_neu is not null and not is_vocab_key('company_tour_type', v_neu) then
    raise exception 'invalid_type' using errcode = '22023', detail = v_neu;
  end if;
  select t.tour_type into v_alt from company_tour t where t.id = p_tour_id for update;
  if not found then raise exception 'tour_not_found' using errcode = 'P0002'; end if;
  begin
    update company_tour set tour_type = v_neu, updated_at = now() where id = p_tour_id;
  exception when unique_violation then
    -- Je Edition gibt es jede Tour einmal.
    raise exception 'invalid_type' using errcode = '22023', detail = 'exists';
  end;
  perform log_audit('tour.type', 'company_tour', p_tour_id::text,
                    jsonb_build_object('tour_type', v_alt), jsonb_build_object('tour_type', v_neu));
end $$;
