create or replace function team_add_companion_ticket(p_profile_id uuid, p_email text, p_first_name text, p_last_name text, p_lounge boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_email citext; v_first text; v_last text; v_id uuid; v_used integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  -- Gäste einer Standbühne haben keine Tickets aus dem Speaker-Portal (PART-081, `speaker_ticket_create` verweigert sie ebenso).
  if v_sp.stage_guest then raise exception 'not_eligible' using errcode = 'P0001', detail = 'stage_guest'; end if;
  if not speaker_is_confirmed(v_sp.pipeline_status) then raise exception 'not_eligible' using errcode = 'P0001', detail = v_sp.pipeline_status; end if;
  v_email := lower(btrim(coalesce(p_email, '')))::citext;
  if v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email::text) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  v_first := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  := nullif(btrim(coalesce(p_last_name, '')), '');
  if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_first) > 100 or char_length(v_last) > 100 then raise exception 'too_long' using errcode = '22023', detail = 'name'; end if;
  if exists (select 1 from person_email pe where pe.person_id = v_sp.person_id and pe.email = v_email) then
    raise exception 'companion_is_speaker' using errcode = '22023';
  end if;
  if exists (select 1 from ticket t where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion'
                and t.status <> 'cancelled' and lower(t.holder_email::text) = v_email::text) then
    raise exception 'companion_exists' using errcode = 'P0001';
  end if;
  select count(*)::integer into v_used from ticket t
   where t.speaker_profile_id = p_profile_id and t.source = 'speaker_companion' and t.status <> 'cancelled';
  if v_used >= v_sp.companion_quota then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = v_sp.companion_quota::text;
  end if;
  -- Direkt `approved`: das Team hat entschieden, es gibt nichts mehr zu bestätigen. Ausgestellt wird danach wie jedes Begleitticket.
  insert into ticket (event_id, speaker_profile_id, pass_type, lounge_access, holder_email, holder_first_name, holder_last_name,
                      status, personalization_status, price_cents, source, requested_by, approved_by, approved_at)
  values (v_sp.edition_id, p_profile_id, v_sp.pass_type, coalesce(p_lounge, false), v_email, v_first, v_last,
          'approved', 'partial', 0, 'speaker_companion', v_me, v_me, now())
  returning id into v_id;
  -- An den Empfänger der Speaker-Mails (bei einem verwalteten Speaker eine dritte Person): **ohne** die Adresse der Begleitung.
  perform queue_speaker_mail('companion_ticket_confirmed', v_sp.id,
                             jsonb_build_object('companion_name', v_first || ' ' || v_last, 'note', ''), 'ticket', v_id);
  -- Audit nur mit der Person des Speakers, nie mit Namen oder Adresse der Begleitung.
  perform log_audit('ticket.companion_added_by_team', 'ticket', v_id::text, null,
                    jsonb_build_object('person_id', v_sp.person_id, 'profile_id', p_profile_id, 'lounge', coalesce(p_lounge, false),
                                       'quota', v_sp.companion_quota, 'used_before', v_used));
  return v_id;
end $$;
