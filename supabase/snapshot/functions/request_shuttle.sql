create or replace function request_shuttle(p_profile_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_id uuid; v_n integer; v_mail text;
  v_grund text; v_pickup timestamptz; v_latest timestamptz; v_pass integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from speaker_profile sp where sp.id = p_profile_id) then
    raise exception 'speaker_not_found' using errcode = 'P0002';
  end if;
  -- Zweite Linie: sollte die Funktion je wieder NULL liefern, faellt der
  -- Aufruf auf `false` und nicht durch die Pruefung hindurch.
  if not coalesce(can_request_shuttle(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_pickup := nullif(btrim(p_data->>'pickup_at'), '')::timestamptz;
  v_latest := nullif(btrim(p_data->>'latest_arrival_at'), '')::timestamptz;
  v_pass   := coalesce(nullif(btrim(p_data->>'passengers'), '')::integer, 1);
  v_grund  := nullif(btrim(p_data->>'over_limit_reason'), '');

  if nullif(btrim(p_data->>'passenger_name'), '') is null
     or v_pickup is null
     or nullif(btrim(p_data->>'pickup_location'), '') is null
     or nullif(btrim(p_data->>'dropoff_location'), '') is null then
    raise exception 'fields_required' using errcode = '22023',
      detail = 'passenger_name, pickup_at, pickup_location, dropoff_location';
  end if;
  if v_pass < 1 or v_pass > 8 then
    raise exception 'invalid_shuttle' using errcode = '22023', detail = 'passengers:' || v_pass::text;
  end if;
  if v_latest is not null and v_latest < v_pickup then
    raise exception 'invalid_shuttle' using errcode = '22023', detail = 'latest_arrival_at';
  end if;

  -- Obergrenze fünf (D8). Stornierte zählen nicht mit — sonst könnte niemand
  -- eine falsch eingetragene Fahrt zurücknehmen und neu anlegen.
  select count(*) into v_n from shuttle_booking b
   where b.profile_id = p_profile_id and b.status <> 'cancelled';
  if v_n >= 5 and v_grund is null then
    raise exception 'shuttle_limit' using errcode = 'P0001', detail = v_n::text;
  end if;

  -- Die Adresse der handelnden Person, nicht die aus der Eingabe: wer die
  -- Fahrt angefordert hat, soll nachvollziehbar bleiben.
  select pe.email::text into v_mail
    from person_email pe where pe.person_id = v_me and pe.is_primary limit 1;

  insert into shuttle_booking (
    profile_id, passenger_name, passengers, driver_phone, pickup_at,
    pickup_location, pickup_address, dropoff_location, dropoff_address,
    latest_arrival_at, booked_by_email, note, over_limit_reason, created_by
  ) values (
    p_profile_id,
    btrim(p_data->>'passenger_name'),
    v_pass,
    nullif(btrim(p_data->>'driver_phone'), ''),
    v_pickup,
    btrim(p_data->>'pickup_location'),
    nullif(btrim(p_data->>'pickup_address'), ''),
    btrim(p_data->>'dropoff_location'),
    nullif(btrim(p_data->>'dropoff_address'), ''),
    v_latest,
    v_mail,
    nullif(btrim(p_data->>'note'), ''),
    case when v_n >= 5 then v_grund end,
    v_me
  ) returning id into v_id;

  perform log_audit('speaker.shuttle_requested', 'shuttle_booking', v_id::text, null,
    jsonb_build_object('profile_id', p_profile_id, 'pickup_at', v_pickup,
                       'over_limit', v_n >= 5, 'count_before', v_n));

  return jsonb_build_object('id', v_id, 'status', 'requested', 'count_before', v_n);
end $$;
