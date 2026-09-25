create or replace function audit_log_filters()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_admin_section('auditLog') then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    -- Nur, was wirklich vorkommt: eine Auswahlliste mit Aktionen, die es nicht
    -- gibt, schickt jeden Filterversuch ins Leere.
    'actions', coalesce((select jsonb_agg(x.action order by x.action)
                           from (select distinct a.action from audit_log a) x), '[]'::jsonb),
    'object_types', coalesce((select jsonb_agg(x.object_type order by x.object_type)
                                from (select distinct a.object_type from audit_log a
                                       where a.object_type is not null) x), '[]'::jsonb),
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.name)
                          from (select distinct p.id,
                                       nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name
                                  from audit_log a join person p on p.id = a.actor_person_id) x
                         where x.name is not null), '[]'::jsonb));
end $$;
