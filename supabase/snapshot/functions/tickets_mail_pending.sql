create or replace function tickets_mail_pending(p_limit integer DEFAULT 50)
 RETURNS TABLE(ticket_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id from ticket t
     where t.source = 'vivenu' and t.status = 'valid'
       and t.personalization_status = 'complete' and t.personalized_at is not null
       and t.vivenu_ticket_id is not null and t.holder_email is not null
       and not t.vivenu_writeback_pending and t.vivenu_mailed_at is null
     order by t.personalized_at
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;
