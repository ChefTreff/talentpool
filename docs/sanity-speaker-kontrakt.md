# Kontrakt: Speaker nach Sanity (SPK-046)

**Stand:** 24.09.2026 · **Für:** das Website-Team · **Von:** ChefTreff-Portal (Speaker-Domäne)
**Entscheidung:** Abweichung vom Masterplan („Sanity erhält nur Partner-Logos") angenommen und im
Entscheidungslog eingetragen (24.09.2026). Zuschnitt von der Architektur-Session.

Dieses Papier beschreibt **genau ein** Dokument, das das Portal in Sanity schreibt: den Speaker.
Es ist das Gegenstück zu `docs/runbooks/sanity-partner-logos.md`, das dasselbe für Partner-Logos tut.
Gebaut wird erst nach eurer Rückmeldung — was hier steht, ist der Vorschlag, nicht das Fertige.

## Worum es geht

Die Speaker des Summit werden auf der Website heute **von Hand** gepflegt. Das Portal kennt sie
ohnehin: Name, Rolle, Unternehmen, Foto, Kurzbiografie, Sessions. Ab sofort soll es sie selbst
schreiben — damit die Website stimmt, ohne dass jemand nachträgt.

## Das Dokument

**Typ:** `portalSpeaker`
**ID:** `speaker-<person_id>` — **Bindestrich, kein Punkt.** Eine ID mit Punkt gilt in Sanity als Pfad
(wie `drafts.`), und Dokumente in Pfaden sind nur mit Token lesbar; die statisch gebaute Website liest
ohne Token. Veröffentlicht wird direkt, **nie** unter `drafts.`.

**Die ID hängt an der Person, nicht an der Edition.** Wer 2028 wiederkommt, ist dieselbe Person und
behält ihr Dokument; die Jahrgänge stehen in `editions[]`. Eine editionsgebundene ID hätte für jede
Wiederkehr ein zweites Dokument erzeugt, und die Website hätte dieselbe Person doppelt gezeigt.

### Felder

| Feld | Typ | Pflicht | Bemerkung |
|---|---|---|---|
| `_id` | string | ja | `speaker-<person_id>` |
| `_type` | string | ja | `portalSpeaker` |
| `name` | string | ja | Vor- und Nachname, wie die Person ihn im Portal führt |
| `role` | string | nein | Jobtitel |
| `company` | string | nein | Unternehmen |
| `photo` | image | nein | Asset im Sanity-Asset-Speicher (siehe unten) |
| `bioDe` | text | nein | Kurzbiografie Deutsch |
| `bioEn` | text | nein | Kurzbiografie Englisch |
| `linkedin` | url | nein | Nur LinkedIn; andere Netzwerke schicken wir nicht |
| `sessions` | array of object | nein | je Eintrag `{ titleDe, titleEn, stage, editionSlug }` |
| `editions` | array of string | ja | Editions-Kürzel, z. B. `["fls27"]`; **aufsteigend sortiert** |
| `visible` | boolean | ja | siehe „Sichtbarkeit" |
| `portalUpdatedAt` | datetime | ja | wann das Portal zuletzt geschrieben hat |

`sessions` trägt **Titel und Bühne**, keine Uhrzeit. Das Programm läuft laut Masterplan über den
Swapcard-Embed; Zeiten an zwei Stellen zu führen hiesse, sie an zwei Stellen falsch zu haben.

### Bilder

Das Foto liegt bei uns in einem **privaten** Bucket. Wir laden es serverseitig herunter und als Asset
in **euren** Sanity-Asset-Speicher hoch; ihr bekommt eine gewöhnliche Bildreferenz. Ein zweiter
öffentlicher Bucket bei uns wäre der billigere Weg gewesen — aber dann läge das Bild einer Person
öffentlich im Netz, auch wenn sie ihre Einwilligung zurückzieht. Über euren Asset-Speicher können wir
es mit dem Dokument entfernen.

## Wer erscheint — und wer verschwindet

**Geschrieben wird nur, wenn beides gilt:**

1. **Die Person hat eingewilligt** — `photo_video` für das Foto; steht zusätzlich eine
   Veröffentlichungs-Einwilligung (`speaker_release`) aus, gilt sie für Bild **und** Biografie.
2. **Das Team hat freigegeben** — der Speaker ist bestätigt und veröffentlicht.

Fehlt eines, entsteht kein Dokument. Das ist der Unterschied zum Partner-Logo: ein Logo gehört einer
Firma, ein Foto einem Menschen.

**Und es gibt einen Weg hinaus.** Widerruf der Einwilligung, Absage der Speakerin oder Entzug der
Freigabe **löschen das Dokument** — sie halten nicht nur die Aktualisierung an. Ein täglicher Abgleich
über alle freigegebenen Speaker räumt zurückgezogene Dokumente mit weg, auch wenn ein einzelner
Auslöser einmal ausfällt.

`visible` ist **kein** Ersatz dafür, sondern euer Schalter für den Fall, dass ein Dokument bestehen
bleiben, aber gerade nicht erscheinen soll (zum Beispiel vor der Programmveröffentlichung). Wer
widerruft, bekommt kein `visible: false` — sein Dokument ist weg.

## Was wir **nicht** schicken

Mailadresse, Telefonnummer, Anschrift, interne Notizen, Pipeline-Status, Reisedaten, Hotel,
Reisekosten, Ticketnummern, Slot-Zeiten, Assistenz und Agenturkontakte. Nichts davon gehört auf eine
Website, und wir schicken es deshalb gar nicht erst.

## Wie geschrieben wird

- **Nur unser eigener Dokumenttyp.** Das Portal fasst kein Dokument an, das es nicht selbst angelegt
  hat — dieselbe Regel wie bei den Partner-Logos (Entscheidungslog 11.09., Schutz eurer Baustelle).
- **Idempotent.** Gleiche Daten, gleiches Ergebnis; ein zweiter Lauf ändert nichts.
- **Mit Trockenlauf.** Vor dem ersten Echtlauf zeigen wir euch, was geschrieben würde, ohne zu
  schreiben — wie bei den Partner-Logos.
- Wir merken uns je Person die Dokument-ID und den zuletzt veröffentlichten Stand, damit eine erneute
  Freigabe das Dokument **ersetzt** statt ein zweites anzulegen.

## Was wir von euch brauchen

1. **Schema im Studio** für `portalSpeaker` mit den Feldern oben — oder eure Gegenvorschläge zu
   Namen und Typen. Sagt uns, was ihr anders schneiden würdet; wir richten uns danach.
2. **Token mit Schreibrecht** auf diesen Dokumenttyp und den Asset-Speicher. Für die Partner-Logos
   haben wir eins; ob dasselbe reicht oder ihr ein zweites wollt, entscheidet ihr.
3. **Eine Antwort auf drei Fragen:**
   - Wollt ihr `sessions` am Speaker-Dokument, oder verknüpft ihr lieber von eurer Programmseite her?
   - Reicht euch ein Foto, oder braucht ihr Varianten (Hochformat, Freisteller)?
   - Soll `visible` bei uns oder bei euch liegen? Unser Vorschlag: bei euch — ihr wisst, wann die
     Seite live geht.

## Zeitplan

Ziel ist **vor dem 01.11.2026**. Der lange Weg ist nicht der Code, sondern das Schema: solange es
nicht steht, können wir nicht schreiben. Deshalb geht dieses Papier zuerst hinaus.
