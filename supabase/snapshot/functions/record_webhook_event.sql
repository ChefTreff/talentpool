create or replace function record_webhook_event(p_source text, p_event_type text, p_external_id text, p_payload jsonb, p_headers jsonb DEFAULT NULL::jsonb, p_signature_valid boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id bigint; v_dup boolean := false;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into integration.webhook_event (source, event_type, external_id, signature_valid, payload, headers, received_at, status, attempts)
  values (p_source, p_event_type, nullif(p_external_id, ''), p_signature_valid, coalesce(p_payload, '{}'::jsonb), p_headers, now(), 'received', 0)
  on conflict (source, external_id) where external_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from integration.webhook_event where source = p_source and external_id = p_external_id;
    update integration.webhook_event set attempts = attempts + 1 where id = v_id;
    v_dup := true;
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', v_dup);
end $$;
