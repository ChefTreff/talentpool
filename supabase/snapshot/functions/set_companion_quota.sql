create or replace function set_companion_quota(p_profile_id uuid, p_quota integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_used integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_quota is null or p_quota < 0 or p_quota > 50 then raise exception 'invalid_quota' using errcode = '22023'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  select count(*)::integer into v_used from ticket t
   where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion' and t.status <> 'cancelled';
  -- Unter die schon vergebenen geht es nicht: erst stornieren, dann senken (sonst stünde „2 von 1“ im Portal).
  if p_quota < v_used then raise exception 'quota_below_used' using errcode = 'P0001', detail = v_used::text; end if;
  if p_quota = v_sp.companion_quota then return; end if;
  update speaker_profile set companion_quota = p_quota where id = p_profile_id;
  perform log_audit('ticket.companion_quota_set', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('person_id', v_sp.person_id, 'quota', v_sp.companion_quota),
                    jsonb_build_object('person_id', v_sp.person_id, 'quota', p_quota, 'used', v_used));
end $$;
