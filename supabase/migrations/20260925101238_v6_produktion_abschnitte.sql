-- 0197 · Produktion als eigene Admin-Abschnitte: Stände, Bestellungen, Dateien (ADM-054)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925101238.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad, 24.09. — „Regie, Stände, Bestellungen, Catering, Dateien als eigene Unterseiten
-- mit eigenen Menüpunkten, verschiedene Personen arbeiten damit." Bisher waren es Reiter **einer**
-- Seite hinter **einem** Abschnitt (`production`): wer Bestellungen pflegen sollte, sah zwangslaeufig
-- auch die Regie, und umgekehrt.
--
-- Drei neue Abschnitte mit **denselben** Rollen wie `production`. Das ist Absicht: hier geht es um
-- Navigation und darum, dass sich die Rechte ab jetzt **je Seite** ueber `/admin/rollen` unterscheiden
-- lassen (PORT1b, `admin_section_override`) — nicht darum, sie gleich umzuverteilen. Wer heute die
-- Produktion sieht, sieht morgen dasselbe; wer nur die Bestellungen sehen soll, bekommt jetzt eine
-- Ausnahme statt eines neuen Codeschnitts.
--
-- **Catering bekommt keinen vierten Abschnitt.** Es hatte laengst einen eigenen (`catering`,
-- `/admin/catering`) mit derselben Ansicht und derselben Komponente; die Seite unter der Produktion
-- war eine Dublette mit einer zweiten Rollenliste. Sie faellt weg, die Adresse leitet weiter
-- (`next.config.ts`), und niemand verliert Zugang: der Abschnitt `catering` schliesst
-- `production_team` und `area_lead_production` ein.
--
-- Spiegelung von `lib/admin-sections.ts` (PORT1b); `tests/admin-sections.test.ts` haelt beide
-- gegeneinander. Keine Funktion aendert sich.
-- Test: `supabase/tests/v6_produktion_abschnitte.sql`.

insert into admin_section_role (section, role) values
  ('productionBooths', 'admin'),
  ('productionBooths', 'production_team'),
  ('productionBooths', 'area_lead_production'),
  ('productionOrders', 'admin'),
  ('productionOrders', 'production_team'),
  ('productionOrders', 'area_lead_production'),
  ('productionFiles', 'admin'),
  ('productionFiles', 'production_team'),
  ('productionFiles', 'area_lead_production')
on conflict (section, role) do nothing;

select harden_definer_functions();
