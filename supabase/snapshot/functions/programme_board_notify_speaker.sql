create or replace function programme_board_notify_speaker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_sess uuid := coalesce(new.session_id, old.session_id);
begin
  select event_id into v_event from session where id = v_sess;
  if v_event is not null and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                     where n.nspname = 'realtime' and p.proname = 'send') then
    perform realtime.send(jsonb_build_object('table', 'session_speaker', 'id', v_sess, 'op', tg_op),
                          'changed', 'programme-board:' || v_event::text, true);
  end if;
  return null;
end $$;
