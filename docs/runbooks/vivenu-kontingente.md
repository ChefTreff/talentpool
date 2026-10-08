# Runbook Ticket-Kontingente und Secret Shop (Welle 3 A6)

Kontingente entstehen in der Datenbank aus gebuchten Ticket-Produkten (`product.pass_type`: I-32776 partner, I-46500 talent, I-62740 investor). Der Pass-Typ der Talente-Tickets folgt der Wahl im Onboarding (`pass_type_choice`), sonst dem Org-Typ (Startup ⇒ `startup`, sonst `talent`). Jedes Kontingent startet als `pending_vivenu`; die Route `/api/cron/vivenu-allocations` legt Undershop und Coupon in vivenu an und setzt `active`. Partner sehen Code und Link erst dann (`my_ticket_allocations`). Code: `lib/vivenu/*`, Migration 0049, Test `supabase/tests/v3_ticket_allocations.sql`. **Seit PART-111 gibt es einen Coupon je Gruppe, nicht je Kontingent** — siehe „Ein Code je Gruppe“ weiter unten.

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

Der Sync schliesst dabei **nur Typen ohne Zeile**. Wer im Dashboard eine Zeile aktiviert, behält sie — der Lauf macht die Tür zu, die niemand bedacht hat, nicht die, die jemand absichtlich geöffnet hat (Entscheidung Konrad, 13.09.2026).
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
- Route alle 30 Minuten (`CRON_SECRET`), `?allocation=<id>` für ein einzelnes Kontingent (bearbeitet die Gruppe dieser Zeile). Je vivenu-Event ein Lesen, je Partner ein Undershop „`FLS27 · <Name>`“ mit allen Pass-Typen der Org (Preis 0, Freischaltung per Coupon), je **Gruppe** ein Coupon (siehe unten). Coupon-Code `FLS27-<ORG>-<6 Hex>`, bei 50 % `FLS27-<ORG>-50-<6 Hex>`; Codes aus der Zeit je Kategorie (`FLS27-<ORG>-PART-…`) bleiben gültig.
- **Geformt wird der Shop aus allen Kontingenten der Org** (`ticket_allocations_of_orgs`), nicht nur aus den offenen. Sonst räumt ein Lauf, der nur eine einzelne offene Zeile sieht, den Shop leer — am 12.09. genau so passiert und mit 0079 behoben.
- Fehler landen am Kontingent (`status = error`, `last_error`) und in `integration.sync_error`; der nächste Lauf versucht es erneut.
- „Mehr Tickets“: `request_ticket_increase` legt eine Anfrage in `shop_request` an und informiert `area_lead_partner` (Mail `shop_request_received`). Kein Mail-Fallback für Partner.

## Ein Code je Gruppe (PART-111, Konrad 05.10.: „nur ein Code“)

Eine **Gruppe** sind alle Kontingente einer Organisation und Edition mit derselben Rabattstufe (100 % aus den Produkten, 50 % von Hand). Sie bekommt **einen** Coupon:

| Feld | Wert |
| --- | --- |
| `allowedTickets` | Vereinigung der Tickettypen aller aktiven Kategorien der Gruppe |
| `maxTickets`, `maxUsage` | Summe der Mengen |
| `unlocks` | der Undershop der Organisation |
| Code und Coupon-Id | auf **allen** Zeilen der Gruppe (`coupon_code`, `vivenu_coupon_id`) |

Die **Menge je Kategorie** hält der Undershop, nicht der Coupon: seine Zeilen tragen `amount` je Tickettyp (Summe der Kontingente, `inventoryStrategy: independent`). `used_count` hängt weiter am Undershop und Pass-Typ des Tickets (0079). Mit einem Code **wählt die einlösende Person die Kategorie im Shop selbst** (Konrad K-77): die Trennung „Partner-Code ans Standpersonal, Talent-Code an Studierende“ gibt es nicht mehr, die Obergrenzen je Kategorie bleiben. 50-%-Kontingente bleiben eine eigene Gruppe mit eigenem Code, weil ein Coupon nur einen Rabattwert hat.

**Probe vom 08.10.2026** (`vivenu-sandbox-lauf.mjs kontingent-probe`, Sandbox, von der Architektur-Session gefahren, Exit 0): Undershop mit Typ A 2 Stück und Typ B 3 Stück, ein Coupon für beide Typen bis 10 Stück. **6 von 6 Warenkörben wie erwartet** — A×2, B×3 und A×2+B×3 angelegt, A×3, B×4 und A×2+B×4 mit HTTP 400 „Tickets are not available“ abgelehnt. Die Zeilengrenze je Kategorie wird also auch dann durchgesetzt, wenn der Coupon mehr erlaubt; ein Coupon für alle Kategorien ist gedeckt. Aufgeräumt: drei Warenkörbe abgebrochen, Coupon abgeschaltet, Probe-Undershop entfernt.

**Ablauf je Gruppe** (`lib/vivenu/kontingent-lauf.ts`, Planung in `kontingent-gruppe.ts`): erst der bleibende Coupon (angelegt oder erweitert), dann die übrigen der Gruppe abschalten, erst dann Code und Coupon-Id auf die Zeilen schreiben. Scheitert ein Schritt, steht die Gruppe nie ohne funktionierenden Coupon da, und der nächste Lauf holt den Rest nach.

