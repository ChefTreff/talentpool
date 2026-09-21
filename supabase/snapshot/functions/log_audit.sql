create or replace function log_audit(p_action text, p_object_type text, p_object_id text, p_before jsonb DEFAULT NULL::jsonb, p_after jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  insert into audit_log (actor_person_id, actor_auth_uid, action, object_type, object_id, before, after)
  values (current_person_id(), auth.uid(), p_action, p_object_type, p_object_id, p_before, p_after);
end $$;
