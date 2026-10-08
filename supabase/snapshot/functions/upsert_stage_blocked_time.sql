create or replace function upsert_stage_blocked_time(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_cur stage_blocked_time%rowtype;
  v_event uuid; v_stage uuid; v_from timestamptz; v_to timestamptz; v_reason text; v_before jsonb; v_n integer;
begin
  if not has_admin_section('programme') then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is not null then
    select * into v_cur from stage_blocked_time where id = v_id for update;
    if not found then raise exception 'blocked_time_not_found' using errcode = 'P0002'; end if;
    v_event := v_cur.event_id;
    v_before := to_jsonb(v_cur);
  else
    begin
      v_event := nullif(p_data->>'event_id', '')::uuid;
    exception when others then
      raise exception 'event_not_found' using errcode = 'P0002';
    end;
    if not exists (select 1 from event e where e.id = v_event and not e.is_edition) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;

  begin
    v_stage  := case when p_data ? 'stage_id' then nullif(p_data->>'stage_id', '')::uuid else v_cur.stage_id end;
    v_from   := case when p_data ? 'starts_at' then (p_data->>'starts_at')::timestamptz else v_cur.starts_at end;
    v_to     := case when p_data ? 'ends_at' then (p_data->>'ends_at')::timestamptz else v_cur.ends_at end;
  exception when others then
    raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'format';
  end;
  v_reason := case when p_data ? 'reason' then nullif(btrim(p_data->>'reason'), '') else v_cur.reason end;

  if v_from is null or v_to is null or v_to <= v_from then
    raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'range';
  end if;
  if v_reason is null then raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'reason_required'; end if;
  if length(v_reason) > 200 then raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'reason_too_long'; end if;
  if v_stage is not null and not exists (select 1 from stage st where st.id = v_stage and st.event_id = v_event) then
    raise exception 'stage_not_found' using errcode = 'P0002';
  end if;

  if v_id is null then
    insert into stage_blocked_time (event_id, stage_id, starts_at, ends_at, reason, created_by)
    values (v_event, v_stage, v_from, v_to, v_reason, current_person_id())
    returning id into v_id;
  else
    update stage_blocked_time set stage_id = v_stage, starts_at = v_from, ends_at = v_to, reason = v_reason where id = v_id;
  end if;

  -- Vorhandene Inhalts-Slots in der Sperrzeit bleiben; sie werden beim nächsten Verschieben geprüft. Die Zahl sagt dem Team, was es sieht.
  select count(*)::integer into v_n
    from slot s join stage st on st.id = s.stage_id
   where st.event_id = v_event
     and (v_stage is null or s.stage_id = v_stage)
     and s.slot_type = 'content'
     and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(v_from, v_to, '[)');

  perform log_audit('programme.blocked_time_upsert', 'stage_blocked_time', v_id::text, v_before,
                    jsonb_build_object('event_id', v_event, 'stage_id', v_stage, 'starts_at', v_from, 'ends_at', v_to,
                                       'reason', v_reason, 'slots_affected', v_n));
  return jsonb_build_object('id', v_id, 'affected', v_n);
end $$;
