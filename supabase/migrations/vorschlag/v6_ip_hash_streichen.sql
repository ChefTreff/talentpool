-- 0158 · ip_hash aus audit_log und consent_record gestrichen (Konrad, 24.09.2026: „streichen, sofern kein Sicherheitsrisiko“)
--
-- Befund Security-Check F6 (24.09.2026): beide Spalten wurden von keinem Code und keiner Funktion
-- befüllt (Feldinventur: 0 Verwendungen in app/, lib/, components/, scripts/ und den 521 Live-
-- Funktionen). Der Einwilligungsnachweis stützt sich auf Zeitpunkt, Fassung, Quelle und user_agent;
-- eine IP (auch gehasht) braucht er nicht. Kein Sicherheitsrisiko, Datenminimierung (Art. 5 DSGVO).
-- Fehlerschlüssel: keine. Test: supabase/tests/v6_ip_hash_streichen.sql
set search_path = public, extensions;

alter table audit_log drop column if exists ip_hash;
alter table consent_record drop column if exists ip_hash;

select harden_definer_functions();
