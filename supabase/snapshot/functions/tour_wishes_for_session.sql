create or replace function tour_wishes_for_session(p_session_id uuid)
 RETURNS TABLE(application_id uuid, org_name text, tour_name text, stop_sort integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Dieselbe Grenze wie die Bewerbungsliste des Teams (`applications_for_session` mit vollen Angaben).
  if not is_application_team(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select w.application_id, coalesce(o.communication_name, o.legal_name), ct.name, st.sort_order
      from company_tour_wish w
      join company_tour_stop st on st.id = w.stop_id
      join company_tour ct on ct.id = st.tour_id
      left join organization o on o.id = st.host_org_id
     where ct.session_id = p_session_id
     order by st.sort_order, o.legal_name;
end $$;
