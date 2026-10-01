create or replace function remove_hack_submission_file(p_file_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_f hack_submission_file;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_f from hack_submission_file where id = p_file_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not can_write_hack_submission(v_f.team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from hack_submission_file where id = p_file_id;
  perform log_audit('hack.submission_file_removed', 'hack_team', v_f.team_id::text,
                    jsonb_build_object('file_id', v_f.id, 'filename', v_f.filename), null);
  return v_f.storage_path;
end $$;
