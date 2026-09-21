create or replace function manager_shuttle_bookings(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, profile_id uuid, speaker_first_name text, speaker_last_name text, passenger_name text, passengers integer, driver_phone text, pickup_at timestamp with time zone, pickup_location text, pickup_address text, dropoff_location text, dropoff_address text, latest_arrival_at timestamp with time zone, status text, note text, over_limit_reason text, booked_by_email text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select b.id, b.profile_id, p.first_name, p.last_name,
         b.passenger_name, b.passengers, b.driver_phone, b.pickup_at,
         b.pickup_location, b.pickup_address, b.dropoff_location, b.dropoff_address,
         b.latest_arrival_at, b.status, b.note, b.over_limit_reason, b.booked_by_email,
         b.created_at
    from shuttle_booking b
    join speaker_profile sp on sp.id = b.profile_id
    join person p           on p.id  = sp.person_id
   where can_manage_speaker(b.profile_id)
     and (p_edition_id is null or sp.edition_id = p_edition_id)
   order by b.pickup_at
$$;
