create or replace function upsert_track(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_before jsonb;
begin
  if v_id is not null then
    select t.event_id, to_jsonb(t) into v_event, v_before from track t where t.id = v_id;
    if v_event is null then raise exception 'track_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is null then
    insert into track (event_id, name_de, name_en, slug, sort_order)
    values (v_event, btrim(p_data->>'name_de'), nullif(btrim(p_data->>'name_en'), ''),
            nullif(btrim(p_data->>'slug'), ''), coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update track set
      name_de    = coalesce(nullif(btrim(p_data->>'name_de'), ''), name_de),
      name_en    = case when p_data ? 'name_en' then nullif(btrim(p_data->>'name_en'), '') else name_en end,
      slug       = case when p_data ? 'slug' then nullif(btrim(p_data->>'slug'), '') else slug end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order)
    where id = v_id;
  end if;

  perform log_audit('programme.track_upsert', 'track', v_id::text, v_before, p_data);
  return v_id;
end $$;
