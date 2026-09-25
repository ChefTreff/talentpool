create or replace function company_tour_stops_admin(p_tour_id uuid)
 RETURNS TABLE(stop_id uuid, sort_order integer, arrival_at timestamp with time zone, departure_at timestamp with time zone, host_org_id uuid, host_org_name text, address text, contact_name text, time_note text, snacks boolean, notes_public text, filled_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_admin_section('companyTours') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select s.id, s.sort_order, s.arrival_at, s.departure_at, s.host_org_id,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           s.address, s.contact_name, s.time_note, s.snacks, s.notes_public, s.filled_at
      from company_tour_stop s
      left join organization o on o.id = s.host_org_id
     where s.tour_id = p_tour_id
     order by s.sort_order, s.arrival_at nulls last;
end $$;
