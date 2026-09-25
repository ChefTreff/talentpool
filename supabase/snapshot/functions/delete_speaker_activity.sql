create or replace function delete_speaker_activity(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a speaker_activity%rowtype;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from speaker_activity where id = p_id for update;
  if not found then raise exception 'activity_not_found' using errcode = 'P0002'; end if;
  if not (coalesce(can_manage_speaker(v_a.profile_id), false) and speaker_activity_edit_right(p_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from speaker_activity where id = p_id;
  perform log_audit('speaker.activity_delete', 'speaker_profile', v_a.profile_id::text,
                    jsonb_build_object('activity_id', p_id, 'kind', v_a.kind), null);
end $$;
