create or replace function initiative_stage_history(p_org_edition_id uuid)
 RETURNS TABLE(stage text, note text, changed_at timestamp with time zone, changed_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.stage, l.note, l.changed_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from initiative_stage_log l
      left join person p on p.id = l.changed_by
     where l.org_edition_id = p_org_edition_id
     order by l.changed_at desc
     limit 200;
end $$;
