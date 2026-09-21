create or replace function finish_webhook_event(p_id bigint, p_status text, p_error text DEFAULT NULL::text, p_related_type text DEFAULT NULL::text, p_related_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update integration.webhook_event
     set status = p_status, error = p_error, processed_at = now(), attempts = attempts + 1,
         related_type = coalesce(p_related_type, related_type), related_id = coalesce(p_related_id, related_id)
   where id = p_id;
  if not found then raise exception 'webhook_event_not_found' using errcode = 'P0002'; end if;
end $$;
