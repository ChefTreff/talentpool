create or replace function my_shuttle_bookings()
 RETURNS TABLE(id uuid, passenger_name text, passengers integer, driver_phone text, pickup_at timestamp with time zone, pickup_location text, pickup_address text, dropoff_location text, dropoff_address text, latest_arrival_at timestamp with time zone, status text, note text, over_limit_reason text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select b.id, b.passenger_name, b.passengers, b.driver_phone, b.pickup_at,
         b.pickup_location, b.pickup_address, b.dropoff_location, b.dropoff_address,
         b.latest_arrival_at, b.status, b.note, b.over_limit_reason, b.created_at
    from shuttle_booking b
   where b.profile_id = my_speaker_profile_id()
   order by b.pickup_at
$$;
