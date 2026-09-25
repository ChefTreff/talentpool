create or replace function set_speaker_activity_done(p_id uuid, p_done boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_a speaker_activity%rowtype; v_owner uuid; v_ed uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from speaker_activity where id = p_id for update;
  if not found then raise exception 'activity_not_found' using errcode = 'P0002'; end if;
  select sp.owner_person_id, sp.edition_id into v_owner, v_ed from speaker_profile sp where sp.id = v_a.profile_id;
  if not (coalesce(can_manage_speaker(v_a.profile_id), false)
          and coalesce(v_a.author_person_id = v_me or v_a.assignee_person_id = v_me or v_owner = v_me
                       or is_speaker_team(v_ed), false)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_a.kind <> 'task' then raise exception 'not_a_task' using errcode = '22023'; end if;
  update speaker_activity
     set done_at = case when coalesce(p_done, false) then coalesce(done_at, now()) end,
         done_by = case when coalesce(p_done, false) then coalesce(done_by, v_me) end
   where id = p_id;
  perform log_audit('speaker.activity_done', 'speaker_profile', v_a.profile_id::text, null,
                    jsonb_build_object('activity_id', p_id, 'done', coalesce(p_done, false)));
  return p_id;
end $$;
