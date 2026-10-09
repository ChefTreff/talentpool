create or replace function my_transaction_tickets(p_transaction_id text)
 RETURNS TABLE(ticket_id uuid, pass_type text, vivenu_ticket_type_id text, status text, personalization_status text, holder_first_name text, holder_last_name text, holder_company text, holder_position text, holder_email text, for_me boolean, addons jsonb, writeback_pending boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_email citext := auth.email();
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if nullif(btrim(coalesce(p_transaction_id, '')), '') is null then return; end if;
  return query
    select t.id, t.pass_type, t.vivenu_ticket_type_id, t.status, t.personalization_status,
           t.holder_first_name, t.holder_last_name, t.holder_company, t.holder_position,
           t.holder_email::text,
           (v_pid is not null and t.person_id = v_pid),
           t.addons, t.vivenu_writeback_pending
      from ticket t
     where t.vivenu_transaction_id = btrim(p_transaction_id)
       and t.status = 'valid'
       and ((v_email is not null and t.buyer_email = v_email) or (v_pid is not null and t.person_id = v_pid))
     order by t.created_at, t.id;
end $$;
