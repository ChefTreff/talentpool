create or replace function shop_request_answer(p_id uuid, p_answer text, p_status text DEFAULT 'answered'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('answered', 'closed', 'open') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update shop_request set answer = nullif(btrim(coalesce(p_answer, '')), ''), status = p_status, answered_by = current_person_id(), answered_at = now() where id = p_id;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  perform log_audit('shop.request_answer', 'shop_request', p_id::text, null, jsonb_build_object('status', p_status));
end $$;
