create or replace function set_session_speakers(p_session_id uuid, p_speakers jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_n   integer;
  v_old jsonb;
begin
  if not can_edit_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(person_id::text, confirmed), '{}'::jsonb)
    into v_old
    from session_speaker where session_id = p_session_id;
  delete from session_speaker where session_id = p_session_id;
  insert into session_speaker (session_id, person_id, role, sort_order, confirmed)
  select p_session_id,
         (x->>'person_id')::uuid,
         coalesce(x->>'role', 'speaker'),
         coalesce((x->>'sort_order')::integer, ord::integer),
         coalesce((x->>'confirmed')::boolean, (v_old->>(x->>'person_id'))::boolean, false)
  from jsonb_array_elements(coalesce(p_speakers, '[]'::jsonb)) with ordinality as t(x, ord);
  get diagnostics v_n = row_count;
  perform log_audit('session.speakers', 'session', p_session_id::text, null, p_speakers);
  return v_n;
end $$;
