-- 0150 · consent_current mit security_invoker (Sicherheitsbefund Security-Check, 24.09.2026)
--
-- Befund (Architektur-Session, 24.09.2026): Die Sicht `consent_current` war die einzige Sicht ohne
-- `security_invoker`. Sie lief damit mit den Rechten ihres Eigentümers, und die RLS-Policy
-- `cr_self_sel` auf `consent_record` (person_id = current_person_id()) griff nicht: die Rolle
-- `authenticated` (SELECT-Grant auf die Sicht) sah **alle** Einwilligungsdatensätze aller
-- Personen (Probe: 11 von 11 Zeilen ohne eigene Person). Alle anderen Sichten tragen die Option.
--
-- Wirkung: Die Sicht liefert nur noch die eigenen Zeilen (Policy `cr_self_sel`); `service_role`
-- liest weiter alles. Der Code liest die Sicht ausschließlich im eigenen Kontext
-- (Onboarding, Volunteers, Speaker-Layout, Speaker-Aktionen) — keine Anpassung nötig.
-- Fehlerschlüssel: keine. Test: supabase/tests/v6_consent_current_invoker.sql
set search_path = public, extensions;

alter view consent_current set (security_invoker = true);

select harden_definer_functions();
