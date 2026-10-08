create or replace function upsert_stage(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_type text; v_before jsonb;
        v_valid date[]; v_d text; v_day date;
begin
  if v_id is not null then
    select st.event_id into v_event from stage st where st.id = v_id;
    if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_type := nullif(p_data->>'type', '');
  -- Vorher: v_type not in ('main', 'side', 'partner_booth', 'room')
  if v_type is not null and not is_vocab_key('stage_type', v_type) then
    raise exception 'invalid_stage_type' using errcode = '22023', detail = v_type;
  end if;

  -- ADM-085: Gültigkeitstage — leer heißt alle Eventtage; jedes Datum muss ein Tag dieses Events sein.
  if p_data ? 'valid_days' then
    if jsonb_typeof(p_data -> 'valid_days') is distinct from 'array' then
      raise exception 'invalid_valid_day' using errcode = '22023', detail = 'not_an_array';
    end if;
    v_valid := '{}';
    for v_d in select jsonb_array_elements_text(p_data -> 'valid_days') loop
      begin
        v_day := v_d::date;
      exception when others then
        raise exception 'invalid_valid_day' using errcode = '22023', detail = left(v_d, 40);
      end;
      if not exists (select 1 from event_day ed where ed.event_id = v_event and ed.day_date = v_day) then
        raise exception 'invalid_valid_day' using errcode = '22023', detail = v_d;
      end if;
      v_valid := array_append(v_valid, v_day);
    end loop;
    select coalesce(array_agg(distinct x order by x), '{}') into v_valid from unnest(v_valid) x;
  end if;

  select to_jsonb(st) into v_before from stage st where st.id = v_id;

  if v_id is null then
    insert into stage (event_id, name, slug, type, room, capacity, partner_org_id, stage_lead_person_id,
                       changeover_min, default_duration_min, partner_slot_quota, sort_order, active, valid_days)
    values (v_event, btrim(p_data->>'name'), nullif(btrim(p_data->>'slug'), ''), coalesce(v_type, 'main'),
            nullif(btrim(p_data->>'room'), ''), (p_data->>'capacity')::integer,
            nullif(p_data->>'partner_org_id', '')::uuid, nullif(p_data->>'stage_lead_person_id', '')::uuid,
            coalesce((p_data->>'changeover_min')::integer, 0),
            coalesce((p_data->>'default_duration_min')::integer, 30),
            (p_data->>'partner_slot_quota')::integer,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce((p_data->>'active')::boolean, true), coalesce(v_valid, '{}'))
    returning id into v_id;
  else
    update stage set
      name                 = coalesce(nullif(btrim(p_data->>'name'), ''), name),
      slug                 = case when p_data ? 'slug' then nullif(btrim(p_data->>'slug'), '') else slug end,
      type                 = coalesce(v_type, type),
      room                 = case when p_data ? 'room' then nullif(btrim(p_data->>'room'), '') else room end,
      capacity             = case when p_data ? 'capacity' then (p_data->>'capacity')::integer else capacity end,
      partner_org_id       = case when p_data ? 'partner_org_id' then nullif(p_data->>'partner_org_id', '')::uuid else partner_org_id end,
      stage_lead_person_id = case when p_data ? 'stage_lead_person_id' then nullif(p_data->>'stage_lead_person_id', '')::uuid else stage_lead_person_id end,
      changeover_min       = coalesce((p_data->>'changeover_min')::integer, changeover_min),
      default_duration_min = coalesce((p_data->>'default_duration_min')::integer, default_duration_min),
      partner_slot_quota   = case when p_data ? 'partner_slot_quota' then (p_data->>'partner_slot_quota')::integer else partner_slot_quota end,
      sort_order           = coalesce((p_data->>'sort_order')::integer, sort_order),
      active               = coalesce((p_data->>'active')::boolean, active),
      valid_days           = case when p_data ? 'valid_days' then v_valid else valid_days end
    where id = v_id;
  end if;

  perform log_audit('programme.stage_upsert', 'stage', v_id::text, v_before, p_data);
  return v_id;
end $$;
