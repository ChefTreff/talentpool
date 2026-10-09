create or replace function mark_ticket_writeback(p_ticket_id uuid, p_pending boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update ticket set vivenu_writeback_pending = coalesce(p_pending, false), updated_at = now() where id = p_ticket_id;
end $$;
