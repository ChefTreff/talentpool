-- 0218 · Rückgabegrund im Board-Drawer für die Programmleitung (LEAD-038)
-- Angewendet von der Architektur-Session am 26.09.2026 als 20260926091024.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Gibt die Programmleitung eine Partner-Session zurück (0172), steht der Grund
-- in `partner_session_return` — der Partner sieht ihn im Board und auf seinen
-- Seiten, das Team selbst nicht mehr. Konrad 25.09.: „entscheide du“,
-- Architektur-Session: anzeigen, klein. Die Tabelle bleibt für Clients zu
-- (revoke all, 0172); gelesen wird nur über diese Funktion, nur von der
-- Programmleitung der Veranstaltung. Stage Leads und Partner bekommen 42501 —
-- `loadSession` fängt das ab, der Partner hat seinen eigenen Weg
-- (`partner_format_sessions`).

set search_path = public, extensions;

create or replace function board_session_return(p_session_id uuid)
 RETURNS TABLE(note text, returned_at timestamp with time zone, returned_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid;
begin
  select se.event_id into v_event from session se where se.id = p_session_id;
  if v_event is null then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not coalesce(is_programme_editor(v_event), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select r.note, r.returned_at,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = r.returned_by)
      from partner_session_return r
     where r.session_id = p_session_id;
end $$;
grant execute on function board_session_return(uuid) to authenticated;

select harden_definer_functions();
