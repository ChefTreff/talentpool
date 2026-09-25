create or replace function update_speaker_activity(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a speaker_activity%rowtype; v_body text; v_due date; v_assignee uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from speaker_activity where id = p_id for update;
  if not found then raise exception 'activity_not_found' using errcode = 'P0002'; end if;
  if not (coalesce(can_manage_speaker(v_a.profile_id), false) and speaker_activity_edit_right(p_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_body := case when p_data ? 'body' then nullif(btrim(p_data->>'body'), '') else v_a.body end;
  if v_body is null then raise exception 'body_required' using errcode = '22023'; end if;
  if length(v_body) > 2000 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if v_a.kind = 'task' then
    v_due := case when p_data ? 'due_on' then nullif(p_data->>'due_on', '')::date else v_a.due_on end;
    if v_due is null then raise exception 'due_required' using errcode = '22023'; end if;
    v_assignee := case when p_data ? 'assignee_person_id'
                       then coalesce(nullif(p_data->>'assignee_person_id', '')::uuid, current_person_id())
                       else v_a.assignee_person_id end;
    if v_assignee is distinct from v_a.assignee_person_id
       and not speaker_activity_assignee_ok(v_assignee, v_a.profile_id) then
      raise exception 'invalid_assignee' using errcode = '22023';
    end if;
  end if;
  update speaker_activity set
    body = v_body,
    occurred_at = case when p_data ? 'occurred_at'
                       then coalesce(nullif(p_data->>'occurred_at', '')::timestamptz, occurred_at)
                       else occurred_at end,
    due_on = v_due,
    assignee_person_id = v_assignee
  where id = p_id;
  perform log_audit('speaker.activity_update', 'speaker_profile', v_a.profile_id::text, null,
                    jsonb_build_object('activity_id', p_id));
  return p_id;
end $$;
