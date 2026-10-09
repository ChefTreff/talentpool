create or replace function ticket_personalization_overview(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_id uuid, event_name text, pending integer, partial integer, complete integer, writeback_open integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('applications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.event_id, e.name,
           (count(*) filter (where t.personalization_status = 'pending'))::integer,
           (count(*) filter (where t.personalization_status = 'partial'))::integer,
           (count(*) filter (where t.personalization_status = 'complete'))::integer,
           (count(*) filter (where t.vivenu_writeback_pending))::integer
      from ticket t
      join event e on e.id = t.event_id
     where t.source = 'vivenu' and t.status = 'valid'
       and (p_edition_id is null or t.event_id = p_edition_id)
     group by t.event_id, e.name, e.start_date
     order by e.start_date desc nulls last, e.name;
end $$;
