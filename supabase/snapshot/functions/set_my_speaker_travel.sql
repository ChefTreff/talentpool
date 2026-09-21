create or replace function set_my_speaker_travel(p_data jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_id uuid; v_owner uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_id := my_speaker_profile_id(p_edition_id);
  if v_id is null then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  insert into speaker_travel (profile_id, arrival_date, arrival_time, arrival_mode, arrival_ref,
                              departure_date, departure_time, departure_mode, departure_ref,
                              needs_pickup, note, updated_by)
  values (v_id,
          nullif(p_data->>'arrival_date', '')::date, nullif(p_data->>'arrival_time', '')::time,
          check_travel_mode(p_data->>'arrival_mode'), nullif(btrim(p_data->>'arrival_ref'), ''),
          nullif(p_data->>'departure_date', '')::date, nullif(p_data->>'departure_time', '')::time,
          check_travel_mode(p_data->>'departure_mode'), nullif(btrim(p_data->>'departure_ref'), ''),
          coalesce((p_data->>'needs_pickup')::boolean, false),
          nullif(btrim(p_data->>'note'), ''), v_me)
  on conflict (profile_id) do update set
    -- Nur überschreiben, was mitgeschickt wurde: das Formular darf einen
    -- Abschnitt speichern, ohne den anderen zu leeren.
    arrival_date    = case when p_data ? 'arrival_date'    then nullif(p_data->>'arrival_date', '')::date    else speaker_travel.arrival_date end,
    arrival_time    = case when p_data ? 'arrival_time'    then nullif(p_data->>'arrival_time', '')::time    else speaker_travel.arrival_time end,
    arrival_mode    = case when p_data ? 'arrival_mode'    then check_travel_mode(p_data->>'arrival_mode')   else speaker_travel.arrival_mode end,
    arrival_ref     = case when p_data ? 'arrival_ref'     then nullif(btrim(p_data->>'arrival_ref'), '')    else speaker_travel.arrival_ref end,
    departure_date  = case when p_data ? 'departure_date'  then nullif(p_data->>'departure_date', '')::date  else speaker_travel.departure_date end,
    departure_time  = case when p_data ? 'departure_time'  then nullif(p_data->>'departure_time', '')::time  else speaker_travel.departure_time end,
    departure_mode  = case when p_data ? 'departure_mode'  then check_travel_mode(p_data->>'departure_mode') else speaker_travel.departure_mode end,
    departure_ref   = case when p_data ? 'departure_ref'   then nullif(btrim(p_data->>'departure_ref'), '')  else speaker_travel.departure_ref end,
    needs_pickup    = case when p_data ? 'needs_pickup'    then coalesce((p_data->>'needs_pickup')::boolean, false) else speaker_travel.needs_pickup end,
    note            = case when p_data ? 'note'            then nullif(btrim(p_data->>'note'), '')           else speaker_travel.note end,
    updated_by      = v_me,
    updated_at      = now();

  -- Die Assistenz darf pflegen; dass sie es war, steht danach im Protokoll.
  select sp.person_id into v_owner from speaker_profile sp where sp.id = v_id;
  if v_owner <> v_me then
    perform log_audit('speaker.travel_assistant', 'speaker_profile', v_id::text, null, p_data);
  end if;
  return v_id;
end $$;
