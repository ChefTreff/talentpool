# Support-Anfrage an vivenu — Ticket-Personalisierung über eigenes Portal (Entwurf)

**Betreff:** API-Fragen zur Personalisierung im eigenen Portal, Webhooks, Undershops — ChefTreff / FLS27

Hallo vivenu-Team,

wir (ChefTreff, Hamburg) bereiten den **Future Leader Summit 2027** (16.–17.04.2027) und den **AI Hackathon** (15.–16.04.2027) vor, zusammen rund 12.500 Tickets. Wir bauen ein eigenes Teilnehmer-Portal (Supabase/Next.js) und möchten die **Ticket-Personalisierung dort abbilden**: Kauf und Zahlung bleiben in vivenu, per Webhook legen wir den Inhaber bei uns an, der Inhaber vervollständigt seine Daten in unserem Portal, und wir schreiben die Pflichtangaben zurück. vivenu soll dabei nur noch Minimaldaten (Vorname, Nachname, E-Mail) halten. Dazu acht konkrete Fragen:

1. **Personalisierungs-Endpoint** `POST /api/tickets/personalize/{id}/{secret}` — ist `email` als Body-Feld zulässig (in der Doku stehen nur `name/firstname/lastname/extraFields`)? Falls nicht: Wie setzen bzw. ändern wir die **Inhaber-E-Mail** serverseitig, ohne einen Ticket-Transfer (neue Ticket-IDs) auszulösen?
2. **Serverseitiger Aufruf:** Kann der Personalize-Endpoint (oder ein Admin-Endpoint) mit dem **Seller-API-Key ohne Ticket-Secret** aufgerufen werden? `PUT /api/tickets/{id}` akzeptiert laut Doku nur `barcode`, `extraFields`, `meta`.
3. **Webhooks:** Wie ist das **Retry-Verhalten** (Anzahl, Backoff, Zeitfenster) bei Nicht-2xx? Wie wird `x-vivenu-signature` berechnet (HMAC-Algorithmus, Payload-Basis)? Gibt es ein Event für abgeschlossene Personalisierung, oder nur `ticket.updated`? Liefert jeder Webhook eine **Idempotenz-/Event-ID**?
4. **Personalisierungs-Status steuern:** Können Tickets per API bewusst im Status `DETAILSREQUIRED` bleiben (kein PDF/Wallet), bis unser Portal die Daten geschrieben hat? Sind `repersonalizationAllowed`, Deadline, Limit und Fee je Ticket-Typ per API steuerbar?
5. **Undershops per API:** Können wir je Partner automatisiert einen **Undershop** (Secret Shop) mit zugeordneten Ticket-Typ-Kontingenten anlegen und per Coupon freischalten — oder ist das nur über die UI möglich? Gibt es einen Bulk-Weg für ~100 Partner?
6. **Add-ons/Produkte:** Sind Add-ons (z. B. Unterkunft, Bahnticket, Bundles) per API auslesbar, inklusive Zuordnung Add-on ↔ Ticket ↔ Transaktion?
7. **Checkout-`meta`:** Wird `meta` aus dem serverseitigen Checkout zuverlässig auf die erzeugten Tickets propagiert (wir nutzen es als Join-Key)?
8. **Limits & Sandbox:** Gelten 1.000 Requests/h pro Token? Ist die Sandbox (`vivenu.dev`) funktional identisch zur Produktion (Webhooks, Undershops, Coupons)?

9. **Deposit für Freitickets:** Lässt sich für kostenlose Ticket-Typen eine Kaution (z. B. 20 €) erheben, die nach Check-in (Scan) automatisch oder per API zurückgebucht wird?

Vielen Dank — gern auch ein kurzer Call, falls einfacher.

Beste Grüße
Konrad Gruner · ChefTreff

---
**Nachtrag nach Call 08.09.** (Ansatz „externe Confirmation Page + Personalisierung bei uns" ist validiert; ihr schickt die Doku „Transaktionsbestätigungsseite austauschen" + Endpunktliste). Damit reduzieren sich die Fragen auf:
- Q1–Q3, Q5–Q9 wie oben (Personalize-Body/E-Mail, Server-Key, Webhook-Retry/Signatur, Undershops per API, Add-ons per API, `meta`, Limits, Deposit).
10. **Ticket-Zustellung bei abweichender E-Mail:** Wenn die personalisierende Person eine andere E-Mail als der Käufer hat — versendet vivenu dann eine Ticket-Mail an diese Adresse, oder sollen wir die Zustellung komplett übernehmen (Barcode/PDF per API abrufen)?
11. **Einlass:** Welche Scan-Lösung empfehlt ihr für ~10.000 Personen an zwei Tagen (vivenu-Scanner-App vs. CoreGo/Fastlane), und wie fließen Scans (`scan.created`) zuverlässig zu uns zurück?

