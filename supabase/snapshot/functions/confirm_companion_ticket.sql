create or replace function confirm_companion_ticket(p_ticket_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if not is_speaker_team(v_sp.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_t.status <> 'requested' then raise exception 'not_pending' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'approved', approved_by = current_person_id(), approved_at = now(), team_note = nullif(btrim(p_note), '')
   where id = p_ticket_id;
  perform queue_mail('companion_ticket_confirmed', v_sp.person_id,
                     jsonb_build_object('companion_name', btrim(coalesce(v_t.holder_first_name, '') || ' ' || coalesce(v_t.holder_last_name, '')),
                                        'companion_email', v_t.holder_email::text, 'note', coalesce(nullif(btrim(p_note), ''), '')),
                     'ticket', p_ticket_id);
  perform log_audit('ticket.companion_approved', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'approved', 'note', p_note));
end $$;
