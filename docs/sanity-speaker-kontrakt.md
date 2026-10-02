# Kontrakt: Speaker nach Sanity (SPK-046) — v2

**Stand:** 02.10.2026, v2. v1 vom 24.09. war ein Vorschlag ohne Blick ins Dataset.
**Für:** das Website-Team (Patrick, Juliane).
**Von:** ChefTreff-Portal, Speaker-Domäne.

**Entscheidung:** Die Abweichung vom Masterplan („Sanity erhält nur Partner-Logos“) ist angenommen und im Entscheidungslog eingetragen (24.09.2026), Zuschnitt von der Architektur-Session.

**Stand im Portal:**
- Die Übertragung ist gebaut (Admin `/admin/speaker/website`). Sie schreibt aber erst, wenn ihr diesen Kontrakt freigebt und Konrad den Schalter umlegt.
- Bis dahin gibt es nur die Vorschau. Sie schreibt nichts, Sanity prüft dabei jedes Dokument mit `dryRun`.

Dieses Papier beschreibt **genau ein** Dokument, das das Portal in Sanity schreibt: den Speaker. Es ist das Gegenstück zu `docs/runbooks/sanity-partner-logos.md`. Bedienung im Portal: `docs/runbooks/sanity-speaker.md`.

## Was v2 gegenüber v1 ändert

1. **Befund aus eurem Dataset** (unten). Es gibt keinen Speaker-Dokumenttyp. Eure Seiten führen Speaker als Airtable-IDs.
2. **Felder im Format eures Studios:** Sprachfelder als `internationalizedArray*`, Rolle als Sprachfeld wie im Baustein `quote`.
   - Aus v1 werden `bioDe`/`bioEn` zu `bio`.
   - Neu ist `website`.
3. **Wir überschreiben nie, was ihr setzt:** Anlegen nur, wenn das Dokument fehlt; danach `patch` nur auf unsere Felder. In v1 stand das offen.
4. **Das Tor genau:** zwei Einwilligungen **und** die Freigabe durch das Team. Dazu kommen nie Testprofile und nie Gäste der Standbühne.
5. **Einbindung in `speakerSection`:** Die Website-Seiten verweisen auf unsere IDs, als Text oder als **schwache** Referenz. Eine starke Referenz würde das Löschen nach einem Widerruf blockieren.

## Befund im Dataset (02.10.2026, nur lesend)

- **Dataset `production`:** 267 veröffentlichte Dokumente, 13 Typen, 37 Entwürfe.
  - Die Typen sind FAQ, Tickets, Seiten (`page`), Navigation, Footer und Einstellungen, dazu 137 Bild-Assets.
  - **Ein Speaker-Dokument gibt es nicht**, und das Studio-Schema (37 Typen) kennt keinen Speaker-Typ.
  - `portalPartnerLogo` ist noch nicht geschrieben; bisher gab es nur Trockenläufe.
- **Speaker stehen als Baustein `speakerSection` in Seiten:** 9 Abschnitte, davon 6 in Entwürfen, z. B. `home`, `fls26-speaker`, `future-leader-academy`.
  - `speakers`: Liste von Texten (mindestens einer). Darin stehen **Airtable-Datensatz-IDs** (`rec…`, 17 Zeichen): 192 Einträge, 162 verschiedene Speaker.
  - `portraitAdjustments[]`: `{ speakerId, scale, x, y }`, je −30 bis 30. Das ist die Porträt-Justage je Speaker und Abschnitt.
  - `showFilter`, dazu Überschrift, Text und Variante wie bei den anderen Abschnitten.
  - **Name, Foto und Bio kommen heute also aus Airtable**, nicht aus Sanity.
- **Konventionen im Studio:**
  - Sprachfelder sind Listen `{ _key, _type, language, value }` mit `de`/`en` (Plugin `internationalizedArray`).
  - Personennamen stehen als Text (`quote.name`), die Rolle als Sprachfeld (`quote.role`).
  - Bilder sehen so aus: `{ _type: "image", asset: { _type: "reference", _ref: "image-…" } }`.

## Das Dokument

**Typ:** `portalSpeaker`.

**ID:** `speaker-<person_id>`.
- **Bindestrich, kein Punkt:** Eine ID mit Punkt gilt in Sanity als Pfad und ist ohne Token nicht lesbar.
- Veröffentlicht wird direkt, **nie** unter `drafts.`.

**Die ID hängt an der Person, nicht an der Edition.** Wer 2028 wiederkommt, behält sein Dokument; die Jahrgänge stehen in `editions`.

