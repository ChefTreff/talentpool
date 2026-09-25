# Übertragungsprüfung ausgehender Schnittstellen (QS-036)

Stand 25.09.2026 · Pflege: Admin & Schnittstellen · Konrads Maßstab: **die Kette muss funktionieren, nicht nur aussehen.**

Geprüft wird je Übertragung: Endpunkt gegen die Beschreibung des Anbieters, Pflichtfelder, Idempotenz, Verhalten bei Abbruch, und ob das Ergebnis am anderen Ende ankommt.

## vivenu · Freiticket für Speaker (SPK-068)

| | |
|---|---|
| Endpunkt | **`POST /api/tickets/free`** |
| Idempotenz | `batchId` = unsere Ticket-Kennung; vor dem Anlegen `GET /api/tickets?batch=…` |
| Mailversand | `sendMail: false` — die Ticket-Mail schickt das Portal (`ticket_final`) |
| Wiederholung | 429 und 5xx über `lib/vivenu/backoff.ts` |

**Befund 1 — der Endpunkt heißt anders, als im Auftrag stand.** Die vivenu-Antwort vom 11.09. nannte „`POST tickets#create-free-tickets`", der Arbeitsauftrag daraus `POST /api/tickets`. In der OpenAPI-Beschreibung trägt `/api/tickets` **nur ein `GET`**; das Anlegen liegt unter `/api/tickets/free` (`operationId: tickets/create`). Ein Aufruf nach Auftrag wäre mit 404 gescheitert.

**Befund 2 — kein `meta`, kein `extraFields` beim Anlegen.** Das Schema `CreateFreeTicketValidationSchema` kennt zwei Varianten (mit `customerId` oder mit `prename`/`lastname`/`email`) und sonst `eventId`, `items`, `sendMail`, `customMessage`, `requiresPersonalization`, **`batchId`**, `salesChannelId`, `underShopId`, Adressfelder, `addToCustomers`. Der einzige frei belegbare Rückverweis ist `batchId` — also trägt er unsere Ticket-Kennung. Die Antwort (`TicketResource`) liefert `_id`, `barcode`, **`secret`**, `transactionId` und `batch`; das Secret muss in der Regel nicht über `GET /api/transactions/{id}/tickets` nachgeholt werden (der Weg bleibt als Rückfall).

**Befund 3 — der Webhook konnte das Ausstellen kaputtmachen.** `ticket.created` trifft oft ein, bevor die Server-Action `set_ticket_issued` gerufen hat. `ingest_vivenu_ticket` suchte die Zeile nur über `vivenu_ticket_id`, die zu dem Zeitpunkt noch leer ist — er legte also eine **zweite** Zeile an (`source = 'vivenu'`), und `set_ticket_issued` scheiterte danach am eindeutigen Index `ticket_vivenu_ticket_id_key` mit 23505, **nachdem das Ticket bei vivenu bereits existierte**. Ein zweiter Klick hätte eine zweite Karte erzeugt. Behoben: Der Ingest erkennt unsere Tickets zusätzlich an `batch` und aktualisiert die vorhandene Zeile; `set_ticket_issued` ist idempotent, wenn dieselbe vivenu-Kennung schon steht. Beides im Test belegt (`v6_speaker_ticket_ausstellen.sql`, Schritte 04–07).

### Nicht belegt: der Lauf gegen die Sandbox

**Der lokale `VIVENU_API_KEY` gehört zur Produktion, nicht zur Sandbox** (geprüft 25.09., nur lesend):

| Aufruf | Sandbox `vivenu.dev` | Produktion `vivenu.com` |
|---|---|---|
| `GET /events` | **401** „API Key not found or expired" | **200**, 20 Events |
| `GET /events/6aa450d647fa1075ce6c7c74` (unsere Edition) | 401 | **404** |

Gleichzeitig steht `VIVENU_SANDBOX=true`, also gehen **alle** Aufrufe an den Sandbox-Host, wo der Schlüssel nicht gilt. Und die in der Datenbank hinterlegte Event-Kennung gibt es im Produktionskonto nicht — sie stammt aus der Sandbox. Die Konfiguration ist damit in sich widersprüchlich: Es fehlt ein **Sandbox-Schlüssel**.

~~Zu tun (Konrad): `sh scripts/env-set.sh VIVENU_API_KEY` mit dem Sandbox-Wert.~~ **Erledigt am 25.09.2026 (K-33).** Der Schlüssel war bewusst ein Produktionsschlüssel zum Testen; Konrad hat den Sandbox-Wert nachgezogen. Die Kette ist damit belegt — siehe den nächsten Abschnitt.

## vivenu · Kettenprüfung am echten Sandbox-Ticket (25.09.2026)

Gefahren mit `node --env-file=.env.local scripts/vivenu-sandbox-lauf.mjs kette` (neuer Schritt) an Konrads Freiticket `937c78de…`, Event `DEV Future Leader Summit 2027`, Tickettyp „Speaker Pass". Der Schritt spiegelt `issueSpeakerTicket` Aufruf für Aufruf; **nicht** geprüft ist der Klick selbst, weil `requireAdminSection` eine Anmeldung braucht — die macht Konrad.

