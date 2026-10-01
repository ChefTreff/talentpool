create or replace function set_hack_challenge_track(p_challenge_id uuid, p_track text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old text;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_track, '')), '') is null or not is_vocab_key('hack_track', btrim(p_track)) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'track';
  end if;
  select track into v_old from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update hack_challenge set track = btrim(p_track), updated_at = now() where id = p_challenge_id;
  perform log_audit('hack.challenge_track', 'hack_challenge', p_challenge_id::text,
                    jsonb_build_object('track', v_old), jsonb_build_object('track', btrim(p_track)));
end $$;
