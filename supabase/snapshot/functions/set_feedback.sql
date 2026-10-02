create or replace function set_feedback(p_id uuid, p_status text, p_tags text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_tags text[] := coalesce((select array_agg(distinct left(btrim(x), 40)) from unnest(p_tags) x where btrim(x) <> ''), '{}');
begin
  if not coalesce(has_admin_section('feedback'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('open', 'seen', 'done') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if cardinality(v_tags) > 10 then raise exception 'too_long' using errcode = '22023', detail = 'tags'; end if;
  update feedback_entry set status = p_status, tags = v_tags, handled_by = current_person_id() where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform log_audit('feedback.updated', 'feedback_entry', p_id::text, null, jsonb_build_object('status', p_status, 'tags', v_tags));
end $$;
