create or replace function board_search_partners(p_event_id uuid, p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, name text)
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
    select o.id, coalesce(o.communication_name, o.legal_name)
      from organization o
     where exists (select 1 from org_edition oe where oe.org_id = o.id and oe.edition_id = v_ed)
       and (coalesce(o.communication_name, '') ilike v_q or coalesce(o.legal_name, '') ilike v_q)
     order by coalesce(o.communication_name, o.legal_name)
     limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;
