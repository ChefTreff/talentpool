create or replace function person_merges_admin(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, merged_at timestamp with time zone, survivor_id uuid, survivor_name text, merged_person_id uuid, merged_name text, merged_email text, actor_name text, moved_rows integer, undone_at timestamp with time zone, can_undo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.id, l.merged_at, l.surviving_person_id,
           nullif(btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), ''),
           l.merged_person_id,
           nullif(btrim(coalesce(l.payload->'undo'->'merged_row'->>'first_name', '') || ' '
                        || coalesce(l.payload->'undo'->'merged_row'->>'last_name', '')), ''),
           (select pe.email::text from person_email pe
             where pe.id in (select (e->>'id')::uuid from jsonb_array_elements(l.payload->'undo'->'emails') e
                              where (e->>'primary')::boolean)),
           (select nullif(btrim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')
              from person a where a.auth_user_id::text = l.actor),
           (select coalesce(sum((m->>'rows')::integer), 0)::integer from jsonb_array_elements(l.payload->'report'->'moved') m),
           l.undone_at,
           l.undone_at is null and l.payload->'undo' is not null
             and l.surviving_person_id = (l.payload->'undo'->>'survivor_id')::uuid
      from person_merge_log l
      left join person s on s.id = l.surviving_person_id
     order by l.merged_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;
