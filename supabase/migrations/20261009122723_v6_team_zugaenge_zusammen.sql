-- 0298 · Team & Zugänge: ein Abschnitt, eine Seite — team geht in access auf, team_members() entfällt (ADM-094)
-- Angewendet von der Architektur-Session am 09.10.2026 als 20261009122723.
--
-- Anlass: Konrad 08.10.2026 („Team und Zugänge … der Unterschied ist nicht erkennbar“); Plan hat am 08.10. entschieden:
-- eine Seite, der Abschnitt `team` entfällt zugunsten `access`, die Lesefunktion `team_access_list` liegt (0290).
-- Mit dieser Migration zieht die Oberfläche um: `/admin/verwaltung/zugaenge` zeigt Team und Zugänge in einer Liste,
-- `/admin/team` leitet dorthin um (Pfad, Menü und Abschnittsliste in `lib/admin-sections.ts` im selben PR).
--
-- 1 · **Abschnitt `team` entfällt** in `admin_section_role` (Spiegel von `lib/admin-sections.ts`, gehalten von
--     tests/admin-sections.test.ts). `has_admin_section('team')` ist danach ein Tippfehler-Fehler (22023 `unknown_section`) —
--     laut, nicht still.
-- 2 · **Ausnahmen auf `team` (ADM-053) werden nicht übernommen, sondern entfernt.** `team_members()` prüfte `has_role('admin')`
--     und nicht den Abschnitt: eine Ausnahme „darf Team“ öffnete die Seite, aber nie die Liste — sie war wirkungslos. In
--     `access` hätte dieselbe Zeile plötzlich Einladen, Sperren und Kiosk-Konten erlaubt, also mehr, als je gewollt war.
--     Wer jemandem den Zugangsbereich geben will, setzt die Ausnahme auf `access` bewusst neu (`/admin/rollen`).
--     Live standen am 09.10.2026 keine Ausnahmen auf `team` oder `access` (Probe über die Tabelle).
-- 3 · **`team_members()` entfällt.** Ihre Aufgabe übernimmt `team_access_list(p_filter => 'team')` (mit Gesperrten, Rollen
--     aller Art, Abschnittsrecht statt `has_role('admin')`). Nichts im Code ruft sie noch auf.
--     `access_accounts()` bleibt als Gegenprobe der Lesefunktion (Test v6_team_access_list, Schritt 07).
--
-- Keine neuen Funktionen, keine neuen Spalten, keine Rechteausweitung: wer `access` öffnet, durfte das schon.
-- Fehlerschlüssel: unverändert (42501, 22023 `unknown_section` für den entfallenen Schlüssel).
set search_path = public, extensions;

-- 1 · Abschnitt
delete from admin_section_role where section = 'team' and role = 'admin';

-- 2 · Ausnahmen auf dem entfallenen Abschnitt
delete from admin_section_override where section = 'team';

-- 3 · Funktion
drop function if exists team_members();

select harden_definer_functions();
