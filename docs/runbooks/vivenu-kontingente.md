# Runbook Ticket-Kontingente und Secret Shop (Welle 3 A6)

Kontingente entstehen in der Datenbank aus gebuchten Ticket-Produkten (`product.pass_type`: I-32776 partner, I-46500 talent, I-62740 investor). Der Pass-Typ der Talente-Tickets folgt der Wahl im Onboarding (`pass_type_choice`), sonst dem Org-Typ (Startup ⇒ `startup`, sonst `talent`). Jedes Kontingent startet als `pending_vivenu`; die Route `/api/cron/vivenu-allocations` legt Undershop und Coupon in vivenu an und setzt `active`. Partner sehen Code und Link erst dann (`my_ticket_allocations`). Code: `lib/vivenu/*`, Migration 0049, Test `supabase/tests/v3_ticket_allocations.sql`.

## Einrichtung
1. **vivenu-Zugang:** `VIVENU_API_KEY` (erst Sandbox, `VIVENU_SANDBOX=true` ⇒ `vivenu.dev`; Produktion `VIVENU_SANDBOX=false`) in Vercel. Ohne Key läuft die Route im Trockenlauf, nichts verändert sich.
2. **Event der Edition:** Als Partner-Team `select set_edition_vivenu('<edition_id>', '<vivenu event id>');`. Ohne Eintrag verarbeitet die Route nichts.
3. **Ticket-Typen:** `ticket_type_map` je Edition füllen (`vivenu_ticket_type_id`, `pass_type` partner/talent/startup/investor, `active`). Ohne passenden Typ meldet die Route `keine Tickettypen für Pass-Typ …` und setzt das Kontingent auf `error`. Vorschlag und Abgleich: `node --env-file=.env.local scripts/vivenu-sandbox-lauf.mjs typen [--apply]` — liest die Tickettypen des Events, rät den Pass-Typ aus dem Namen, zieht Namen nach und entfernt Zeilen zu gelöschten Typen.
4. **Ticketshop-Adresse:** `VIVENU_SHOP_BASE` (z. B. `https://cheftreff-idbu.vivenushop.dev`). Steht **nur im Dashboard** — weder das Event noch `/sellers/me` nennen sie. Fehlt sie, bleibt der Undershop-Link leer statt falsch.

## Feldnamen (Sandbox-Lauf 12.09.2026, gegen `/api/openapi.json` und echte Antworten geprüft)

| Sache | Richtig | Vorher angenommen |
| --- | --- | --- |
| Coupon anlegen | `POST /api/coupon` | `POST /api/coupons` ⇒ 404 |
| Coupon ändern | `PUT /api/coupon/{id}` — **ersetzt**, `name` ist Pflicht | `POST /api/coupons/{id}` |
| Coupons lesen | `GET /api/coupon/rich` | `GET /api/coupons` |
| Rabatt | flach: `discountType: "var"`, `discountValue: 1` (= 100 %) | `discount: { type, value }`; `value: 100` ergibt −10000 % |
| Coupon-Grenzen | `allowAllEvents: false` + `allowedEvents`, `allowAllTickets: false` + `allowedTickets`, `maxUsage` (Vorgabe **1**!) | nur `allowedTickets`, kein `maxUsage` |
| Coupon-Freischaltung | `unlocks: [{ target: "underShop", eventId, underShopId }]` | ohne `target` |
| Undershop-Tickettyp | `tickets[].baseTicket` (Typ am Event); `_id` ist die **eigene** Zeilen-Id | `ticketTypeId`, dann `_id` |
| Undershop-Kontingent | `maxAmount` **und** `maxAmountPerOrder` nötig (`inventoryStrategy: "independent"`) | nichts gesetzt ⇒ nichts in den Warenkorb |
| Undershop-Verkaufsfenster | `sellStart`/`sellEnd` nötig | nichts gesetzt ⇒ `POST /checkout` „Shop is not on sale" |
| Fremde Tickettypen | nur eine ausdrücklich **inaktive** Zeile blendet sie aus (`availabilityMode: "contingentsOnly"` hilft nicht) | Undershop zeigt sonst alle Typen des Events |
| Undershop-Link | `<VIVENU_SHOP_BASE>/event/<eventId>/<underShopId>` | `https://vivenu.dev/e/<eventId>/<id>` |
| Tickets lesen | `GET /api/tickets?event=<id>&updatedAt[$gt]=<iso>` | `?eventId=`, `?modifiedSince=` ⇒ 400 |
| Freiticket | `POST /api/tickets/free`, Positionen in `items[]`, Vorname `prename` | `POST /api/tickets/create-free-tickets`, `tickets[]`, `firstname` |
| Storno | `POST /api/tickets/{id}/invalidate` ⇒ Status `INVALID` | richtig |
| Personalisierung | `POST /api/tickets/personalize/{id}/{secret}` | richtig |
| Webhook-Signatur | `x-vivenu-signature`, HMAC-SHA256 über den Raw-Body, **hex**, ohne Präfix; Geheimnis = `hmacKey` aus `GET /api/webhooks` | hex **oder** base64 zugelassen |
| Einlösung | `appliedDiscountInfo` ist ein **Objekt** an der **Transaktion** (`.discounts[].discountId`), nicht ein Array am Ticket | `appliedDiscountInfo[0].discountId` am Ticket |
| Personalisierung im Webhook | `personalized: true` — **kein** `personalizationStatus` | `personalizationStatus` |
| Ticket-Status | nur `VALID`, `INVALID`, `RESERVED`, `DETAILSREQUIRED`, `BLANK` | zusätzlich CANCELLED/REFUNDED/CHECKEDIN angenommen |

