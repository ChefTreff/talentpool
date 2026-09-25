create or replace function company_tours_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tour_id uuid, name text, track text, event_day_id uuid, meeting_point text, starts_at timestamp with time zone, ends_at timestamp with time zone, lead_contact_id uuid, lead_name text, capacity integer, notes text, session_id uuid, session_title text, stops integer, stops_filled integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select ct.id, ct.name, ct.track, ct.event_day_id, ct.meeting_point, ct.starts_at, ct.ends_at,
           ct.lead_contact_id, ec.display_name, ct.capacity, ct.notes,
           ct.session_id, coalesce(se.title_de, se.title_en),
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id),
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id and s.filled_at is not null)
      from company_tour ct
      left join edition_contact ec on ec.id = ct.lead_contact_id
      left join session se on se.id = ct.session_id
     where p_edition_id is null or ct.edition_id = p_edition_id
     order by ct.starts_at nulls last, ct.name;
end $$;
