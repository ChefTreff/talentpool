create or replace function backfill_ticket_pass_types()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if auth.uid() is not null and not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  with gefuellt as (
    update ticket t set pass_type = m.pass_type, ticket_type_map_id = m.id, updated_at = now()
      from ticket_type_map m
     where t.pass_type is null
       and m.event_id = t.event_id
       and m.vivenu_ticket_type_id = t.vivenu_ticket_type_id
    returning 1)
  select count(*)::integer into v_n from gefuellt;
  return coalesce(v_n, 0);
end $$;
