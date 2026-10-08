create or replace function stage_blocked_time_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if new.stage_id is not null
     and not exists (select 1 from stage st where st.id = new.stage_id and st.event_id = new.event_id) then
    raise exception 'stage_not_found' using errcode = 'P0002', detail = 'stage_event_mismatch';
  end if;
  return new;
end $$;
