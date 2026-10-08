-- 0279 · Zusage-Mail mit Frist und Stornierung bei Rücknahme (PART-124)
--
-- Anlass: PART-124 (Konrad & Leopold 05.10., Durchgang Partner-Portal): „Achtung: Mit Zusage bekommt die Person eine Zusage-Mail.“ Konrads
-- Frage dazu: „mit einigen Minuten Verzögerung?“ Plan-Entscheidung 08.10. (entscheidungen.md): ja — die Mail geht über die Warteschlange mit
-- zehn Minuten Frist, eine Rücknahme der Zusage in der Zeit stoppt sie; der Hinweis im Portal nennt die Frist. Dieselbe Mechanik wie die
-- Änderungsmail LEAD-063 (0276 `v6_mail_verzoegert`): `queue_mail_debounced` und `cancel_queued_mail`.
--
-- Was die Migration tut — `application_mail_trigger()` (Basis: Snapshot nach 0277), zwei Änderungen, alles andere bleibt:
--   1  Die Zusage-Mail (`application_accepted`) wird mit `queue_mail_debounced(…, interval '10 minutes')` eingereiht statt mit `queue_mail`:
--      die Zeile steht im Status `queued` mit `send_after = now() + 10 Minuten`, der Versandlauf (`lib/mail/queue.ts`, Cron alle zehn Minuten)
--      lädt sie frühestens dann — die reale Verzögerung ist 10 bis 20 Minuten, der Hinweis im Portal sagt „erst nach etwa zehn Minuten“.
--   2  Verlässt eine Bewerbung den Stand `accepted`, solange die Zusage-Mail noch wartet, wird die Zeile storniert (`cancel_queued_mail`,
--      Status `cancelled`, Grund in `meta.cancel_reason`):
--        · `accept_revoked`   — die Zusage wurde zurückgenommen (Warteliste, Absage, Engere Wahl, zurückgezogen): Die Person bekommt keine
--                               Zusage-Mail; die Mail zur neuen Entscheidung geht wie bisher ohne Frist raus (Absage und Warteliste sind nicht
--                               Teil von PART-124).
--        · `accept_confirmed` — die Person hat die Zusage schon im Portal bestätigt, bevor die Mail rausging; „bitte bestätigen“ wäre danach
--                               falsch. (Ergänzung zur Entscheidung: ohne Frist gab es diesen Fall nicht.)
--      Eine schon versendete Mail lässt sich nicht zurückholen (`cancel_queued_mail` berührt nur `queued`).
--
-- Was gleich bleibt: die Eingangsbestätigung (`application_received`), Warteliste, Absage und Nachrücken (ohne Frist); der Freigabe-Trigger
-- (`decision_release_mail_trigger`) — die Freigabe ist eine ausdrückliche Handlung des Teams („Das lässt sich nicht zurücknehmen“), dort geht
-- die Mail wie bisher beim nächsten Lauf raus; eine Entscheidung vor der Freigabe schickt weiter nichts. Der Trigger gilt für alle Formate
-- der Tabelle `application` und für jeden Weg, der den Status ändert (Partner, Team, Sammelentscheidung, Portal der Person); die Hackathon-
-- Bewerbung (`hack_application`) hat einen eigenen Weg und ist nicht betroffen.
--
-- Randlagen (im PR benannt): (i) eine Rücknahme in der Sekunde, in der der Versandlauf die schon fällige Zeile geladen hat, erreicht die Mail
-- nicht mehr (dieselbe Randlage wie bei 0276 (i)); (ii) wird innerhalb der Frist erst abgesagt und dann wieder zugesagt, geht die Absage-Mail
-- trotzdem raus (sie hat keine Frist) und die neue Zusage-Mail folgt nach zehn Minuten; (iii) bei Zusage → Zusage (Doppelklick) passiert
-- nichts (der Trigger endet bei unverändertem Status).
set search_path = public, extensions;

-- === 1 · Trigger: Bewerbung =====================================================================================================
-- Basis: supabase/snapshot/functions/application_mail_trigger.sql. Geändert: die Verzweigung für `accepted` am Ende und der Block
-- „Zusage verlassen“ am Anfang (der Zugriff auf `old` nur im UPDATE-Zweig: bei INSERT ist `old` nicht belegt).
create or replace function application_mail_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_key text; v_locale text; v_tz text; v_vars jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.status = old.status then return null; end if;
    -- PART-124: die Zusage wurde zurückgenommen oder bestätigt, bevor ihre Mail rausging → die wartende Mail entfällt.
    if old.status = 'accepted' then
      perform cancel_queued_mail('application_accepted', new.id, new.person_id,
                                 case new.status when 'confirmed' then 'accept_confirmed' else 'accept_revoked' end);
    end if;
  end if;
  if new.status = 'applied' then
    v_key := 'application_received';
  elsif decisions_released(new.session_id) then
    v_key := case new.status
      when 'accepted'   then 'application_accepted'
      when 'promoted'   then 'application_promoted'
      when 'waitlisted' then 'application_waitlisted'
      when 'declined'   then 'application_declined'
      else null end;
  end if;
  if v_key is null then return null; end if;
  select case when p.preferred_language = 'en' then 'en' else 'de' end into v_locale from person p where p.id = new.person_id;
  select e.timezone into v_tz from session s join event e on e.id = s.event_id where s.id = new.session_id;
  v_vars := session_mail_vars(new.session_id, coalesce(v_locale, 'de'))
            || jsonb_build_object('confirm_by', mail_fmt_ts(new.confirm_by, v_tz, coalesce(v_locale, 'de')), 'application_id', new.id);
  if v_key = 'application_accepted' then
    -- PART-124: zehn Minuten Frist, in der sich die Zusage zurücknehmen lässt (siehe oben); alle anderen Mails gehen wie bisher.
    perform queue_mail_debounced(v_key, new.person_id, v_vars, 'application', new.id, interval '10 minutes');
  else
    perform queue_mail(v_key, new.person_id, v_vars, 'application', new.id);
  end if;
  return null;
end $$;

-- === 2 · Rechte ================================================================================================================
-- Trigger-Funktion, intern: wie seit v4_trigger_function_grants — kein EXECUTE für Aufrufer (create or replace erhält die Rechte,
-- die Zeile hält sie auch hier fest).
revoke execute on function application_mail_trigger() from public, anon, authenticated;

select harden_definer_functions();
