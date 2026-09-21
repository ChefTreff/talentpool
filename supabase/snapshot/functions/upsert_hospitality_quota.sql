create or replace function upsert_hospitality_quota(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is null then
    insert into hospitality_quota (edition_id, kind, tier, label_de, label_en, description_de, description_en, location, capacity, window_from, window_to, notes, active, sort_order)
    values ((p_data->>'edition_id')::uuid, p_data->>'kind', nullif(p_data->>'tier', ''), p_data->>'label_de', p_data->>'label_en',
            nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''), nullif(p_data->>'location', ''),
            coalesce((p_data->>'capacity')::integer, 0), nullif(p_data->>'window_from', '')::timestamptz, nullif(p_data->>'window_to', '')::timestamptz,
            nullif(p_data->>'notes', ''), coalesce((p_data->>'active')::boolean, true), coalesce((p_data->>'sort_order')::integer, 100))
    returning id into v_id;
  else
    update hospitality_quota set
      label_de = coalesce(p_data->>'label_de', label_de), label_en = coalesce(p_data->>'label_en', label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      location = case when p_data ? 'location' then nullif(p_data->>'location', '') else location end,
      capacity = coalesce((p_data->>'capacity')::integer, capacity),
      window_from = case when p_data ? 'window_from' then nullif(p_data->>'window_from', '')::timestamptz else window_from end,
      window_to = case when p_data ? 'window_to' then nullif(p_data->>'window_to', '')::timestamptz else window_to end,
      notes = case when p_data ? 'notes' then nullif(p_data->>'notes', '') else notes end,
      active = coalesce((p_data->>'active')::boolean, active),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      tier = case when p_data ? 'tier' then nullif(p_data->>'tier', '') else tier end
    where id = v_id;
    if not found then raise exception 'quota_not_found' using errcode = 'P0002'; end if;
  end if;
  perform log_audit('hospitality.quota', 'hospitality_quota', v_id::text, null, p_data);
  return v_id;
end $$;
