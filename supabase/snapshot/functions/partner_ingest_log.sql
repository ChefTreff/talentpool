create or replace function partner_ingest_log(p_limit integer DEFAULT 100)
 RETURNS TABLE(kind text, id bigint, external_id text, status text, message text, happened_at timestamp with time zone, payload jsonb, resolved boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select * from (
      select 'sync_error'::text, se.id, se.object_id, case when se.resolved_at is null then 'open' else 'resolved' end, se.message, se.created_at, se.payload, se.resolved_at is not null
      from integration.sync_error se where se.object_type = 'hubspot_deal'
      union all
      select 'webhook'::text, we.id, we.external_id, we.status, we.error, we.received_at,
             jsonb_build_object('event_type', we.event_type, 'related_type', we.related_type, 'related_id', we.related_id, 'signature_valid', we.signature_valid, 'attempts', we.attempts),
             we.status in ('processed', 'duplicate', 'ignored')
      from integration.webhook_event we where we.source = 'hubspot'
    ) x
    order by 6 desc limit greatest(coalesce(p_limit, 100), 1);
end $$;
