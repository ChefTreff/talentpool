create or replace function set_team_challenge(p_team_id uuid, p_challenge_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update hack_team set challenge_id = p_challenge_id, updated_at = now() where id = p_team_id;
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  perform log_audit('hack.challenge_set', 'hack_team', p_team_id::text, null,
                    jsonb_build_object('challenge_id', p_challenge_id));
end $$;
