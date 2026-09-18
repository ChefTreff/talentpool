create or replace function session_assets_admin(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, session_id uuid, session_title text, stage_name text, start_at timestamp with time zone, kind text, storage_path text, filename text, cutout boolean, credit text, version integer, is_current boolean, uploaded_by_name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ev uuid;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_event_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ev;
  return query
    select a.id, a.session_id, coalesce(se.title_de, se.title_en), st.name, sl.start_at,
           a.kind, a.storage_path, a.filename, a.cutout, a.credit, a.version, a.is_current,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = a.uploaded_by),
           a.created_at
      from session_asset a
      join session se on se.id = a.session_id
      join event e on e.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
     where e.edition_id = v_ev or e.id = v_ev
     order by sl.start_at nulls last, a.kind, a.version desc;
end $$;
