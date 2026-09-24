create or replace function board_search_people(p_event_id uuid, p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, display_name text, organization text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_q text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_search_board(p_event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = p_event_id;
  v_q := board_like_pattern(p_query);
  return query
    select p.id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           sp.organization_name
      from speaker_profile sp
      join person p on p.id = sp.person_id
     where sp.edition_id = v_ed
       and p.deleted_at is null
       and (p.first_name ilike v_q or p.last_name ilike v_q
            or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_q
            or coalesce(sp.organization_name, '') ilike v_q)
     order by p.last_name nulls last, p.first_name nulls last
     limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;
