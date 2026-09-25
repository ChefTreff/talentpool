create or replace function add_speaker_activity(p_profile_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id();
  v_kind text := nullif(btrim(p_data->>'kind'), '');
  v_body text := nullif(btrim(p_data->>'body'), '');
  v_due date;
  v_assignee uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from speaker_profile where id = p_profile_id) then
    raise exception 'speaker_not_found' using errcode = 'P0002';
  end if;
  if not coalesce(can_manage_speaker(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_kind is null or not is_vocab_key('speaker_activity_kind', v_kind) then
    raise exception 'invalid_activity_kind' using errcode = '22023', detail = coalesce(v_kind, 'null');
  end if;
  if v_body is null then raise exception 'body_required' using errcode = '22023'; end if;
  if length(v_body) > 2000 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if v_kind = 'task' then
    v_due := nullif(p_data->>'due_on', '')::date;
    if v_due is null then raise exception 'due_required' using errcode = '22023'; end if;
    v_assignee := coalesce(nullif(p_data->>'assignee_person_id', '')::uuid, v_me);
    if not speaker_activity_assignee_ok(v_assignee, p_profile_id) then
      raise exception 'invalid_assignee' using errcode = '22023';
    end if;
  end if;
  insert into speaker_activity (profile_id, kind, body, occurred_at, due_on, assignee_person_id, author_person_id)
  values (p_profile_id, v_kind, v_body,
          coalesce(nullif(p_data->>'occurred_at', '')::timestamptz, now()),
          v_due, v_assignee, v_me)
  returning id into v_id;
  -- Das Audit nennt Eintrag und Art, nicht den Text — der steht in der Tabelle.
  perform log_audit('speaker.activity_add', 'speaker_profile', p_profile_id::text, null,
                    jsonb_build_object('activity_id', v_id, 'kind', v_kind));
  return v_id;
end $$;
