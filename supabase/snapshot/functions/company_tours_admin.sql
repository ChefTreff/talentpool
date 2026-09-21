create or replace function company_tours_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tour_id uuid, name text, track text, meeting_point text, starts_at timestamp with time zone, ends_at timestamp with time zone, lead_name text, stops integer, stops_filled integer, capacity integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (is_partner_team() or is_programme_editor(null)) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select ct.id, ct.name, ct.track, ct.meeting_point, ct.starts_at, ct.ends_at, ec.display_name,
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id),
           (select count(*)::integer from company_tour_stop s where s.tour_id = ct.id and s.filled_at is not null),
           ct.capacity
      from company_tour ct
      left join edition_contact ec on ec.id = ct.lead_contact_id
     where p_edition_id is null or ct.edition_id = p_edition_id
     order by ct.starts_at nulls last, ct.name;
end $$;
