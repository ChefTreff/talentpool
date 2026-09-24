create or replace function board_session_refs(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not can_search_board(v_se.event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'partner', (select jsonb_build_object('id', o.id, 'name', coalesce(o.communication_name, o.legal_name))
                  from organization o where o.id = v_se.partner_org_id));
end $$;
