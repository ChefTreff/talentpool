-- 0288 · Warteliste und Absage verzögert wie die Zusage (PART-146)
-- Angewendet von der Architektur-Session am 09.10.2026 als 20261009071622.
--
-- Anlass: PART-124 (0280) verzögert die Zusage-Mail um zehn Minuten; eine Rücknahme in der Zeit stoppt sie. Bleibt es dabei, geht bei **Absage und erneuter Zusage**
-- innerhalb der Frist die Absage-Mail trotzdem raus (Frage Partner-Chat an Plan im PR #396, Entscheidung Plan 08.10.: ja, alle drei gleich — PART-146).
--
-- Was die Migration tut — `application_mail_trigger()` (Basis: Snapshot nach 0280), zwei Änderungen, alles andere bleibt:
--   1  Warteliste (`application_waitlisted`) und Absage (`application_declined`) gehen wie die Zusage über `queue_mail_debounced(…, interval '10 minutes')`:
--      `send_after = jetzt + 10 Minuten`, der Mail-Cron (alle zehn Minuten) schickt frühestens dann — reale Verzögerung 10 bis 20 Minuten.
--   2  Verlässt eine Bewerbung einen dieser drei Stände, solange die Mail wartet, wird sie storniert (`cancel_queued_mail`, Status `cancelled`):
--        · Zusage    — `accept_revoked` (zurückgenommen), `accept_confirmed` (die Person hat schon bestätigt) — unverändert gegenüber 0280;
--        · Warteliste, Absage — neu `decision_changed` (die Entscheidung wurde geändert); auch wenn eine Warteliste-Bewerbung nachrückt (`promoted`): die
--          Nachrück-Mail geht sofort, die wartende Wartelisten-Mail entfällt.
--      Die Mail zur neuen Entscheidung wird eingereiht (mit ihrer Frist); die Person bekommt nur noch diese. Eine schon versendete Mail bleibt.
--
-- Was gleich bleibt: die Eingangsbestätigung (`application_received`) und das Nachrücken (`application_promoted`) ohne Frist; der Freigabe-Trigger
-- (`decision_release_mail_trigger`) — die Freigabe ist eine ausdrückliche Handlung des Teams; vor der Freigabe einer Session geht nichts raus. Der Trigger gilt
-- für jedes Format der Tabelle `application` und jeden Weg, der den Status ändert (Partner, Team, Sammelentscheidung, Portal der Person).
--
-- Randlagen (im PR benannt): (i) wie bei 0280 — eine Änderung in der Sekunde, in der der Versandlauf die fällige Zeile geladen hat, erreicht die Mail nicht
-- mehr; (ii) ein Wechsel Absage → Zusage → Absage im Fenster stellt jeweils die letzte Mail ein, die frühere entfällt (je Wechsel eine Stornierung);
-- (iii) die Freigabe schickt weiter beim nächsten Lauf (ohne Frist), eine Änderung danach storniert diese Mail ebenfalls, solange sie wartet.
set search_path = public, extensions;

-- === 1 · Trigger: Bewerbung =====================================================================================================
-- Basis: supabase/snapshot/functions/application_mail_trigger.sql.
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
    -- PART-124/146: wird die Entscheidung geändert (oder bestätigt), bevor ihre Mail rausging, entfällt die wartende Mail — jede der drei:
    -- Zusage (Grund `accept_revoked`, bei Bestätigung durch die Person `accept_confirmed`), Warteliste und Absage (`decision_changed`).
    -- Die Mail zur neuen Entscheidung wird unten eingereiht; die Person bekommt nur noch diese.
    if old.status in ('accepted', 'waitlisted', 'declined') then
      perform cancel_queued_mail(
        case old.status when 'accepted' then 'application_accepted' when 'waitlisted' then 'application_waitlisted' else 'application_declined' end,
        new.id, new.person_id,
        case when old.status = 'accepted' then (case new.status when 'confirmed' then 'accept_confirmed' else 'accept_revoked' end)
             else 'decision_changed' end);
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
  if v_key in ('application_accepted', 'application_waitlisted', 'application_declined') then
    -- PART-124/146: zehn Minuten Frist für jede der drei Entscheidungen, in der sich die Entscheidung ändern lässt (siehe oben); Eingangsbestätigung
    -- und Nachrücken gehen wie bisher ohne Frist.
    perform queue_mail_debounced(v_key, new.person_id, v_vars, 'application', new.id, interval '10 minutes');
  else
    perform queue_mail(v_key, new.person_id, v_vars, 'application', new.id);
  end if;
  return null;
end $$;;

revoke execute on function application_mail_trigger() from public, anon, authenticated;

select harden_definer_functions();
