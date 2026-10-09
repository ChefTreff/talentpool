create or replace function tickets_writeback_pending(p_limit integer DEFAULT 50)
 RETURNS TABLE(ticket_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id from ticket t
     where t.vivenu_writeback_pending and t.status = 'valid'
     order by t.updated_at limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;