| Glied | Ergebnis |
|---|---|
| `speaker_ticket_for_issue` | Inhaberin, Event `6aa450d6…`, Tickettyp `6aa502a2…` — eine Zeile |
| `GET /tickets?batch=…` vorher | 0 Treffer |
| `POST /tickets/free` | Ticket angelegt, **Barcode ja, Secret ja**, `batch` = unsere Kennung, `status: VALID` |
| Idempotenz danach | dieselbe Abfrage findet genau unser Ticket wieder |
| `set_ticket_issued` | `status = valid`, Barcode, vivenu-Kennung, Tickettyp-Zuordnung geschrieben |
| Wallet-Ziel | `HTTP 200` auf der vivenu-Ticketseite (über 308 auf die kanonische Adresse); die Adresse wird nirgends ausgegeben, sie enthält das Secret |
| Swapcard-Export | Konrad in `event_app_speakers` enthalten |

**Befund 4 — ein storniertes Ticket galt als „gibt es schon".** Beim Aufräumen aufgefallen: nach `POST /tickets/{id}/invalidate` gibt `GET /tickets?batch=…` das Ticket **weiterhin** zurück, mit `status: "INVALID"`. `findFreeTicketByBatch` nahm den ersten Treffer, also hätte das nächste Ausstellen den **toten Barcode** des stornierten Tickets in unsere Zeile geschrieben: das Portal zeigte ein gültiges Ticket mit QR-Code, am Einlass wäre es keines — und niemand hätte es gemerkt, weil kein Fehler entsteht. Der Fall ist nicht konstruiert: ein Speaker sagt ab (Ticket storniert), sagt wieder zu, das Team stellt neu aus.

Behoben: `findFreeTicketByBatch` nimmt nur ein **lebendes** Ticket (`VALID`, `DETAILSREQUIRED`, `CHECKEDIN`, `CHECKED_IN`, `BLOCKED` — dieselbe Liste wie `vivenu_ticket_status()`), sucht mit `top=10` statt 2, weil nach einem Storno mehrere Tickets zur selben Kennung stehen, und behandelt Unbekanntes als „nicht vorhanden" — die Richtung, in der ein zweites Ticket entsteht statt eines toten Barcodes. Das zweite sieht das Team, den toten niemand. Belegt im erneuten Lauf: `1 Treffer, davon lebend 0 [INVALID]` → neues Ticket angelegt; danach `2 Treffer gesamt, 1 lebend, das neue dabei`.

**Befund 5 — der Webhook läuft in der Sandbox.** Unbeabsichtigter, aber willkommener Beleg: das Storno kam als `ticket.updated` bei uns an, und `ingest_vivenu_ticket` setzte unsere Zeile auf `cancelled` (`vivenu_updated_at` gesetzt). Der Webhook-Weg ist damit am echten Ereignis geprüft, nicht nur im Test.

**Befund 6 — der Swapcard-Export kennt eine andere Definition von „bestätigt" als der Ticket-Trigger.** Im ersten Lauf war der Export **leer**. Ursache: `event_app_speakers` filtert auf `confirmed_at is not null`, der Ticket-Trigger `speaker_profile_tickets_sync` dagegen auf `speaker_is_confirmed(pipeline_status)`. Beide Testprofile standen auf `pipeline_status = 'confirmed'` **ohne** `confirmed_at` — sie hatten ein Ticket, fehlten aber in der Event-App. Im Produktivweg fallen die beiden nicht auseinander, weil `set_speaker_pipeline` die einzige schreibende Funktion ist und beides setzt; **jeder Weg daneben** (Testdaten, künftiger Altdaten-Import) kann sie trennen, und zwar lautlos. Sofortmaßnahme: `scripts/testdaten-konrad.mjs` setzt `confirmed_at` mit. **Empfehlung an die Architektur-Session:** eine Definition statt zwei — entweder `event_app_speakers` auf `speaker_is_confirmed(pipeline_status)` umstellen oder `confirmed_at` per Trigger an den Status koppeln. Vor dem Altdaten-Import entscheiden.

**Wiederholen:** `node --env-file=.env.local scripts/testdaten-konrad.mjs --apply --nur=ticket-zurueck` (setzt zurück und storniert dabei ein vivenu-Ticket, das aus unserem Weg stammt — erkennbar an `batch`), dann `… scripts/vivenu-sandbox-lauf.mjs kette`.

## Swapcard · Löst der Personen-Import eine Einladungsmail aus? (K-32, 25.09.2026)

**Kurz: nein — nicht durch diese Schnittstelle.** Vier Belege, alle lesend am Live-Schema und am Event `FUTURE LEADER SUMMIT 2027` erhoben:

