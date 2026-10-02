# Runbook · Speaker auf die Website (Sanity, SPK-046)

Das Portal schreibt freigegebene Speaker als Dokument `portalSpeaker` (`speaker-<person_id>`) in das Sanity-Dataset der Website. Kontrakt mit dem Website-Team: `docs/sanity-speaker-kontrakt.md`. Vorbild ist `sanity-partner-logos.md`.

**Stand 02.10.2026:** Gebaut. Das Übertragen ist **gesperrt**, bis das Website-Team (Patrick, Juliane) den Kontrakt freigegeben hat; die Vorschau geht jederzeit.

## Wer auf die Website geht

Ein Dokument entsteht nur, wenn **alles** gilt:
- Einwilligung `speaker_release` („Speaker-Freigabe (Name/Bild/Bio)“) und Einwilligung `photo_video`;
- Pipeline „veröffentlicht“ oder „teilgenommen“, nicht abgesagt;
- kein Gast einer Partner-Standbühne und kein Testprofil (`testdaten:` in der internen Notiz).

Die Datenbankfunktion `sanity_speakers()` liefert nur die öffentlichen Felder. Was nie übertragen wird, steht im Kontrakt.

## Bedienen

`/admin/speaker` → **„Website (Sanity)“** → `/admin/speaker/website` (Abschnitt `speakers`: Speaker-Team, Programmteam, Admin).

1. **Vorschau:** schreibt nichts. Die Liste zeigt je Person:
   - **Anlegen**, mit Hinweis, wenn ein Foto hochgeladen würde;
   - **Ändern**, mit den geänderten Feldern;
   - **Entfernen**, mit Grund;
   - **Zurückgehalten**, mit Grund;
   - die Zahl der unveränderten.

   Sanity prüft jedes Dokument mit `dryRun`. Fehler stehen je Person darunter.
2. **Übertragen** (nach der Vorschau, mit Rückfrage):
   - entfernt zuerst, was weg muss, dann legt es an bzw. ändert;
   - je Person eine Transaktion: `createIfNotExists` und `patch` auf unsere Felder. Was das Web-Team im Studio setzt, z. B. `visible`, bleibt.
   - Jeder Lauf steht im Sync-Protokoll (`integration.sync_job`, System `sanity`, `speakers_preview`/`speakers`), nur mit Zahlen.

**Kein Testdaten-Schritt nötig:** Konrads Konto sieht die Seite als Admin. Seine Testprofile erscheinen in der Vorschau als „zurückgehalten · Testprofil“, echte Speaker, sobald sie veröffentlicht sind und eingewilligt haben.

## Freigabe und erster Lauf

1. Das Website-Team legt das Schema `portalSpeaker`/`portalSpeakerSession` im Studio an, gibt einen Token mit **Editor**-Rolle und bestätigt den Kontrakt (Fragen am Ende des Kontrakts).
2. Den Token ersetzen, falls bisher nur der Viewer-Token gesetzt ist:
   ```bash
   sh scripts/env-set.sh SANITY_API_TOKEN
   ```
3. Den Schalter setzen. Er ist kein Geheimnis und deshalb `--config`:
   ```bash
   printf 'true' | sh scripts/env-set.sh SANITY_SPEAKERS_WRITE_ENABLED --config
   ```
   Wirksam ab dem nächsten Deployment (Merge auf `main` oder in Vercel „Redeploy“).
4. `/admin/speaker/website` → „Vorschau“ → Liste mit dem Website-Team durchgehen → „Übertragen“.
5. In Sanity prüfen: `*[_type == "portalSpeaker"]{_id, name, editions}`. Im Studio erscheinen die Dokumente, sobald das Schema dort steht.

Zurücknehmen: den Schalter auf `false` setzen. Dann legt der Knopf nichts mehr an. Entfernt wird weiter: Der Weg hinaus hängt nicht am Schalter.

## Der Weg hinaus (automatisch)

- Widerruf einer der beiden Einwilligungen, Absage, Entzug der Freigabe oder Löschung der Person (`anonymize_person`) schließen das Tor.
- Der Cron `/api/cron/mail` (alle 10 Minuten) löscht dann das Dokument **und sein Foto-Asset** in Sanity und danach die Merkzeile (`external_ref`, System `sanity`, Typ `speaker`). Dasselbe tut jeder Lauf mit „Übertragen“.
- Bei Sanity angefragt wird nur, wenn wirklich ein Dokument weg muss. Ohne veröffentlichte Dokumente passiert nichts.
- `external_ref` hat keinen Fremdschlüssel zur Person und übersteht die Profillöschung. So bleibt der Weg zum Dokument erhalten, bis es weg ist.

## Fehlerbilder

| Meldung | Bedeutung | Abhilfe |
|---|---|---|
| „Übertragen ist gesperrt“ | Schalter `SANITY_SPEAKERS_WRITE_ENABLED` fehlt | erst nach Freigabe setzen (oben) |
| „Sanity ist nicht eingerichtet“ | `SANITY_PROJECT_ID`/`SANITY_API_TOKEN` fehlen | `docs/zugangs-liste.md` |
| Vorschau: „Sanity hat die Dokumente nicht geprüft“ | auch Sanitys `dryRun` verlangt Schreibrecht, der Token hat nur Leserechte (Stand 02.10.: 403 „permission create required“) | gewollt bis zur Freigabe; die Liste gilt trotzdem. Nach dem Editor-Token prüft Sanity mit |
| beim Übertragen je Person `sanity 403 …` | Token hat nur Leserechte | Editor-Token setzen |
| je Person „Foto wurde nicht als Bild angenommen“ | Sanity lehnt die Datei als Bild ab | Porträt im Portal neu hochladen lassen |
| je Person `Foto laden: …` | Datei fehlt im Bucket `speaker-assets` | Porträt neu hochladen lassen |

## Regeln

- Geschrieben wird nur `portalSpeaker` und dessen Foto-Asset. Nie ein fremdes Dokument, nie das Schema.
- Kein `createOrReplace`: Felder des Web-Teams überleben jede Aktualisierung.
- Starke Referenzen aus Website-Seiten auf `portalSpeaker` blockieren das Löschen. Die Website verweist deshalb per Text-ID oder schwacher Referenz (Kontrakt).
