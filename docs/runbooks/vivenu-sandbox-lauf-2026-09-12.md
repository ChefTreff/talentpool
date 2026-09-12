# vivenu-Sandbox-Lauf, 12.09.2026 — Befunde

Lauf gegen `vivenu.dev`, Dev-Event `6aa450d647fa1075ce6c7c74` („DEV Future Leader Summit 2027"), Seller `6a72ec8d33ceafcb2e8bcf2d`.

**Ergebnis in einem Satz:** die Undershop-Hälfte funktioniert nach einer Korrektur, die Coupon-Hälfte **nicht** — den Endpunkt, auf dem unser Entwurf beruht, gibt es auf dieser API nicht.

## 1 · Welche Endpunkte es wirklich gibt

Geprüft mit GET, `404` heisst „gibt es nicht":

| Pfad | Status | Hülle |
|---|---|---|
| `/events` | 200 | `{rows, total}` |
| `/tickets` | 200 | `{rows, total}` |
| `/transactions` | 200 | `{docs, total}` |
| `/vouchers` | 200 | `{docs, total}` |
| `/access-lists` | 200 | `{docs, total}` |
| `/coupons`, `/coupon`, `/discounts`, `/discount`, `/discountGroups`, `/discount-groups`, `/promocodes`, `/promotions`, `/ticket-discounts`, `/events/{id}/coupons` | **404** | — |
| `/sellers` | 401 | (Schlüssel darf das nicht) |

Die Paginierungs-Hülle ist **nicht einheitlich**: `rows` bei Events und Tickets, `docs` bei Transaktionen, Vouchern und Access-Lists. `listTickets()` liest beide.

## 2 · Der Coupon-Entwurf trägt nicht

`lib/vivenu/allocations.ts` legt je Kontingent einen Coupon über `POST /coupons` an. Das ergibt **404**. Der Kontingent-Sync scheiterte an genau dieser Stelle fünfmal:

```
vivenu 404 /coupons: {"statusCode":404,"error":"Not Found","message":"Not Found"}
```

Zwei Kandidaten, beide passen nur halb:

- **`/vouchers`** verlangt `amount` — das ist ein Guthaben in Geld, kein Freischaltcode.
- **`/access-lists`** ist der Mechanismus, der zu `unlockMode: "accessList"` gehört und funktioniert:
  - `POST /access-lists {name}` → `al_…` (Feld `type` kommt als `static` zurück)
  - `POST /access-lists/{id}/entries {externalCode}` → `ale_…`
  - Verknüpfung zum Undershop läuft über `event.accessListMapping` — **Form noch unbekannt**: `{accessListId, underShopId}` wird mit 200 angenommen, aber als `{}` gespeichert, die Feldnamen stimmen also nicht.

**Das ist eine Entwurfsfrage, keine Codefrage** — siehe unten.

## 3 · Undershop-Tickets: `_id`, nicht `ticketTypeId` (korrigiert)

Sechs Feldnamen im selben Event gegeneinander geprüft:

| gesendet | zurück |
|---|---|
| `{_id: <typId>}` | `_id` bleibt `<typId>` ✅ |
| `{name, _id: <typId>}` | bleibt ✅ |
| `{ticketId}` · `{ticketTypeId}` · `{baseTicketId}` · `{refId}` | vivenu vergibt eine **neue** Id ❌ |

Unser Code schickte `ticketTypeId`. Die beiden Undershops, die der Sync vorher angelegt hat, enthalten deshalb Ticketzeilen ohne Bezug — ein Partner hätte einen **leeren Shop** gesehen. In `lib/vivenu/client.ts` und `lib/vivenu/allocations.ts` auf `_id` umgestellt.

## 4 · Undershops liefern keinen Link

Felder eines Undershops: `_id, active, availabilityMode, categories, customCharges, customerSegments, customerTags, extraFields, inventoryStrategy, minAmountPerOrder, name, pricingSettings, reservationSettings, salesChannelGroupSettings, seatingContingents, tickets, timeSlots, unlockMode`.

**Weder `url` noch `shopUrl`.** `undershopUrl()` fällt also immer auf den geratenen Link zurück. Drei Kandidaten geprüft, alle **404**:

```
https://vivenu.dev/<event.url>?shop=<shopId>
https://vivenu.dev/e/<eventId>/<shopId>
https://vivenu.dev/<event.url>/<shopId>
```

Auch die Event-Seite selbst (`https://vivenu.dev/dev-future-leader-summit-2027-8q962p`) antwortet mit 404 — das Dev-Event ist vermutlich noch nicht veröffentlicht. Der Shop-Link lässt sich erst bestimmen, wenn das Event öffentlich ist.

## 5 · Felder eines Tickettyps

`_id, active, addOns, conditionalAvailability, conditionalAvailabilityMode, entryPermissions, expirationSettings, ignoreForMaxAmounts, ignoredForStartingPrice, minAmountPerOrder, minAmountPerOrderRule, name, posActive, price, rules, styleOptions, tracking, transferSettings`

Bemerkenswert: **`addOns` hängt am Tickettyp**, nicht nur am gekauften Ticket — für Hotel und Bahn (A6) der Ort, an dem sie definiert werden.

## 6 · Was im Dev-Event jetzt liegt

Alles mit `ZZTEST` gekennzeichnet, nichts von Konrad angefasst:

- vier Tickettypen `ZZTEST Partner|Talent|Startup|Investor` (das Event hatte **keine**, ohne sie läuft kein Schritt)
- ein Undershop `ZZTEST Undershop Partner` (`unlockMode: accessList`)
- eine Access-List `ZZTEST Zugangsliste` mit einem Eintrag `ZZTEST-PARTNER-001`
- `ticket_type_map` in unserer Datenbank: vier Zeilen auf diese Typen

Die Probe-Undershops (`ZZTEST Probe …`) und der Müll-Eintrag in `accessListMapping` sind wieder entfernt.

Die ZZTEST-Objekte bleiben vorerst stehen: ohne sie beginnt jeder weitere Lauf bei null. Wenn der Lauf abgeschlossen ist, entfernt sie
`node --env-file=.env.local <scratch>/vv-types.mjs down` und das Gegenstück für Undershop und Access-List.

## 7 · Noch nicht gelaufen

Schritte 3 und 4 des Auftrags (Test-Transaktion mit Webhook-Eingang, Signaturformat festlegen, Personalisierung als `ticket.updated`, Einlösung gegen `used_count`; Freiticht anlegen und stornieren) hängen daran, dass der Shop erreichbar ist und die Freischaltung steht.

Was ohne vivenu schon belegt ist: die ausgelieferte Webhook-Route weist ohne Signatur und mit falscher Signatur je 401 ab und nimmt eine gültige **Hex**-Signatur an (`{"ok":true,"status":"ignored"}`). Welche Kodierung vivenu selbst schickt, zeigt erst der erste echte Webhook.
