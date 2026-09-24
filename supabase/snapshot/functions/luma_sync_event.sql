create or replace function luma_sync_event(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_luma text := nullif(btrim(coalesce(p_data->>'luma_id', '')), '');
  v_id uuid;
  v_start timestamptz := nullif(p_data->>'start_at', '')::timestamptz;
  v_end timestamptz := nullif(p_data->>'end_at', '')::timestamptz;
  v_tz text := coalesce(nullif(p_data->>'timezone', ''), 'Europe/Berlin');
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_luma is null then raise exception 'luma_event_id_required' using errcode = '22023'; end if;

  select r.object_id into v_id from external_ref r
   where r.system = 'luma' and r.object_type = 'event' and r.external_id = v_luma;

  if v_id is null then
    insert into event (name, format_tag, is_edition, start_date, end_date, location, timezone, status)
    values (coalesce(nullif(btrim(p_data->>'name'), ''), v_luma), 'community', false,
            (v_start at time zone v_tz)::date, (v_end at time zone v_tz)::date,
            nullif(btrim(p_data->>'city'), ''), v_tz, 'published')
    returning id into v_id;
    insert into external_ref (system, object_type, object_id, external_id, meta)
    values ('luma', 'event', v_id, v_luma, jsonb_build_object('url', p_data->>'url'));
  else
    update event set
      name = coalesce(nullif(btrim(p_data->>'name'), ''), name),
      start_date = coalesce((v_start at time zone v_tz)::date, start_date),
      end_date = coalesce((v_end at time zone v_tz)::date, end_date),
      location = coalesce(nullif(btrim(p_data->>'city'), ''), location),
      timezone = v_tz
     where id = v_id;
    update external_ref set meta = jsonb_build_object('url', p_data->>'url'), updated_at = now()
     where system = 'luma' and object_type = 'event' and object_id = v_id;
  end if;
  return v_id;
end $$;
