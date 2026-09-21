create or replace function request_companion_ticket(p_profile_id uuid, p_email text, p_first_name text, p_last_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext; v_first text; v_last text; v_id uuid; v_speaker text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  if exists (select 1 from person_email pe where pe.person_id = v_sp.person_id and pe.email = v_email) then
    raise exception 'companion_is_speaker' using errcode = '22023';
  end if;
  -- zweites aktives Begleitticket ⇒ 23505 (ticket_speaker_companion_uidx)
  insert into ticket (event_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      status, personalization_status, price_cents, source, requested_by)
  values (v_sp.edition_id, p_profile_id, v_sp.pass_type, false, v_email, v_first, v_last, 'requested', 'partial', 0, 'speaker_companion', v_me)
  returning id into v_id;
  select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_speaker from person p where p.id = v_sp.person_id;
  perform notify_speaker_leads('companion_ticket_requested',
                               jsonb_build_object('speaker_name', v_speaker, 'companion_name', v_first || ' ' || v_last), 'ticket', v_id);
  perform log_audit('ticket.companion_requested', 'ticket', v_id::text, null,
                    jsonb_build_object('profile_id', p_profile_id, 'by_assistant', v_sp.person_id <> v_me));
  return v_id;
end $$;