## Nachtrag 10.09.2026 — Frage 5 (Undershops per API) durch eigene Prüfung beantwortet
Dev-Dashboard (Seller ChefTreff, `dashboard.vivenu.dev`) und API-Doku (`docs.vivenu.dev/events`, `/coupons`): Undershops liegen als `underShops[]` im Event-Objekt (`_id`, `name`, `active`, `tickets[]` mit Tickettyp-ID und eigenem `price`, `customCharges`, `unlockMode` `none|couponCode`, Header-Texte) und sind in den Payloads von „Create an Event" und „Update an Event" enthalten ⇒ Anlegen/Ändern über `PUT /api/events/{id}`. Coupons schalten sie frei: `unlocks[]` mit `eventId` + `underShopId` (Dashboard: „Zugangsbeschränkung → Geheime Shops freischalten", nicht kombinierbar mit „Minimale Ticketanzahl"); dazu `maxUsage`, `maxTickets`, `allowedTickets`, Kunden-Zuweisung, Tagging. Die Dev-Umgebung hat noch kein Event — für den Sandbox-Test in Welle 3 legen wir eins an. Support-Frage 5 damit erledigt; offen bleiben 1–4 und 6–10.

## Antwort vivenu (Johannes, nach dem Call 08.09.) — Stand 10.09.2026
- **Eigene Bestätigungsseite:** im Event unter „Individuell" eine *Custom Confirmation Page URL* hinterlegen; vivenu leitet nach dem Kauf dorthin um und hängt **`?transactionId=<id>`** an (nicht `tx` — Welle 1 B4 muss diesen Parameter lesen).
- Mit Transaktions-ID + API-Key: `GET /api/transactions/{id}` (Transaktion mit allen Daten) und `GET /api/transactions/{id}/tickets` (alle Tickets der Transaktion, inkl. Secrets für die Personalisierung).
- **Personalisierung aus unserem Portal:** `POST /api/tickets/personalize/{id}/{secret}` (Doku `tickets#personalize-a-ticket`). Zusatzfelder liegen im Event (`ticketExtraFields`): je Ticket `eventId`/`ticketTypeId` lesen → Event laden → Felder filtern (`deleted: true` raus; bei `onlyForCertainTicketTypes` muss `ticketTypeId` in `allowedTicketTypes` liegen; Bedingungen gegen bereits gesetzte Werte auswerten) → Body `extraFields` mit den Field-Slugs plus `firstname`/`lastname` (oder `name`).
- **Alternative von vivenu:** Embedded Pop-up `showTicketModal` (Embed.JS) öffnet das vivenu-Ticket-Modal mit allen Funktionen — spart die Extra-Feld-Logik, Personalisierung liefe dann in vivenus Oberfläche.
- **Offen geblieben:** Inhaber-E-Mail per Personalisierung setzen (Ticket „für andere Person"), Status `DETAILSREQUIRED` halten, Ticket-Mail bei abweichender Adresse, Webhook-Signatur/Retry/Event-ID, Freitickets per API, Undershops in Serie, Add-ons, `meta`, Sandbox-Parität, Kaution, Einlass. → Sammelmail (unten).

## Sammelmail 10.09.2026 (Antwort an Johannes, alle offenen Punkte in einer Mail)
Siehe Chat-Protokoll / Postausgang Konrad; Struktur: Rückmeldung zur Bestätigungsseite (wir bauen eigenes Formular, Modal als Rückfalloption), dann 10 Punkte: Personalisierung (E-Mail, Secret/Server-Key, DETAILSREQUIRED, Ticket-Mail) · Webhooks (Signatur, Retry, Event-ID, Personalisierungs-Event) · Freitickets per API · Undershops/Coupons in Serie · Add-ons + `meta` · Sandbox/Limits · Kaution · Einlass/Scans · Modal-Fragen (E-Mail setzbar? SSO im eingeloggten Portal?).

## Antworten von vivenu (11.09.2026, über Konrad) und was daraus folgt

| Frage | Antwort vivenu | Konsequenz für uns |
|---|---|---|
| Inhaber-E-Mail ohne Transfer ändern | Nicht möglich, die E-Mail gehört zum Kunden. Alternative: **Extra-Feld vom Typ E-Mail** am Ticket. Ticket-Secrets aus `GET /api/transactions/{id}/tickets` dürfen serverseitig gespeichert werden. | Bestätigungsseite (Welle 1 A7b): „Ticket für eine andere Person“ ⇒ E-Mail in ein Extra-Feld schreiben, unsere `ticket.holder_email` ist die Wahrheit; kein Transfer. Ticket-Secrets in `ticket` speichern (Spalten-Grant nur service_role). |
| Status/Zustellung | Mit aktivierter Personalisierung oder Extra-Feld bleibt das Ticket bis zur Vervollständigung **DETAILSREQUIRED** (kein PDF, kein Wallet); künstlich setzbar über den Validate-Endpoint. Ticket-Mail lässt sich je Event abschalten („Tickets nicht versenden“, Reiter E-Mail unter Individuell); danach Versand je Ticket oder je Transaktion per API **mit frei wählbarer E-Mail**. | Zustellung übernehmen wir: Schalter im Event setzen (Konrad), nach Personalisierung im Portal `send ticket per mail` an die Inhaber-E-Mail aus dem Extra-Feld. Runbook-Schritt für die Event-Einrichtung. |
| Webhooks | Signatur laut Doku `webhooks#verify-signature` — **Raw-Body hashen, nicht den geparsten JSON-String**. Bis zu 6 Wiederholungen (7 Versuche gesamt) mit progressivem Backoff, danach nur manuell. Jeder Webhook hat eine eindeutige **ID** für Idempotenz. Personalisierung nur über `ticket.updated` (Status prüfen). | Route `/api/webhooks/vivenu`: Raw-Body vor dem Parsen prüfen, Webhook-ID in `integration.webhook_event` (idempotent), auf `ticket.updated` den Status auswerten. Manuelle Nachverarbeitung über Sweep wie bei HubSpot. |
| Freitickets per API | `POST tickets#create-free-tickets`; Ticket-Mail wird normal versendet, **`sendMail: false`** schaltet sie ab. | Speaker-Pass und Begleitticket (Welle 2 A7) über diesen Endpunkt mit vorbelegtem Namen/E-Mail, `sendMail: false`, Versand durch uns. Volunteer-Ticket: **Coupon bleibt** (Entscheidung E2: Einlösen als Aktivierungsschritt). |
| Partner-Shops (~100 Undershops) | Nichts spricht dagegen; Risiko nur bei gleichzeitigen manuellen Änderungen im Dashboard (Überschreiben). Einlösungen zählen: Transaktionen lesen, `appliedDiscountInfo[].discountId` = Coupon-ID je rabattiertem Item; alternativ Berichte. | A6 bestätigt. `used_count` je Kontingent aus dem Transaktions-Ingest über `appliedDiscountInfo.discountId` = `org_ticket_allocation.vivenu_coupon_id`. Regel: während der Sync läuft, keine manuellen Undershop-Änderungen im Dashboard (Runbook). |
| Add-ons und `meta` | Add-ons am Ticket unter `addOns`, an der Transaktion unter `products`. `meta` muss beim Checkout **am Item** hängen, nicht nur am Checkout, sonst ist es später nur dort lesbar. | Ingest liest `addOns` (Hotel, Bahn, Locker) je Ticket; serverseitiger Checkout setzt `meta` je Item (Join-Key `person_id`/`ticket_request_id`). |
| Sandbox und Limits | Dev und Prod verhalten sich identisch. 1.000 Requests/Stunde ist der AGB-Anhaltspunkt, die meisten Endpunkte erlauben mehr; bei Bedarf einige hundert pro Minute freischalten lassen; **Retry bei 429** einbauen; Public Endpoints möglichst clientseitig. | Sandbox-Lauf für A6 ist aussagekräftig. `lib/vivenu/client.ts` bekommt Retry mit Backoff bei 429 (Folgeaufgabe). |
| Kaution für Freitickets | Kein Feature; über die API abbildbar (Transaktion + Erstattung), Erstattung je Zahlungsart nur ~6 Monate automatisch möglich. | Nur sinnvoll, wenn Kautions-Tickets frühestens 6 Monate vor dem Summit verkauft werden (ab 16.10.2026). Entscheidung Konrad, ob Kaution überhaupt; sonst entfällt. |
