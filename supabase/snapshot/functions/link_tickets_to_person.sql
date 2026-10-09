create or replace function link_tickets_to_person(p_person_id uuid, p_email citext)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer := 0; v_m integer;
begin
  if p_person_id is null or p_email is null then return 0; end if;
  update ticket set person_id = p_person_id, updated_at = now()
   where person_id is null and status in ('valid', 'checked_in') and holder_email = p_email;
  get diagnostics v_m = row_count; v_n := v_n + v_m;
  update ticket set person_id = p_person_id, updated_at = now()
   where person_id is null and status in ('valid', 'checked_in') and holder_email is null and buyer_email = p_email;
  get diagnostics v_m = row_count; v_n := v_n + v_m;
  if v_n > 0 then
    perform log_audit('ticket.claim', 'person', p_person_id::text, null, jsonb_build_object('tickets', v_n));
  end if;
  return v_n;
end $$;
