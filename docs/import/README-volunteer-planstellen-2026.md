# Planstellen Volunteers 2026 — Grundlage für das Schichtmodell 2027 (VOL-002, K-44 Frage 6)

`volunteer-planstellen-2026.csv` — abgeleitet am 02.10.2026 von der Architektur-Session aus der Airtable-Tabelle **„Einsatz“** der Base Volunteers 2026 (`appRrXacJe9PQ748O`), nur lesend über den Airtable-Konnektor. **Ohne Personen:** Die Tabelle verknüpft je Position und Stundenfenster (7–24 Uhr, Di 07.04. bis So 12.04.2026) die eingeteilten Volunteers; hier steht nur die **Anzahl** je Stunde, verdichtet zu Blöcken.

**Ableitung:** je Position und Tag werden zusammenhängende Stunden mit mindestens einer eingeteilten Person zu einem Block zusammengefasst; `Plaetze` = höchste gleichzeitige Anzahl im Block. 222 Zeilen in Airtable → 221 mit Positionsnamen, 206 verschiedene Positionen, **434 Blöcke** (Di 11, Mi 28, Do 63, Fr 164, Sa 143, So 25), Summe der Plätze 440.

**Spalten:** `Bereich` (leer — 2026 gab es kein Bereichsfeld; die Zuordnung zu den 15 Bereichen aus S1 ergibt sich aus dem Namenspräfix: „Akkreditierung“, „Zutrittskontrolle“, „Check-In Hero“ → Check-in; „Construction Hero“ → Auf-/Abbau; „Stage Management“ → Bühnen; „Sustainability Hero“ → Nachhaltigkeit; „Info Point“; „Speakers Care“; „Company Tours“; „VC Breakfast“ …), `Position`, `Datum`, `Beginn`, `Ende` (volle Stunden, Ortszeit), `Plaetze`, `Briefing` (Link zum Positions-Briefing 2026, falls vorhanden).

**Hinweise für den Import als Vorlagen (`shift_template`):** 179 Blöcke sind länger als 8 Stunden — 2026 war eine Position oft den ganzen Tag mit derselben Person besetzt. Das Modell 2027 arbeitet mit Blöcken von 4–6 Stunden (K-44): lange Blöcke beim Import in 4–6-Stunden-Vorlagen teilen (z. B. 09–13, 13–17, 17–21), `Plaetze` je Teilblock übernehmen. Datum 2026 → Veranstaltungstag 2027 nach Wochentag (Di Aufbau … So Abbau); FLS27 ist am 16./17.04.2027 (Fr/Sa), Auf- und Abbautage ergänzt das Team.

Quelle bleibt Airtable (nur deaktivieren, nie löschen); diese Datei ist eine einmalige Ableitung ohne Personenbezug und darf im Repo liegen.
