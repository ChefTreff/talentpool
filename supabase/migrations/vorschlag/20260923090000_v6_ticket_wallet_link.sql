-- ???? · Welle 6 · Weg zur Wallet über die vivenu-Ticketseite (SPK-037)
--
-- **Nummer offen.** Vorschlag der Build-Session Speaker-Domäne; Anwenden,
-- Umbenennen und der Eintrag ins Entscheidungslog gehören der
-- Architektur-/Security-Session.
--
-- Anlass: Konrad am 23.09.: „Ich habe gerade in Vivenu gesehen, dass es dort
-- nativ die Funktion ‚Zur Apple Wallet' oder Google Wallet hinzufügen gibt.
-- Kann man das per API abrufen …? Das wäre bei den Speakern super wichtig!"
--
-- **Abrufen geht nicht** (geprüft am 23.09. gegen alle 447 Pfade der
-- vivenu-OpenAPI): die API kennt Wallet nur als *Vorlage* am
-- Dokumententemplate — Farben, Logo, Art des Codes —, nicht als abrufbare
-- Datei. Kein Endpunkt gibt einen `.pkpass` oder ein Google-Wallet-Objekt
-- heraus, und `TicketResource` hat kein Pass-Feld.
--
-- **Also der kurze Weg:** die Speakerin auf ihre eigene vivenu-Ticketseite
-- führen, wo die nativen Knöpfe längst stehen. Kein Entwicklerzertifikat,
-- keine Signierschlüssel, und wenn vivenu das Ticket ändert, stimmt der Pass
-- von selbst.
--
-- Diese Funktion gibt die beiden Teile heraus, aus denen die Adresse besteht.
-- **Das Secret bleibt serverseitig:** die Route baut daraus eine Weiterleitung,
-- der Browser bekommt es nie als Datum. Dass es am Ende in der Adresszeile der
-- Speakerin steht, ist unvermeidlich — dieser Link *ist* der Zugang zum
-- Ticket, genau wie in vivenus eigener Ticket-Mail.
--
-- **Nur die Inhaberin, nicht die Assistenz.** `my_speaker_tickets` zeigt den
-- Barcode schon heute nur der Person selbst (`v_self`); ein Wallet-Pass ist
-- dasselbe in grün, und eine Assistenz braucht ihn nicht.

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

revoke all on function my_ticket_wallet_link(uuid) from public, anon;
grant execute on function my_ticket_wallet_link(uuid) to authenticated;

select harden_definer_functions();
