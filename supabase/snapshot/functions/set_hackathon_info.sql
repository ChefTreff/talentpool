create or replace function set_hackathon_info(p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; e event; v_sd date; v_ed_date date; v_st time; v_et time; v_changed text[] := '{}'; k text;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := hack_edition(nullif(p_data->>'edition_id', '')::uuid);
  select * into e from event x where x.format_tag = 'hackathon' and x.edition_id = v_ed limit 1;
  if e.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_sd := case when p_data ? 'start_date' then nullif(p_data->>'start_date', '')::date else e.start_date end;
  v_ed_date := case when p_data ? 'end_date' then nullif(p_data->>'end_date', '')::date else e.end_date end;
  v_st := case when p_data ? 'start_time' then nullif(p_data->>'start_time', '')::time else e.start_time end;
  v_et := case when p_data ? 'end_time' then nullif(p_data->>'end_time', '')::time else e.end_time end;
  -- Ende nicht vor dem Beginn: Datum allein, und mit beiden Uhrzeiten auch die Zeit.
  if v_sd is not null and v_ed_date is not null
     and (v_ed_date, coalesce(v_et, time '23:59:59')) < (v_sd, coalesce(v_st, time '00:00')) then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if length(coalesce(p_data->>'schedule_note_de', '')) > 200 or length(coalesce(p_data->>'schedule_note_en', '')) > 200 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  update event set
    start_date = v_sd, end_date = v_ed_date, start_time = v_st, end_time = v_et,
    schedule_note_de = case when p_data ? 'schedule_note_de' then nullif(btrim(p_data->>'schedule_note_de'), '') else schedule_note_de end,
    schedule_note_en = case when p_data ? 'schedule_note_en' then nullif(btrim(p_data->>'schedule_note_en'), '') else schedule_note_en end,
    venue = case when p_data ? 'venue' then nullif(btrim(p_data->>'venue'), '') else venue end,
    location = case when p_data ? 'location' then nullif(btrim(p_data->>'location'), '') else location end,
    updated_at = now()
   where id = e.id;
  foreach k in array array['start_date', 'end_date', 'start_time', 'end_time', 'schedule_note_de', 'schedule_note_en', 'venue', 'location'] loop
    if p_data ? k then v_changed := array_append(v_changed, k); end if;
  end loop;
  perform log_audit('hack.info_set', 'event', e.id::text, null, jsonb_build_object('fields', to_jsonb(v_changed)));
end $$;
