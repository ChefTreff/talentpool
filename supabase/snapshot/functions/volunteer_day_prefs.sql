create or replace function volunteer_day_prefs(p_data jsonb, p_edition_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_out uuid[] := '{}'; r record; v_text text;
begin
  for r in select value from jsonb_array_elements_text(coalesce(p_data->'day_prefs', '[]'::jsonb)) loop
    v_text := nullif(btrim(coalesce(r.value, '')), '');
    continue when v_text is null;
    if v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'day_not_found' using errcode = 'P0002', detail = coalesce(v_text, 'null');
    end if;
    if not day_of_edition(v_text::uuid, p_edition_id) then
      raise exception 'day_not_found' using errcode = 'P0002', detail = coalesce(v_text, 'null');
    end if;
    v_out := v_out || v_text::uuid;
  end loop;
  return v_out;
end $$;
