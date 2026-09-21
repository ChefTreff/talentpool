create or replace function shuttle_bookings_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, profile_id uuid, speaker_first_name text, speaker_last_name text, passenger_name text, passengers integer, driver_phone text, pickup_at timestamp with time zone, pickup_location text, pickup_address text, dropoff_location text, dropoff_address text, latest_arrival_at timestamp with time zone, status text, note text, over_limit_reason text, booked_by_email text, confirmed_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select b.id, b.profile_id, p.first_name, p.last_name,
           b.passenger_name, b.passengers, b.driver_phone, b.pickup_at,
           b.pickup_location, b.pickup_address, b.dropoff_location, b.dropoff_address,
           b.latest_arrival_at, b.status, b.note, b.over_limit_reason, b.booked_by_email,
           b.confirmed_at, b.created_at
      from shuttle_booking b
      join speaker_profile sp on sp.id = b.profile_id
      join person p           on p.id  = sp.person_id
     where sp.edition_id = v_ed
     order by b.pickup_at;
end $$;
