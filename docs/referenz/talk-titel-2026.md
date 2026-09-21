# Talk-Titel und -Beschreibungen FLS26 — Referenz für den Titel-Assistenten

**Stand: 2026-09-17 · Quelle: Konrad (Export „Slots & Timetable — All Titles" aus dem Programm-Sheet 2026) · Datei: `talk-titel-2026.csv`**

Grundlage für **SPK-012** (Titel-Assistent im Speaker-Portal, Baustein S6): Speaker beschreiben ihren Inhalt und bekommen Titel- und Beschreibungsvorschläge. Die Vorschläge sollen nach ChefTreff klingen, nicht nach Allgemeinplatz — dafür braucht das Modell Beispiele aus dem eigenen Haus.

## Was drin ist

170 Sessions des Summit 26 mit Titel, Beschreibung und Format.

| Format (`session_format`) | Zeilen |
|---|---|
| `keynote` | 72 |
| `masterclass` | 31 |
| `panel` | 31 |
| `interview` | 21 |
| `side_event` | 10 |
| `podcast` | 3 |
| `pitch_battle` | 2 |

13 Zeilen haben nur einen Titel ohne Beschreibung. Sie bleiben drin: als Titelbeispiel taugen sie, und wer sie für Beschreibungen nicht will, filtert auf ein nicht leeres Feld.

Beschreibungen sind zwischen 252 und 1810 Zeichen lang, im Mittel etwa 550 — das ist zugleich die Länge, auf die der Assistent zielen sollte.

## Spalten

| Spalte | Bedeutung |
|---|---|
| `format` | Schlüssel aus dem Vokabular `session_format` |
| `typ_2026` | die Bezeichnung aus dem Sheet 2026, unverändert |
| `titel` | Titel wie in Swapcard veröffentlicht |
| `beschreibung` | Beschreibung wie in Swapcard veröffentlicht |
| `slot_ref` | Slot-Kennung aus dem Sheet 2026 (`SL001` …), nur zur Rückverfolgung |

## Aufbereitung

Aus dem Export übernommen, dabei: weiche Trennstriche und schmale Bindestriche normalisiert, Zeilenumbrüche vereinheitlicht, Mehrfach-Leerzeichen zusammengezogen, nach Format und Titel sortiert. Inhaltlich wurde **nichts** geändert — kein Kürzen, kein Umformulieren.

Die sieben Typen des Sheets sind auf das Vokabular abgebildet; alle sieben hatten ein Gegenstück. Eine Ungenauigkeit bleibt: **Startup Pitch** (2 Zeilen) liegt auf `pitch_battle`. Das ist im Vokabular ein Wettbewerb, im Sheet war es ein einzelner Pitch. Für den Assistenten ist das folgenlos; wer den Schlüssel fachlich braucht, sollte ihn prüfen.

## Datenschutz

Der Export enthält **keine Personendaten als eigene Spalte** — keine Speaker-Namen, keine Organisationen, keine Kontaktdaten. Geprüft auf E-Mail-Adressen und Telefonnummern im Volltext: keine Treffer.

Trotzdem gilt für die Verwendung: In den Beschreibungen werden Unternehmen und vereinzelt Personen genannt, weil sie dort inhaltlich vorkommen. Für den Titel-Assistenten heisst das — wie beim Wiki-Assistenten (Entscheidung 17.09.) — **kein Personenbezug im Prompt**: an das Modell gehen die Eingabe des Speakers und die Beispiele, sonst nichts. Kein Name, keine Rolle, keine ID, kein Verlauf.

## Nächste Verwendung

Baustein **S6** (SPK-012). Offen ist dort noch, ob die Beispiele als fester Teil des Systemtextes mitlaufen (wenige, kurze, je Format eines) oder ob nach Format gefiltert nachgeschlagen wird. Empfehlung: je Format drei bis fünf Beispiele fest im Prompt — 170 Sessions passen nicht in ein Kontextfenster, und eine Suche lohnt bei dieser Menge nicht.
