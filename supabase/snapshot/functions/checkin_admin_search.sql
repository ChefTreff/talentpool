create or replace function checkin_admin_search(p_query text, p_edition_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS TABLE(ticket_id uuid, holder text, email text, pass_type text, status text, barcode text, scans integer, letzter_scan timestamp with time zone, letztes_ergebnis text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not has_admin_section('checkin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_q is null or length(v_q) < 3 then
    -- Unter drei Zeichen kaeme die halbe Edition zurueck. Eine leere Antwort waere
    -- irrefuehrend, deshalb ein eigener Schluessel.
    raise exception 'query_too_short' using errcode = '22023', detail = '3';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select t.id,
           nullif(btrim(coalesce(t.holder_first_name, '') || ' ' || coalesce(t.holder_last_name, '')), ''),
           t.holder_email::text, t.pass_type, t.status, t.barcode,
           (select count(*)::integer from checkin c where c.ticket_id = t.id),
           (select max(c.scanned_at) from checkin c where c.ticket_id = t.id),
           (select c.result from checkin c where c.ticket_id = t.id order by c.scanned_at desc limit 1)
      from ticket t
      join event e on e.id = t.event_id
     where coalesce(e.edition_id, e.id) = v_ed
       and (
            -- Name und Adresse als Teiltreffer: so sucht man an der Tuer.
            coalesce(t.holder_first_name, '') || ' ' || coalesce(t.holder_last_name, '') ilike '%' || v_q || '%'
         or t.holder_email::text ilike '%' || v_q || '%'
            -- **Der Barcode nur genau.** Eine Teilsuche darauf waere ein Weg,
            -- gueltige Codes zu erraten.
         or t.barcode = v_q
         or t.vivenu_ticket_id = v_q
       )
     order by t.holder_last_name nulls last, t.holder_first_name nulls last
     limit greatest(1, least(coalesce(p_limit, 25), 100));
end $$;
