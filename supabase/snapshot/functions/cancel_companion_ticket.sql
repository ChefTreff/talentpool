create or replace function cancel_companion_ticket(p_ticket_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_team boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_t from ticket where id = p_ticket_id and source = 'speaker_companion' for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  v_team := is_speaker_team(v_sp.edition_id);
  if not coalesce((v_team or v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.status = 'cancelled' then return; end if;
  if v_t.status = 'valid' and not v_team then raise exception 'already_issued' using errcode = 'P0001'; end if;  -- ausgestellt: nur Team (Storno in vivenu)
  if v_t.status not in ('requested', 'approved', 'valid') then raise exception 'not_cancellable' using errcode = 'P0001', detail = v_t.status; end if;
  update ticket set status = 'cancelled' where id = p_ticket_id;
  perform log_audit('ticket.companion_cancelled', 'ticket', p_ticket_id::text, jsonb_build_object('status', v_t.status),
                    jsonb_build_object('status', 'cancelled', 'by_team', v_team));
end $$;
