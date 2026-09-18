create or replace function slot_consistency_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ev uuid; v_ev2 uuid;
begin
  select event_id into v_ev  from stage     where id = new.stage_id;
  select event_id into v_ev2 from event_day where id = new.event_day_id;
  if v_ev is distinct from v_ev2 then
    raise exception 'slot: stage and event_day belong to different events' using errcode = '23514';
  end if;
  return new;
end $$;
