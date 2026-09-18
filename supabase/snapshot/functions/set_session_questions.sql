create or replace function set_session_questions(p_session_id uuid, p_questions jsonb, p_replace_custom boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_event  uuid;
  v_editor boolean;
  v_n      integer;
begin
  if not can_edit_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select event_id into v_event from session where id = p_session_id;
  v_editor := is_programme_editor(v_event);
  delete from session_question
   where session_id = p_session_id and (p_replace_custom or question_id is not null);
  insert into session_question (session_id, question_id, label_de, label_en, type, options, required, sort_order, approved_by, approved_at)
  select p_session_id,
         nullif(x->>'question_id', '')::uuid,
         x->>'label_de', x->>'label_en',
         x->>'type', x->'options',
         coalesce((x->>'required')::boolean, false),
         coalesce((x->>'sort_order')::integer, ord::integer),
         case when (x->>'question_id') is not null and x->>'question_id' <> '' or v_editor then current_person_id() end,
         case when (x->>'question_id') is not null and x->>'question_id' <> '' or v_editor then now() end
  from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) with ordinality as t(x, ord);
  get diagnostics v_n = row_count;
  perform log_audit('session.questions', 'session', p_session_id::text, null, p_questions);
  return v_n;
end $$;
