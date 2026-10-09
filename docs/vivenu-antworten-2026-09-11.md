# vivenu · Antworten des Product Experts (11.09.2026) und Nachtrag (06.10.2026)

Quelle: Mail-Thread „Eigene Bestellbestätigung | vivenu“ (Johannes Müller, vivenu, an Konrad; Fragenliste Konrad vom 10.09.). Zusammengefasst von der Architektur-Session am 09.10.2026 für die Bau-Chats; Wortlaut im Postfach. Runbooks: `docs/vivenu-kontingente.md`, Ticket-Ingest (Welle 4).

## Ablauf Bestellbestätigung und Personalisierung (09.09.)
- Im Event unter „Individuell“ eine **Custom Confirmation Page URL** hinterlegen; vivenu leitet nach dem Kauf dorthin weiter und hängt `?transactionId=…` an.
- Mit Transaktions-ID und API-Key: Transaktion (`GET /transactions/{id}`) und Tickets (`GET /transactions/{id}/tickets`) laden; Personalisierung über **Personalize a Ticket** (`POST /tickets/personalize/{id}/{secret}`) mit `firstname`, `lastname` (oder `name`) und `extraFields` (Field-Slugs als Schlüssel).
- **Nachtrag 06.10.:** Die Extrafelder je Tickettyp liefert ein **eigener, öffentlicher Endpunkt** — `GET data fields by reference` (docs.vivenu.dev/datafields#get-all-data-fields-by-reference), filterbar auf den Tickettyp. Damit entfällt die Auswertung über das Event (`ticketExtraFields`, `deleted`, `onlyForCertainTicketTypes`, Bedingungen). → QS-078.
- Alternative: Embedded-Pop-up `showTicketModal`. Entscheidung Konrad 10.09.: eigenes Formular, Modal nur als Rückfall; **offen:** läuft das Modal für einen im Portal eingeloggten Nutzer ohne erneuten vivenu-Login, und lässt sich darüber die Inhaber-E-Mail setzen?

## Antworten auf Konrads acht Fragen (11.09.)
1. **Inhaber-E-Mail:** ohne Ticket-Transfer nicht überschreibbar (gehört zum Kunden). Alternative: ein **Extra-Feld vom Typ E-Mail** für unsere Workflows. Ticket-Secrets dürfen serverseitig gespeichert werden.
2. **Status und Zustellung:** Mit aktivierter Personalisierung oder Extra-Feld bleibt ein Ticket bis zur Vervollständigung in `DETAILSREQUIRED` (kein Ticket verfügbar); künstlich setzbar über `validate ticket`. Im Event unter „Individuell → E-Mail“ den Schalter **„Tickets nicht versenden“** aktivieren; danach gezielt versenden über `send ticket per mail` bzw. `send transaction tickets per mail` — **mit frei vorgebbarer E-Mail-Adresse** (z. B. aus dem Extra-Feld).
3. **Webhooks:** Signatur nach docs.vivenu.dev/webhooks#verify-signature (häufigster Fehler: JSON nicht im Raw-Format gehasht); **bis zu 6 Wiederholungen** (7 Versuche gesamt) mit progressivem Backoff, danach nur manuell; jeder Webhook trägt eine **eindeutige ID** (Idempotenz); für abgeschlossene Personalisierung gibt es nur `ticket.updated` (Status auswerten).
4. **Freitickets:** `create free tickets`; Ticket-Mail standardmäßig ja, abschaltbar mit `"sendMail": false`.
5. **Partner-Shops:** ~100 Undershops automatisiert anlegen ist in Ordnung; Risiko nur bei gleichzeitiger manueller Arbeit im Dashboard (Überschreiben). Eingelöste Coupons: in der Transaktion unter `appliedDiscountInfo` je Item mit `discountId` (= Rabattcode-ID) — speichern; alternativ Berichte/Dashboards.
6. **Add-ons und meta:** Add-ons stehen am Ticket unter `addOns`, an der Transaktion unter `products`. **`meta` muss bei der Checkout-Erstellung am `item` mitgegeben werden**, nicht nur am Checkout — sonst ist es später nur dort lesbar.
7. **Sandbox und Limits:** Dev und Prod verhalten sich exakt gleich. 1.000 Requests/Stunde ist der sichere Anhaltspunkt aus den AGB, die meisten Endpunkte erlauben deutlich mehr; Tipps: Public Endpoints clientseitig aufrufen; bei höherem Bedarf einige hundert Calls/Minute und **Retry bei 429** einbauen.
8. **Kaution für kostenlose Tickettypen:** kein festes Feature, über die API abbildbar; **Erstattungen je nach Zahlungsmethode nur bis ~6 Monate** nach der Transaktion automatisch möglich → diese Tickets höchstens 6 Monate im Voraus verkaufen.

## Was daraus im Portal gilt (Stand 09.10.)
- Inhaber-E-Mail über Extra-Feld (Typ E-Mail), kein Transfer; Versand selbst auslösen („Tickets nicht versenden“ + Send-Ticket mit Adresse aus dem Extra-Feld); `meta` am Item; Freitickets mit `sendMail: false`; Undershops automatisiert (Cron `vivenu-allocations`), Dashboard in Ruhe lassen; Kontingente über `appliedDiscountInfo`/`used_count` (seit 0079 am Undershop + Pass-Typ); Retry bei 429.
- Offen bei vivenu: `showTicketModal` ohne erneuten Login / Inhaber-E-Mail (steht im älteren Antwortentwurf vom 08.10.).
