create or replace function speaker_ticket_for_issue(p_ticket_id uuid)
 RETURNS TABLE(ticket_id uuid, source text, status text, pass_type text, lounge_access boolean, holder_first_name text, holder_last_name text, holder_email text, vivenu_event_id text, vivenu_ticket_type_id text, ticket_type_map_id uuid, vivenu_ticket_id text, speaker_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_t ticket%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_t from ticket where id = p_ticket_id;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_t.speaker_profile_id;
  -- Beide Kontexte: das Team im Admin, der Server ohne Anmeldung (Lehre 0120).
  if auth.uid() is not null and not is_speaker_team(v_sp.edition_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.source not in ('speaker', 'speaker_companion') then
    raise exception 'not_a_free_ticket' using errcode = 'P0001', detail = v_t.source;
  end if;
  return query
    select v_t.id, v_t.source, v_t.status, v_t.pass_type, coalesce(v_t.lounge_access, false),
           coalesce(v_t.holder_first_name, p.first_name),
           coalesce(v_t.holder_last_name, p.last_name),
           coalesce(v_t.holder_email::text, pe.email::text),
           e.vivenu_event_id,
           m.vivenu_ticket_type_id, m.id,
           v_t.vivenu_ticket_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from event e
      left join person p on p.id = v_sp.person_id and p.deleted_at is null
      left join person_email pe on pe.person_id = p.id and pe.is_primary
      -- Der Tickettyp haengt am Pass-Typ des Tickets; ohne Zuordnung bleibt die
      -- Spalte leer und die Action bricht mit einem eigenen Schluessel ab,
      -- statt vivenu einen leeren Typ zu schicken.
      --
      -- **Genau eine** Zuordnung: `ticket_type_map` kann mehrere aktive Zeilen
      -- je Pass-Typ tragen (verschiedene vivenu-Typen). Ein gewoehnlicher Join
      -- gaebe dann mehrere Zeilen zurueck, und die Action naehme willkuerlich
      -- die erste — im Test zweimal derselbe Speaker mit zwei Typen.
      left join lateral (
        select m2.id, m2.vivenu_ticket_type_id
          from ticket_type_map m2
         where m2.event_id = e.id and m2.active
           and m2.pass_type = coalesce(v_t.pass_type, 'speaker')
         order by m2.created_at, m2.id
         limit 1) m on true
     where e.id = v_sp.edition_id;
end $$;
