create or replace function ticket_writeback_data(p_ticket_id uuid)
 RETURNS TABLE(vivenu_ticket_id text, secret text, vivenu_ticket_type_id text, vivenu_event_id text, first_name text, last_name text, company text, job_position text, holder_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.vivenu_ticket_id, s.secret, t.vivenu_ticket_type_id, e.vivenu_event_id,
           t.holder_first_name, t.holder_last_name, t.holder_company, t.holder_position, t.holder_email::text
      from ticket t
      join ticket_secret s on s.ticket_id = t.id
      left join event e on e.id = t.event_id
     where t.id = p_ticket_id and t.vivenu_ticket_id is not null;
end $$;
