create or replace function stage_slot_check(p_stage_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_slot_type text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_stage stage%rowtype; v_tz text; v_date date; v_b record;
begin
  select * into v_stage from stage where id = p_stage_id;
  if not found then return; end if;   -- „Bühne nicht gefunden“ meldet die aufrufende Funktion selbst
  select coalesce(e.timezone, 'Europe/Berlin') into v_tz from event e where e.id = v_stage.event_id;
  v_date := (p_start at time zone v_tz)::date;

  if cardinality(v_stage.valid_days) > 0 and not (v_date = any (v_stage.valid_days)) then
    raise exception 'stage_not_valid_that_day' using errcode = 'P0001', detail = to_char(v_date, 'DD.MM.YYYY');
  end if;

  if p_slot_type = 'content' then
    select b.reason, b.starts_at, b.ends_at into v_b
      from stage_blocked_time b
     where b.event_id = v_stage.event_id
       and (b.stage_id is null or b.stage_id = p_stage_id)
       and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
     order by b.starts_at, b.id
     limit 1;
    if found then
      raise exception 'slot_blocked' using errcode = 'P0001',
        detail = v_b.reason || ' · ' || case
          when (v_b.starts_at at time zone v_tz)::date = (v_b.ends_at at time zone v_tz)::date
            then to_char(v_b.starts_at at time zone v_tz, 'HH24:MI') || '–' || to_char(v_b.ends_at at time zone v_tz, 'HH24:MI')
          else to_char(v_b.starts_at at time zone v_tz, 'DD.MM. HH24:MI') || ' – ' || to_char(v_b.ends_at at time zone v_tz, 'DD.MM. HH24:MI')
        end;
    end if;
  end if;
end $$;
