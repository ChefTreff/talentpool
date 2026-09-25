-- 0181 · session_mail_vars nur intern (Security-Check Teil 2, F11)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925071823.
--
-- Befund (Architektur-Session, 25.09.2026): `session_mail_vars(p_session_id, p_locale)` war für
-- `authenticated` ausführbar und liefert Titel, Zeit, Bühne und Veranstaltung **jeder** Session —
-- auch unveröffentlichter Entwürfe — allein über die Session-Kennung. Gebraucht wird die Funktion
-- nur von den Mail-Triggern und dem Erinnerungslauf (`application_mail_trigger`,
-- `registration_mail_trigger`, `decision_release_mail_trigger`, `send_presentation_reminders`),
-- alle SECURITY DEFINER; kein Anwendungscode ruft sie mit einer Nutzersitzung auf.
-- Deshalb: EXECUTE für public, anon und authenticated entziehen. Keine Funktionsänderung.
-- Test: supabase/tests/v6_mail_vars_intern.sql
set search_path = public, extensions;

revoke execute on function session_mail_vars(uuid, text) from public, anon, authenticated;

select harden_definer_functions();