### Felder

| Feld | Typ | Pflicht | Aus dem Portal | Bemerkung |
|---|---|---|---|---|
| `_id` | string | ja | `speaker-<person_id>` | fest |
| `_type` | string | ja | `portalSpeaker` | |
| `personId` | string | ja | Person | Kennung, kein Anzeigefeld |
| `name` | string | ja | Vor- und Nachname | wie `quote.name` |
| `role` | internationalizedArrayString | nein | Jobtitel | ein Text je Profil, in `de` **und** `en` derselbe |
| `company` | string | nein | Organisation | Angabe im Profil, sonst Kommunikationsname der Firma |
| `bio` | internationalizedArrayText | nein | Kurzbio DE/EN | nur die vorhandenen Sprachen |
| `website` | url | nein | Website aus dem Profil | nur `http(s)://` |
| `linkedin` | url | nein | LinkedIn der Person | nur `http(s)://`; X und Instagram schicken wir nicht |
| `photo` | image | nein | Porträt | Asset in **eurem** Asset-Speicher (siehe „Bilder“) |
| `sessions` | array of `portalSpeakerSession` | ja (darf leer sein) | veröffentlichte Sessions | **ohne Uhrzeit** |
| `editions` | array of string | ja | z. B. `["fls27"]` | aufsteigend sortiert |
| `visible` | boolean | ja | — | **gehört euch**, siehe unten |
| `portalUpdatedAt` | datetime | ja | — | wann das Portal zuletzt geschrieben hat |

`portalSpeakerSession` (Objekt, `_key` = Session-Kennung):

| Feld | Typ | Bemerkung |
|---|---|---|
| `title` | internationalizedArrayString | Titel DE/EN |
| `stage` | string | Bühne, falls die Session schon einen Slot hat |
| `editionSlug` | string | z. B. `fls27` |

`sessions` trägt **Titel und Bühne, keine Uhrzeit.** Das Programm läuft laut Masterplan über den Swapcard-Embed; Zeiten an zwei Stellen zu führen hieße, sie an zwei Stellen falsch zu haben.

## Wie die Website es einbindet (Vorschlag)

`speakerSection.speakers` zeigt heute auf Airtable. Für FLS27 zeigt es auf unsere Dokumente:

- **(a) Kleinster Schritt:**
  - Die Liste bleibt ein Text-Array, und ihr tragt unsere IDs ein (`speaker-…`).
  - Die Website liest `*[_type == "portalSpeaker" && _id in $ids]` statt Airtable.
  - `portraitAdjustments[].speakerId` funktioniert unverändert mit denselben IDs.
- **(b) Studio-Auswahl:**
  - `speakers` wird eine Liste von **schwachen** Referenzen (`{ _type: "reference", _ref, _weak: true }`) auf `portalSpeaker`, das Studio zeigt dann eine Auswahl nach Namen.
  - **Bitte keine starken Referenzen:** Sanity lehnt das Löschen eines Dokuments ab, auf das stark verwiesen wird. Nach einem Widerruf **muss** unser Dokument aber weg.
  - Fehlt ein referenziertes Dokument, überspringt die Website den Eintrag.

Das Portal kennt die alten Airtable-IDs nicht. Abschnitte aus FLS26 können bei Airtable bleiben, solange es läuft; neue Abschnitte nutzen unsere IDs.

## Bilder

- Das Porträt liegt bei uns in einem **privaten** Bucket. Der Server lädt es, dreht es nach EXIF und verkleinert es auf höchstens 2000 px. Er speichert es als WebP (Transparenz bleibt) **ohne Metadaten**, also ohne Kamera, Ort und Uhrzeit.
- Danach lädt er es als Bild-Asset in **euren** Asset-Speicher. Ihr bekommt eine gewöhnliche Bildreferenz.
- Eine neue Fassung im Portal lädt ein neues Asset hoch, das alte nehmen wir danach weg.
- Mit dem Dokument verschwindet auch sein Bild.
- Die Ausschnitte bleibt eure Sache (`portraitAdjustments`). Varianten (Hochformat, Freisteller) gibt es heute nicht, siehe Frage 4.

## Wer erscheint — und wer verschwindet

**Geschrieben wird nur, wenn alles gilt:**

1. **Einwilligung „Speaker-Freigabe (Name/Bild/Bio)“** (`speaker_release`). Ihr Wortlaut deckt genau die Website ab.
2. **Einwilligung „Foto- und Videoaufnahmen“** (`photo_video`).
3. **Freigabe durch das Team:** Pipeline-Status „veröffentlicht“ oder, nach dem Summit, „teilgenommen“; nicht abgesagt.

