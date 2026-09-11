# Runbook Ticket-Kontingente und Secret Shop (Welle 3 A6)

Kontingente entstehen in der Datenbank aus gebuchten Ticket-Produkten (`product.pass_type`: I-32776 partner, I-46500 talent, I-62740 investor). Der Pass-Typ der Talente-Tickets folgt der Wahl im Onboarding (`pass_type_choice`), sonst dem Org-Typ (Startup ⇒ `startup`, sonst `talent`). Jedes Kontingent startet als `pending_vivenu`; die Route `/api/cron/vivenu-allocations` legt Undershop und Coupon in vivenu an und setzt `active`. Partner sehen Code und Link erst dann (`my_ticket_allocations`). Code: `lib/vivenu/*`, Migration 0049, Test `supabase/tests/v3_ticket_allocations.sql`.

## Einrichtung
1. **vivenu-Zugang:** `VIVENU_API_KEY` (erst Sandbox, `VIVENU_SANDBOX=true` ⇒ `vivenu.dev`; Produktion `VIVENU_SANDBOX=false`) in Vercel. Ohne Key läuft die Route im Trockenlauf, nichts verändert sich.
2. **Event der Edition:** Als Partner-Team `select set_edition_vivenu('<edition_id>', '<vivenu event id>');`. Ohne Eintrag verarbeitet die Route nichts.
3. **Ticket-Typen:** `ticket_type_map` je Edition füllen (`vivenu_ticket_type_id`, `pass_type` partner/talent/startup/investor, `active`). Ohne passenden Typ meldet die Route `keine Tickettypen für Pass-Typ …` und setzt das Kontingent auf `error`.
4. **Erster Sandbox-Lauf mit Dev-Event — Pflicht vor der Produktion:** Die Feldnamen für Undershops (`underShops[].tickets[].ticketTypeId/price`, `unlockMode`) und Coupons (`discount`, `maxTickets`, `allowedTickets`, `unlocks`) stammen aus der API-Doku und dem Dev-Dashboard (`docs/vivenu-support-anfrage.md`), nicht aus echten Antworten. Ebenso der Undershop-Link (`<shop>/e/<eventId>/<underShopId>`), sofern vivenu keinen `shopUrl`/`url` liefert. Abweichungen in `lib/vivenu/client.ts` und `lib/vivenu/allocations.ts` nachziehen; das Team kann Link und Code jederzeit über `set_ticket_allocation` überschreiben.

## Ablauf
- Trigger auf `org_product` und `org_edition.pass_type_choice` halten `org_ticket_allocation` aktuell: Menge folgt der Buchung; ein Kontingent ohne Produkt verschwindet (solange `pending_vivenu`) oder wird `disabled` (Route schaltet den Coupon ab); eine Mengenänderung an einem aktiven Kontingent setzt `synced_at` zurück (Route aktualisiert `maxTickets`).
- Route alle 30 Minuten (`CRON_SECRET`), `?allocation=<id>` für ein einzelnes Kontingent. Je vivenu-Event ein Lesen, je Partner ein Undershop „`FLS27 · <Name>`“ mit allen Pass-Typen der Org (Preis 0, Freischaltung per Coupon), je Kontingent ein Coupon (100 %, `maxTickets` = Menge, `allowedTickets` = Tickettypen des Pass-Typs, `unlocks` auf den Undershop). Coupon-Code `FLS27-<ORG>-<PASS>-<6 Hex>`.
- Fehler landen am Kontingent (`status = error`, `last_error`) und in `integration.sync_error`; der nächste Lauf versucht es erneut.
- „Mehr Tickets“: `request_ticket_increase` legt eine Anfrage in `shop_request` an und informiert `area_lead_partner` (Mail `shop_request_received`). Kein Mail-Fallback für Partner.

## Team
- `ticket_allocations_admin(edition?)`: alle Kontingente mit Status, Fehler, vivenu-IDs.
- `set_ticket_allocation(id, quantity?, coupon_code?, undershop_url?, status?, notes?)`: manuelle Korrektur mit Audit; eine geänderte Menge bei vorhandenem Coupon wird beim nächsten Lauf nach vivenu geschrieben.
- Genutzte Tickets (`used_count`) füllt der vivenu-Ingest aus Welle 1 (A7b), sobald er läuft.

## Antworten vivenu (11.09.2026) — bestätigt und ergänzt
- ~100 Undershops am Event sind unproblematisch; **während der Sync läuft keine manuellen Undershop-Änderungen im Dashboard** (PUT überschreibt das Array).
- Einlösungen zählen: Transaktionen lesen, `appliedDiscountInfo[].discountId` = unsere `vivenu_coupon_id` ⇒ `used_count` (Ticket-Ingest A7b).
- Dev (`vivenu.dev`) und Prod verhalten sich identisch; Rate-Limit praktisch höher als 1.000/h, bei 429 mit Backoff wiederholen (Folgeaufgabe im Client).
- Webhooks: Raw-Body signieren, Webhook-ID für Idempotenz, 7 Versuche mit Backoff; Personalisierung kommt als `ticket.updated`.

