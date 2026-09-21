create or replace function set_speaker_pipeline(p_profile_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old text; v_reason text;
begin
  if not can_manage_speaker(p_profile_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not is_vocab_key('speaker_pipeline', p_status) then
    raise exception 'invalid_pipeline_status' using errcode = '22023', detail = p_status;
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and not is_vocab_key('speaker_decline_reason', v_reason) then
    raise exception 'invalid_decline_reason' using errcode = '22023', detail = v_reason;
  end if;

  select pipeline_status into v_old from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  update speaker_profile set
    pipeline_status = p_status,
    confirmed_at = case when speaker_is_confirmed(p_status) then coalesce(confirmed_at, now()) else confirmed_at end,
    declined_at = case when p_status = 'declined' then now()
                       -- Zurück aus der Absage: das Datum verliert seine Bedeutung.
                       when v_old = 'declined' then null
                       else declined_at end,
    decline_reason = case when p_status = 'declined' then coalesce(v_reason, decline_reason)
                          when v_old = 'declined' then null
                          else decline_reason end
  where id = p_profile_id;

  perform log_audit('speaker.pipeline', 'speaker_profile', p_profile_id::text,
                    jsonb_build_object('status', v_old),
                    jsonb_build_object('status', p_status, 'reason', v_reason));
end $$;