- **Der bleibende Coupon** ist der erste vorhandene der Gruppe: aktive Zeilen vor ausstehenden vor fehlerhaften vor abgeschalteten, innerhalb davon nach Kategorie. Ein schon ausgegebener Code ändert sich so nie. Hat die Gruppe noch keinen, entsteht einer (ein von Hand gesetzter Code an einer Zeile wird dafür verwendet).
- **Altbestand** aus der Zeit je Kategorie (mehrere Coupons je Gruppe) bringt der Lauf auf einen: der erste Coupon wird erweitert, die übrigen werden abgeschaltet (`active false`, `maxTickets 0`, Name „… · ersetzt“; vivenu kennt kein Löschen von Coupons), je abgelöstem Coupon ein Audit-Eintrag `ticket.coupon_retired` mit alter und neuer Coupon-Id (ohne Personendaten). Das geschieht auch, wenn keine Zeile mehr aussteht — aber nur im Gesamtlauf, nicht bei `?allocation=<id>`. Danach ist der Lauf still (idempotent).
- **Fällt eine Kategorie weg**, deckt der Coupon nur noch die übrigen; die letzte schaltet ihn mit vollem Satz zu, er lebt bei der nächsten Buchung wieder auf. **Eine Kategorie ohne Tickettyp** in `ticket_type_map` wird an ihrer Zeile `error` (wie bisher), die übrigen laufen weiter.
- **Fehler:** Zeilen, die ohnehin ausstehen, werden `error`; Zeilen mit einem Code, der noch gilt, bleiben `active` (der Partner soll seinen Code nicht verlieren, weil vivenu einmal nicht antwortet). Ist schon ein Coupon abgeschaltet worden, gilt die ganze Gruppe als fehlerhaft. Eine Gruppe, die nur auf ihre Zusammenführung wartet, meldet den Fehler und lässt die Zeilen stehen.
- **Sandbox prüfen:** `node --env-file=.env.local scripts/vivenu-sandbox-lauf.mjs kontingent-probe` (nur Sandbox, Präfix `ZZTEST`, räumt auf).

## Team
- `ticket_allocations_admin(edition?)`: alle Kontingente mit Status, Fehler, vivenu-IDs.
- `set_ticket_allocation(id, quantity?, coupon_code?, undershop_url?, status?, notes?)`: manuelle Korrektur mit Audit; eine geänderte Menge bei vorhandenem Coupon wird beim nächsten Lauf nach vivenu geschrieben. **Code und Link gelten für die Gruppe:** die Admin-Tabelle (`/admin/partner/kontingente`) zeigt sie nur an der ersten Zeile der Gruppe, und die Action überträgt eine Änderung auf alle aktiven Zeilen der Gruppe (der Server bestimmt sie selbst aus `ticket_allocations_admin`). Der Coupon in vivenu behält seinen Code — von Hand nur ändern, wenn er dort ebenfalls geändert wurde.
- Genutzte Tickets (`used_count`) füllt der vivenu-Ingest (`ingest_vivenu_ticket`, Sweep `/api/cron/vivenu-tickets`). Gezählt wird, was einen Platz belegt: `valid`, `approved`, `checked_in`, `blocked`. Storno und Erstattung geben ihn frei.

## Antworten vivenu (11.09.2026) — bestätigt und ergänzt
- ~100 Undershops am Event sind unproblematisch; **während der Sync läuft keine manuellen Undershop-Änderungen im Dashboard** (PUT überschreibt das Array).
- Einlösungen zählen: ~~`appliedDiscountInfo[].discountId` aus Transaktionen~~ — im Sandbox-Lauf überholt, siehe Tabelle oben. Der Schlüssel ist `ticket.underShopId` + Pass-Typ.
- Dev (`vivenu.dev`) und Prod verhalten sich identisch; Rate-Limit praktisch höher als 1.000/h, bei 429 mit Backoff wiederholen (Folgeaufgabe im Client).
- Webhooks: Raw-Body signieren, Webhook-ID für Idempotenz, 7 Versuche mit Backoff; Personalisierung kommt als `ticket.updated`.

## Volunteer-Tickets (Welle 4 A6, Migration 0084)

Ein eigener Undershop je Edition (`FLS27 · Volunteers`) und darin ein **persönlicher** Coupon je angenommenem Volunteer — nicht ein Sammelcode. Grund: das Einlösen ist der Aktivierungsschritt (Entscheidung E2). Ein Sammelcode sagt nur, *dass* jemand eingelöst hat; ein persönlicher sagt *wer*, und genau das braucht der Schichtplan.

- Route `/api/cron/volunteer-tickets` (alle 6 Stunden, `CRON_SECRET`), `?profil=<id>` für einen einzelnen. Sie legt den Shop beim ersten Lauf an und merkt ihn an `event.vivenu_volunteer_undershop_id`.
- Coupon je Person: `maxTickets: 1`, `maxUsage: 1`, `singleUsage: true`, `allowAllEvents: false`. Code ohne I, O, 0 und 1 — er wird vorgelesen und abgeschrieben.
- **Einlösung erkennt ein Trigger auf `ticket`**, nicht der Ingest: so greift sie auf jedem Weg, über den ein Ticket hereinkommt (Webhook, Sweep, Nachtrag). Schlüssel ist der Coupon, wenn vivenu ihn mitschickt, sonst Undershop + Person — `appliedDiscountInfo` fehlt am `ticket.created`-Webhook und steht erst an der Transaktion.
- Erinnerung `volunteer_ticket_reminder` sieben Tage nach der Ausgabe, **einmal** (`reminded_at`).
- Zusage zurückgenommen ⇒ Coupon `revoked`; der Code bleibt stehen, damit im Support nachvollziehbar ist, was jemand in der Hand hatte.
- Liste „nicht eingelöst": `/admin/volunteers/tickets`, offene Fälle zuerst.
