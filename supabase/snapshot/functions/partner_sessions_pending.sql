create or replace function partner_sessions_pending(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(session_id uuid, org_id uuid, org_name text, format text, title_de text, starts_at timestamp with time zone, stage_name text, format_details jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  -- `is_programme_editor(null)` war immer false: die Funktion sucht
  -- `where ev.id = p_event_id`, und mit NULL trifft das nie. Also mit der
  -- Edition prüfen, die ohnehin übergeben wird. Ohne Edition bleibt es beim
  -- Partner-Team — für eine Liste über alles gibt es keinen Scope zu prüfen.
  if not coalesce(is_partner_team()
                  or (p_edition_id is not null and is_programme_editor(p_edition_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select se.id, se.partner_org_id, coalesce(o.communication_name, o.legal_name), se.format, se.title_de,
           sl.start_at, st.name, se.format_details, se.created_at
      from session se
      join organization o on o.id = se.partner_org_id
      join event ev on ev.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
     -- Der Formatfilter ist gefallen (Auflage 4): seit einer Textänderung eine
     -- veröffentlichte Session zurück auf `review` schickt, kann auch ein Talk oder eine
     -- Masterclass hier landen. Mit dem alten Filter wäre sie aus dem Programm verschwunden,
     -- ohne dass sie jemand in der Warteschlange gesehen hätte.
     where se.publish_status = 'review'
       and (p_edition_id is null or ev.id = p_edition_id or ev.edition_id = p_edition_id)
     order by se.created_at;
end $$;