`used_count` hängt seit Migration 0079 am **Undershop + Pass-Typ** des Tickets, nicht am Coupon: je Partner und Edition gibt es genau einen Undershop, und der Schlüssel hält auch, wenn jemand den Coupon im Dashboard tauscht. Der Coupon bleibt der zweite Weg (Freitickets, POS).

## Ablauf
- Trigger auf `org_product` und `org_edition.pass_type_choice` halten `org_ticket_allocation` aktuell: Menge folgt der Buchung; ein Kontingent ohne Produkt verschwindet (solange `pending_vivenu`) oder wird `disabled` (Route schaltet den Coupon ab); eine Mengenänderung an einem aktiven Kontingent setzt `synced_at` zurück (Route aktualisiert `maxTickets`).
- Route alle 30 Minuten (`CRON_SECRET`), `?allocation=<id>` für ein einzelnes Kontingent. Je vivenu-Event ein Lesen, je Partner ein Undershop „`FLS27 · <Name>`“ mit allen Pass-Typen der Org (Preis 0, Freischaltung per Coupon), je Kontingent ein Coupon (100 %, `maxTickets` = Menge, `allowedTickets` = Tickettypen des Pass-Typs, `unlocks` auf den Undershop). Coupon-Code `FLS27-<ORG>-<PASS>-<6 Hex>`.
- **Geformt wird der Shop aus allen Kontingenten der Org** (`ticket_allocations_of_orgs`), nicht nur aus den offenen. Sonst räumt ein Lauf, der nur eine einzelne offene Zeile sieht, den Shop leer — am 12.09. genau so passiert und mit 0079 behoben.
- Fehler landen am Kontingent (`status = error`, `last_error`) und in `integration.sync_error`; der nächste Lauf versucht es erneut.
- „Mehr Tickets“: `request_ticket_increase` legt eine Anfrage in `shop_request` an und informiert `area_lead_partner` (Mail `shop_request_received`). Kein Mail-Fallback für Partner.

## Team
- `ticket_allocations_admin(edition?)`: alle Kontingente mit Status, Fehler, vivenu-IDs.
- `set_ticket_allocation(id, quantity?, coupon_code?, undershop_url?, status?, notes?)`: manuelle Korrektur mit Audit; eine geänderte Menge bei vorhandenem Coupon wird beim nächsten Lauf nach vivenu geschrieben.
- Genutzte Tickets (`used_count`) füllt der vivenu-Ingest (`ingest_vivenu_ticket`, Sweep `/api/cron/vivenu-tickets`). Gezählt wird, was einen Platz belegt: `valid`, `approved`, `checked_in`, `blocked`. Storno und Erstattung geben ihn frei.

## Antworten vivenu (11.09.2026) — bestätigt und ergänzt
- ~100 Undershops am Event sind unproblematisch; **während der Sync läuft keine manuellen Undershop-Änderungen im Dashboard** (PUT überschreibt das Array).
- Einlösungen zählen: ~~`appliedDiscountInfo[].discountId` aus Transaktionen~~ — im Sandbox-Lauf überholt, siehe Tabelle oben. Der Schlüssel ist `ticket.underShopId` + Pass-Typ.
- Dev (`vivenu.dev`) und Prod verhalten sich identisch; Rate-Limit praktisch höher als 1.000/h, bei 429 mit Backoff wiederholen (Folgeaufgabe im Client).
- Webhooks: Raw-Body signieren, Webhook-ID für Idempotenz, 7 Versuche mit Backoff; Personalisierung kommt als `ticket.updated`.