1. **Die Mutation hat keinen Schalter dafür.** `importEventPeople` nimmt genau drei Argumente: `eventId`, `data`, `validateOnly`. Es gibt kein `sendInvitation`, kein `notify`, kein `silent`.
2. **Die ganze Event-Admin-API kennt keine Mutation, die etwas verschickt.** Durchsucht nach `send`, `mail`, `code`, `campaign`, `notif`: übrig bleiben `createPushNotification` (App-Mitteilung, kein Versand an Nichtnutzer) und die Registrierungscodes (`createCode`, `updateCode`, `deleteCodes`, `accessCodesScan`). Einladungen werden in Swapcard **aus dem Backend** verschickt, nicht über diese API.
3. **Unser Export legt ausdrücklich keinen Nutzer an.** `lib/event-app/speakers.ts` schickt im `create`-Zweig `isUser: false`. Swapcard legt damit ein **Profil** an, kein Konto — und ohne Konto gibt es nichts, wozu man einladen könnte.
4. **`EventGroupFeatures.inviteMembers = true` ist kein Gegenbeweis.** Das Feld steht in einer Liste von Fähigkeiten, die *Mitglieder* einer Gruppe haben (`scanBadge`, `qualifyLeads`, `exhibitorCanExport…`): Mitglieder dürfen andere einladen. Es beschreibt nicht, was beim Import passiert. Der Irrtum liegt nahe, deshalb steht er hier.

**Was diese Prüfung nicht ausschließen kann:** eine Automation auf Swapcard-Seite (Kampagne, Regel „neue Person → Mail"), die im Backend konfiguriert ist. Die API zeigt sie nicht. Wer sichergehen will, prüft das im Swapcard-Backend unter den E-Mail-Kampagnen des Events — oder fährt den entscheidenden Versuch: **eine** Wegwerf-Person mit einer Adresse, die wir mitlesen, importieren, eine Stunde warten, danach mit `deleteEventPeople` entfernen. Das legt etwas im Livekonto an und wartet deshalb auf Konrads Freigabe.

**Stand des Events heute:** `totalSpeakers: 0` — es ist noch niemand importiert worden. Was auch immer die Antwort ist, bisher hat niemand Post bekommen.

## Swapcard · Moderationen ohne Speaker-Profil (K-37, 25.09.2026)

**Der Export kann das, mit einer echten Erweiterung — und Swapcard bringt sogar den passenden Begriff mit.**

Heute liest `event_app_speakers` ausschliesslich `speaker_profile`. Eine Moderation durch eine Bühnenleitung steht aber als Zeile in `session_speaker` (`role`, Verweis auf `person`) und braucht **kein** Speaker-Profil — diese Person fiele also aus der Event-App heraus, obwohl sie auf der Bühne steht. Im Testbestand ist noch keine Zeile angelegt (`session_speaker` in der Edition: leer), der Fall ist also vorausschauend, nicht kaputt.

Was Swapcard dafür anbietet:

| | |
|---|---|
| `ImportEventPersonInput.create` | braucht nur `firstName`, `lastName`, `email`, `jobTitle` — kein Profil, kein Konto (`isUser: false`) |
| `actions.isSpeakerOnPlannings` | hängt die Person als Speaker an eine Session (`action`, `planningIds`) |
| `actions.isSpeakerRoleOnPlannings` | dasselbe **mit Rolle**: `planningIds` + `roleId` aus `EventSpeakerRole` (Etiketten je Session und je Profil) |
| `speakersTypes` am Event | u. a. `speaker-pass` und **`crew-pass`** — für Bühnenleitungen der passendere Typ |

Zu klären, bevor das gebaut wird:

* **Welche `session_speaker`-Rollen gehen mit?** Moderation ja; „Host" und stille Mitwirkende sind eine Entscheidung, keine Technikfrage.
* **Einwilligung.** Für Speaker gilt Konrads Regel „kommt automatisch mit der Zusage" (24.09.). Bühnenleitungen sind Externe mit Vertrag — ob dieselbe Regel gilt, entscheidet Konrad.
* **Foto.** Porträts hängen an `speaker_asset.profile_id`, also am Profil. Ohne Profil gibt es kein Bild; entweder bleibt die Kachel ohne Foto, oder die Bilder brauchen einen zweiten Ort.

## Offen

- **Swapcard (EA3):** Slot → Swapcard mit Speaker- und Partner-IDs, Pflichtfelder, Reihenfolge Speaker anlegen → Kennung zurück → Slot. Noch nicht geprüft. Der Export als Datenquelle ist geprüft (siehe oben), der Import nach Swapcard nicht.
- **Speaker-Foto nach Swapcard:** nicht geprüft — Konrads Testprofil hat kein Porträt (`has_photo = false`), der öffentliche Kopierweg blieb deshalb ungenutzt. Konrad lädt im Walkthrough eines hoch, danach nachziehen.
- **Einladungsmail bei `importEventPeople`:** offen (K-32, Standbühnen-Gäste als Speaker). Löst der Import eine Mail an die Person aus? Ergebnis an die Architektur-Session für den Partner-Chat.
- **SevDesk:** Artikelstamm und Belege — Trockenlauf steht (`docs/runbooks/produktabgleich.md`), der erste Echtlauf wartet auf die Inventur.
- **HubSpot:** Produktabgleich gemessen, Lauf wartet auf die Inventur.
