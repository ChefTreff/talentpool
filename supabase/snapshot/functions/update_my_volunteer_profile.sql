create or replace function update_my_volunteer_profile(p_data jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid; v_p volunteer_profile; v_shirt text; v_areas text[]; v_days uuid[]; a text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  select * into v_p from volunteer_profile where person_id = v_pid and edition_id = v_ed for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  if v_p.status = 'declined' then raise exception 'not_editable' using errcode = 'P0001', detail = v_p.status; end if;

  if p_data ? 'shirt_size' then
    v_shirt := nullif(btrim(coalesce(p_data->>'shirt_size', '')), '');
    if v_shirt is not null and not is_vocab_key('shirt_size', v_shirt) then
      raise exception 'invalid_shirt_size' using errcode = '22023', detail = v_shirt;
    end if;
  end if;
  if p_data ? 'areas' then
    v_areas := coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'areas') x
                          where nullif(btrim(x), '') is not null), '{}');
    foreach a in array v_areas loop
      if not is_vocab_key('volunteer_area', a) then raise exception 'invalid_area' using errcode = '22023', detail = a; end if;
    end loop;
  end if;
  if p_data ? 'day_prefs' then v_days := volunteer_day_prefs(p_data, v_ed); end if;

  update volunteer_profile set
    shirt_size   = case when p_data ? 'shirt_size' then v_shirt else shirt_size end,
    areas        = case when p_data ? 'areas' then v_areas else areas end,
    day_prefs    = case when p_data ? 'day_prefs' then v_days else day_prefs end,
    availability = case when p_data ? 'availability' then p_data->'availability' else availability end,
    buddy_note   = case when p_data ? 'buddy_note' then nullif(btrim(coalesce(p_data->>'buddy_note', '')), '') else buddy_note end,
    status       = case when coalesce(p_data->>'status', '') = 'withdrawn' then 'withdrawn' else status end
  where id = v_p.id;
  perform log_audit('volunteer.update_profile', 'volunteer_profile', v_p.id::text, null, p_data - 'availability');
end $$;
