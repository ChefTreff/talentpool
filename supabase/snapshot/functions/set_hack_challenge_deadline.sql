create or replace function set_hack_challenge_deadline(p_challenge_id uuid, p_deadline timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old timestamptz;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select submission_deadline into v_old from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update hack_challenge set submission_deadline = p_deadline, updated_at = now() where id = p_challenge_id;
  perform log_audit('hack.challenge_deadline', 'hack_challenge', p_challenge_id::text,
                    jsonb_build_object('deadline', v_old), jsonb_build_object('deadline', p_deadline));
end $$;