Darüber hinaus gilt:
- **Nie dabei** sind Gäste einer Partner-Standbühne und Testprofile.
- Fehlt eine Bedingung, entsteht kein Dokument. Die Vorschau im Portal nennt jeden Zurückgehaltenen mit Grund.

**Der Weg hinaus.** Widerruf einer Einwilligung, Absage, Entzug der Freigabe oder Löschung der Person **löschen das Dokument samt Foto**. Das passiert ohne Knopf: Das Portal prüft alle 10 Minuten (Cron) und bei jedem Lauf. Es betrifft nur Dokumente, die das Portal selbst angelegt hat.

**`visible`:**
- Das Portal setzt es beim Anlegen auf `true` und fasst es danach nie wieder an. Es ist euer Schalter, etwa vor der Programmveröffentlichung.
- `visible` ist **kein** Ersatz für den Weg hinaus: Wer widerruft, bekommt kein `visible: false`, sein Dokument ist weg.

## Was wir **nicht** schicken

Mailadresse, Telefonnummer, Anschrift, interne Notizen, Pipeline-Einordnung (Kategorie, Priorität, Kanal), Reisedaten, Hotel, Reisekosten, Ticketnummern, Ernährungs- und Gesundheitsangaben, Slot-Zeiten, Assistenz- und Agenturkontakte, X und Instagram. Dazu Gäste der Standbühne und Testprofile. Die Datenbankfunktion `sanity_speakers()` gibt diese Felder gar nicht erst heraus (Test `v6_sanity_speaker`).

## Wie geschrieben wird

- **Nur unser eigener Dokumenttyp.** Das Portal fasst kein Dokument an, das es nicht selbst angelegt hat (Entscheidungslog 11.09.).
- **Eure Felder bleiben stehen:**
  - Je Speaker eine Transaktion: `createIfNotExists` (nur `_id`, `_type`, `visible: true`), dann `patch` mit `set` auf genau die Felder oben.
  - Fehlende optionale Felder nimmt `unset` weg.
  - **Nie `createOrReplace`.** Was ihr am Dokument ergänzt, überlebt jede Aktualisierung.
- **Idempotent.** Je Person merkt sich das Portal einen Fingerabdruck je Feld, ohne Namen. Unverändertes wird nicht neu geschrieben, Geändertes nennt die Vorschau feldgenau.
- **Mit Vorschau, nie automatisch.** Anlegen und Ändern laufen nur per Knopf im Admin: Vorschau (Sanity prüft mit `dryRun`), dann „Übertragen“ mit Rückfrage. Ihr seht vorher, was kommt. Automatisch läuft nur der Weg hinaus.
  - Auch `dryRun` verlangt bei Sanity Schreibrecht. Mit dem heutigen Viewer-Token antwortet Sanity 403 (geprüft am 02.10.2026, nichts geschrieben).
  - Die Vorschau zeigt den Plan dann ohne Sanity-Prüfung. Mit eurem Editor-Token prüft Sanity jedes Dokument vor dem ersten Lauf.
- **Erst nach eurer Freigabe.** Der Knopf „Übertragen“ bleibt gesperrt, bis Konrad nach eurem OK `SANITY_SPEAKERS_WRITE_ENABLED=true` setzt.

## Was wir von euch brauchen

1. **Schema im Studio** für `portalSpeaker` und `portalSpeakerSession` mit den Feldern oben, oder eure Gegenvorschläge zu Namen und Typen. Wir richten uns danach.
2. **Token mit Schreibrecht** (Rolle Editor) auf das Dataset. Für die Partner-Logos gilt dasselbe; ob ihr eins oder zwei wollt, entscheidet ihr.
3. **`speakerSection`:** Variante (a) oder (b) von oben, und eure Abfrage von Airtable auf `portalSpeaker` umgestellt.
4. **Antworten auf drei Fragen:**
   - Wollt ihr `sessions` am Speaker-Dokument, oder verknüpft ihr lieber von eurer Programmseite her?
   - Reicht ein Porträt, oder braucht ihr Varianten (Hochformat, Freisteller)?
   - Passt es, dass `visible` beim Anlegen `true` ist und danach euch gehört?

## Zeitplan

Ziel ist **vor dem 01.11.2026**. Gebaut ist auf unserer Seite alles. Der Rest ist euer Schema, der Token und eure Freigabe, danach der erste Lauf.
