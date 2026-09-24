create or replace function my_tickets()
 RETURNS TABLE(ticket_id uuid, edition_id uuid, edition_name text, pass_type text, status text, barcode text, holder_first_name text, holder_last_name text, checked_in_at timestamp with time zone, wallet_available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select t.id, ed.id, ed.name, t.pass_type, t.status,
           case when t.status in ('valid', 'checked_in') then t.barcode end,
           t.holder_first_name, t.holder_last_name, t.checked_in_at,
           (t.vivenu_ticket_id is not null and exists (select 1 from ticket_secret s where s.ticket_id = t.id))
      from ticket t
      join event te on te.id = t.event_id
      join event ed on ed.id = coalesce(te.edition_id, te.id) and ed.is_edition
     where t.person_id = v_me
       and t.status in ('valid', 'checked_in', 'requested')
     order by ed.start_date desc nulls last, t.created_at;
end $$;
