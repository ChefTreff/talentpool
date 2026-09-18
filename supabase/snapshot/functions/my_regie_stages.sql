create or replace function my_regie_stages(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stage_id uuid, stage_name text, event_id uuid, edition_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select st.id, st.name, st.event_id, coalesce(e.edition_id, e.id)
      from stage st join event e on e.id = st.event_id
     where st.active
       and (p_edition_id is null or coalesce(e.edition_id, e.id) = p_edition_id)
       and can_edit_regie(st.id)
     order by st.sort_order, st.name;
end $$;
