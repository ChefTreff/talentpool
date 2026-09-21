create or replace function partner_update_tour_stop(p_stop_id uuid, p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_st company_tour_stop; v_bad text; v_mail text; v_prof jsonb; v_key text; v_el text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_st from company_tour_stop where id = p_stop_id;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('address','contact_name','contact_email','contact_phone','time_note',
                   'snacks','notes_public','target_profile','photos_allowed');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;

  v_mail := nullif(btrim(coalesce(p_fields->>'contact_email', '')), '');
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = 'contact_email';
  end if;
  if length(coalesce(p_fields->>'notes_public', '')) > 1000 then
    raise exception 'too_long' using errcode = '22023', detail = 'notes_public';
  end if;
  if length(coalesce(p_fields->>'address', '')) > 300 then
    raise exception 'too_long' using errcode = '22023', detail = 'address';
  end if;

  -- Gesuchte Profile gegen dieselben Vokabulare wie im Teilnehmerprofil.
  if p_fields ? 'target_profile' then
    v_prof := p_fields->'target_profile';
    if jsonb_typeof(v_prof) <> 'object' then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile:object';
    end if;
    for v_key in select jsonb_object_keys(v_prof) loop
      if not (v_key = any(array['occupation_status','career_level','study_field'])) then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key;
      end if;
      for v_el in select jsonb_array_elements_text(v_prof->v_key) loop
        if not is_vocab_key(v_key, v_el) then
          raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el;
        end if;
      end loop;
    end loop;
  end if;

  update company_tour_stop set
    address = case when p_fields ? 'address' then nullif(btrim(p_fields->>'address'), '') else address end,
    contact_name = case when p_fields ? 'contact_name' then nullif(btrim(p_fields->>'contact_name'), '') else contact_name end,
    contact_email = case when p_fields ? 'contact_email' then v_mail::citext else contact_email end,
    contact_phone = case when p_fields ? 'contact_phone' then nullif(btrim(p_fields->>'contact_phone'), '') else contact_phone end,
    time_note = case when p_fields ? 'time_note' then nullif(btrim(p_fields->>'time_note'), '') else time_note end,
    snacks = case when p_fields ? 'snacks' then (p_fields->>'snacks')::boolean else snacks end,
    notes_public = case when p_fields ? 'notes_public' then nullif(btrim(p_fields->>'notes_public'), '') else notes_public end,
    target_profile = case when p_fields ? 'target_profile' then p_fields->'target_profile' else target_profile end,
    photos_allowed = case when p_fields ? 'photos_allowed' then (p_fields->>'photos_allowed')::boolean else photos_allowed end,
    filled_at = now()
  where id = p_stop_id;

  perform log_audit('partner.tour_stop_update', 'company_tour_stop', p_stop_id::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id,
                                       'fields', (select array_agg(k) from jsonb_object_keys(p_fields) k)));
end $$;
