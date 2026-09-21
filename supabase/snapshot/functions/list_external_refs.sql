create or replace function list_external_refs(p_system text, p_object_type text)
 RETURNS TABLE(object_id uuid, external_id text, meta jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.object_id, r.external_id, r.meta, r.updated_at from external_ref r
    where r.system = p_system and r.object_type = p_object_type
    order by r.updated_at desc;
end $$;
