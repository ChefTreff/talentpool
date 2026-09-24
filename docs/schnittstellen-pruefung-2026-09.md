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

Zu tun (Konrad): `sh scripts/env-set.sh VIVENU_API_KEY` mit dem Sandbox-Wert. Danach lässt sich die Kette in einem Durchgang belegen: Ausstellen im Admin → Ticket `valid` mit Barcode → QR und Wallet-Link in `/speaker/tickets` → Speaker im Swapcard-Export. Bis dahin ist der Weg gebaut und an der Datenbank geprüft, aber **nicht** an einem echten Ticket.

## Offen

- **Swapcard (EA3):** Slot → Swapcard mit Speaker- und Partner-IDs, Pflichtfelder, Reihenfolge Speaker anlegen → Kennung zurück → Slot. Noch nicht geprüft.
- **SevDesk:** Artikelstamm und Belege — Trockenlauf steht (`docs/runbooks/produktabgleich.md`), der erste Echtlauf wartet auf die Inventur.
- **HubSpot:** Produktabgleich gemessen, Lauf wartet auf die Inventur.
