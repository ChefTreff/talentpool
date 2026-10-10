create or replace function personalize_ticket(p_ticket_id uuid, p_first_name text, p_last_name text, p_company text, p_position text, p_for_me boolean DEFAULT true, p_holder_email text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_pid   uuid   := current_person_id();
  v_email citext := auth.email();
  v_t     ticket%rowtype;
  v_complete boolean;
  v_edition  uuid;
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  if not (v_t.person_id = v_pid or v_t.buyer_email = v_email or v_t.holder_email = v_email) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.status <> 'valid' then
    raise exception 'ticket_not_valid' using errcode = 'P0001', detail = v_t.status;
  end if;
  if not p_for_me and (p_holder_email is null or position('@' in p_holder_email) = 0) then
    raise exception 'holder_email_required' using errcode = '22023';
  end if;
  -- TAL-020: höchstens ein gültiges Ticket je Person und Edition. Zählen nur gespeicherte Tickets (Zustand ≠ pending):
  -- der Ingest hängt ein frisches Ticket schon an die Person mit der Käufer-Adresse.
  if p_for_me then
    select coalesce(te.edition_id, te.id) into v_edition from event te where te.id = v_t.event_id;
    if exists (
      select 1 from ticket o join event oe on oe.id = o.event_id
       where o.person_id = v_pid and o.id <> p_ticket_id
         and o.status in ('valid', 'checked_in') and o.personalization_status <> 'pending'
         and coalesce(oe.edition_id, oe.id) = v_edition
    ) then
      raise exception 'person_has_ticket' using errcode = 'P0001';
    end if;
  end if;
  v_complete := coalesce(p_first_name, '') <> '' and coalesce(p_last_name, '') <> ''
                and coalesce(p_company, '') <> '' and coalesce(p_position, '') <> '';
  update ticket
     set holder_first_name = p_first_name, holder_last_name = p_last_name,
         holder_company = p_company, holder_position = p_position,
         person_id    = case when p_for_me then v_pid else null end,
         holder_email = case when p_for_me then v_email else lower(trim(p_holder_email))::citext end,
         personalization_status = case when v_complete then 'complete' else 'partial' end,
         personalized_at = now()
   where id = p_ticket_id;
  perform log_audit('ticket.personalize', 'ticket', p_ticket_id::text, null,
                    jsonb_build_object('for_me', p_for_me, 'complete', v_complete));
end $$;
