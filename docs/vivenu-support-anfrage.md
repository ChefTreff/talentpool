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
