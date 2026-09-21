create or replace function sessions_for_assets(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(session_id uuid, title text, stage_name text, start_at timestamp with time zone, speakers text, photos integer, graphics integer)
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
    select se.id, coalesce(se.title_de, se.title_en), st.name, sl.start_at,
           (select string_agg(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), ', ')
              from session_speaker ss join person p on p.id = ss.person_id
             where ss.session_id = se.id),
           (select count(*)::integer from session_asset a
             where a.session_id = se.id and a.kind = 'stage_photo'),
           (select count(*)::integer from session_asset a
             where a.session_id = se.id and a.kind = 'slot_graphic' and a.is_current)
      from session se
      join event e on e.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
     where e.edition_id = v_ev or e.id = v_ev
     order by sl.start_at nulls last, se.title_de;
end $$;
