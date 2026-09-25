create or replace function audit_log_admin(p_action text DEFAULT NULL::text, p_object_type text DEFAULT NULL::text, p_object_id text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id bigint, created_at timestamp with time zone, action text, object_type text, object_id text, actor_person_id uuid, actor_name text, vorher jsonb, nachher jsonb, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
        v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not has_admin_section('auditLog') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  with treffer as (
    select a.id, a.created_at, a.action, a.object_type, a.object_id, a.actor_person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as actor_name,
           a.before, a.after
      from audit_log a
      left join person p on p.id = a.actor_person_id
     where (p_action is null or a.action = p_action)
       and (p_object_type is null or a.object_type = p_object_type)
       and (p_object_id is null or a.object_id = p_object_id)
       and (p_actor is null or a.actor_person_id = p_actor)
       and (p_from is null or a.created_at >= p_from)
       and (p_to is null or a.created_at < p_to)
  )
  select t.id, t.created_at, t.action, t.object_type, t.object_id, t.actor_person_id, t.actor_name,
         t.before, t.after,
         -- Gesamtzahl aus demselben Ausdruck: eine zweite Zaehlfunktion waere ein
         -- zweiter Filter, der irgendwann vom ersten abweicht.
         count(*) over ()
    from treffer t
   order by t.id desc
   limit v_limit offset v_offset;
end $$;
