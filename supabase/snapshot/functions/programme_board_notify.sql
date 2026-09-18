create or replace function programme_board_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_event uuid;
  v_id    uuid;
begin
  if tg_table_name = 'slot' then
    select st.event_id into v_event from stage st where st.id = coalesce(new.stage_id, old.stage_id);
    v_id := coalesce(new.id, old.id);
  else
    v_event := coalesce(new.event_id, old.event_id);
    v_id    := coalesce(new.id, old.id);
  end if;
  if v_event is null then
    return null;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'realtime' and p.proname = 'send') then
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'id', v_id, 'op', tg_op),
      'changed',
      'programme-board:' || v_event::text,
      true
    );
  end if;
  return null;
end $$;
