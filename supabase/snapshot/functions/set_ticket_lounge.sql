create or replace function set_ticket_lounge(p_ticket_id uuid, p_lounge boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not coalesce(is_speaker_team(null), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_lounge is null then raise exception 'invalid_argument' using errcode = '22023'; end if;
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  -- Eine Quelle je Ticketart: am eigenen Ticket gilt das Profil-Flag (`speaker_profile_tickets_sync`), hier nur die Begleitung.
  if v_t.source <> 'speaker_companion' then raise exception 'not_a_companion' using errcode = 'P0001', detail = v_t.source; end if;
  if v_t.status = 'cancelled' then raise exception 'ticket_cancelled' using errcode = 'P0001'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  if v_t.lounge_access = p_lounge then return; end if;
  update ticket set lounge_access = p_lounge where id = p_ticket_id;
  perform log_audit('ticket.lounge_set', 'ticket', p_ticket_id::text,
                    jsonb_build_object('person_id', v_sp.person_id, 'lounge', v_t.lounge_access),
                    jsonb_build_object('person_id', v_sp.person_id, 'lounge', p_lounge));
end $$;
