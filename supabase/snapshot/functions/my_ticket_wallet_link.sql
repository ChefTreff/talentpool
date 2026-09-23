create or replace function my_ticket_wallet_link(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_t ticket%rowtype; v_secret text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into v_t from ticket where id = p_ticket_id;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;

  -- Streng die eigene Person. `coalesce` ist Absicht: `v_t.person_id` darf
  -- NULL sein (ein Ticket ohne Zuordnung), und `NULL = v_me` wäre NULL statt
  -- false — ein `if not NULL` löste nicht aus (Lehre aus 0118).
  if not coalesce(v_t.person_id = v_me, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_t.vivenu_ticket_id is null then
    raise exception 'ticket_not_issued' using errcode = 'P0002', detail = 'vivenu_ticket_id';
  end if;

  select s.secret into v_secret from ticket_secret s where s.ticket_id = v_t.id;
  if v_secret is null then
    -- Freitickets aus unserem Bestand haben keins; dann gibt es auch keine
    -- vivenu-Seite, auf die wir zeigen könnten.
    raise exception 'ticket_not_issued' using errcode = 'P0002', detail = 'secret';
  end if;

  perform log_audit('ticket.wallet_link', 'ticket', v_t.id::text, null, null);
  return jsonb_build_object('vivenu_ticket_id', v_t.vivenu_ticket_id, 'secret', v_secret);
end $$;
