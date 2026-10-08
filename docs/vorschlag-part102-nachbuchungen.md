# Vorschlag PART-102 · Nachbuchungen (Upsells) im HubSpot-Abgleich und im Portal

Stand 08.10.2026, Partner-Chat. **Befund und Vorschlag — gebaut wird nach Freigabe** durch die Architektur-Session (Datenmodell) und, für die Frage unter „Offen“, durch Konrad und das Sales-Team. Code geprüft auf `main` (c85436ed), Live-Daten nur gelesen.

## Anlass

PART-102 (Konrad & Leopold 05.10., Frage aus dem Sales): Leistungen lassen sich nachträglich hinzubuchen, meist über ein **zweites HubSpot-Angebot**. Antwort von Plan an Konrad (K-Liste 24.09., Nr. 20): ja — der Abgleich zählt einen zweiten gewonnenen Deal **zusätzlich**, das Portal zeigt „nachgebucht am …“. Zu prüfen war, ob das stimmt, und was fehlt.

## Befund

### Der Abgleich ist nicht scharf — alles ist billig zu ändern
Live gelesen: `hubspot_editions()` ist leer (keine Pipeline und Phase je Edition eingetragen), `partner_deal` hat 0 Zeilen, `org_product` hat 16 Zeilen — alle ohne `hubspot_line_item_id`, also von Hand oder per Skript angelegt, nicht aus einem Deal. Es gibt nichts zu migrieren und nichts aufzuholen.

### Ein zweiter Deal wird additiv übernommen — so war es von Anfang an gebaut
Entscheidungslog 11.09.: „Mehrere Deals je Partner × Edition (Nachbuchungen) über `partner_deal`; `org_edition.hubspot_deal_id` bleibt der erste Deal.“ Im Code (`ingest_partner_deal`, Snapshot) heißt das:

| Baustein | Verhalten bei einem zweiten Deal derselben Firma |
|---|---|
| Idempotenz | je **Deal-Id** (`partner_deal.hubspot_deal_id` ist der Schlüssel) — eine neue Deal-Id läuft durch |
| `organization`, `org_edition` | gleiche Zeilen; `org_edition.hubspot_deal_id` bleibt der erste Deal (`coalesce`), Rechnungsdaten nur ergänzt |
| `partner_deal` | zweite Zeile am selben `org_edition` |
| `org_product` | Schlüssel `(org_edition_id, product_sku, hubspot_line_item_id)` — die Line-Item-Id steht im Schlüssel, also **neue Zeilen, auch bei gleicher SKU**; nichts wird überschrieben |
| Ticket-Kontingent | `sync_ticket_allocations` summiert **alle** gebuchten Zeilen; die Menge steigt, `synced_at` wird zurückgesetzt, der vivenu-Lauf hebt den Coupon an (seit #377 je Gruppe summiert) |
| Checkliste, Rollen | `trg_org_product_deliverables` (`sync_deliverables`) und `trg_org_product_roles` (`grants_role`) laufen bei jeder neuen Zeile |
| Produktionslisten, Anspruch | `booth_production_lines` und `partner_entitlement` summieren die Zeilen |

Der Test `supabase/tests/v3_partner_ingest.sql` belegt es in Schritt 18, und der Probelauf gegen die Live-Datenbank (Wegwerf-Transaktion, 08.10.) bestätigt es: Schritt 17 zweiter Deal mit anderem Hauptkontakt → `ok=false errors=primary_conflict`; Schritt 18 zweiter Deal mit gleichem Hauptkontakt → `ok=true new_org=false same_oe=true products=4 first_deal_kept=true deals=2` (vorher drei Leistungen, dann vier; erster Deal bleibt; zwei `partner_deal`-Zeilen). *Nebenbefund, unabhängig von diesem Vorschlag:* der Test läuft heute nicht mehr bis zum Ende — Schritt 26 (`upsert_partner_contact` antwortet „not allowed“) bricht ab, und Schritt 25 meldet `own=false` für die eigene Bühne; die Ursache habe ich nicht untersucht (kein Teil dieses Vorschlags). Die Schritte bis 24, also auch die beiden zum zweiten Deal, laufen.

### Was fehlt
| Nr. | Lücke | Folge |
|---|---|---|
| L1 | **Kontakte-Gate.** `primary_contact_missing` verlangt an **jedem** Deal einen Kontakt mit Hauptkontakt-Label (oder genau einen Kontakt). Ein Folge-Deal ohne Kontakte oder mit zwei Kontakten ohne Label fällt durch, obwohl die Organisation längst einen Hauptkontakt hat. | Deal wird nicht übernommen, Phase zurück, Mail an den Deal-Owner, Slack — bei einer Nachbuchung ein unnötiger Fehler |
| L2 | **Gleiche SKU, zwei Zeilen.** `partner_overview.products` führt jede Zeile; die Übersicht und die Admin-Seite zeigen sie als zwei Zeilen („Tickets Partner × 10“, „Tickets Partner × 2“) mit demselben React-Key `p.sku`. | doppelte Einträge, Konsolenwarnung |
| L3 | **„nachgebucht am“ gibt es nicht.** Nichts am Datenmodell sagt, welche Zeile später kam. `org_product.created_at` ist die Zeit des Imports, aber „später“ ist keine Eigenschaft der Zeile, sondern des Deals. | die Anzeige, um die es Konrad geht, ist nicht möglich |
| L4 | **Positionen am selben Deal.** Der Abgleich sucht nur Deals in der Start-Phase und überspringt bereits übernommene (`already`). Kommen die Positionen eines „zweiten Angebots“ an den **bestehenden** Deal, liest sie nie jemand. | nur ein Problem, wenn Sales so arbeitet — Frage unten |
| L5 | Streichungen und Änderungen nach der Übernahme gleicht nichts ab. | bleibt so; Storno ist ein eigener Vorgang (`org_product.status = 'cancelled'`, Team) |

## Vorschlag

Eine Migration `v6_nachbuchung` (kein neuer Fremdschlüssel, kein neues Recht), dazu Oberfläche und Testdaten.

1. **Spalte** `org_product.nachgebucht_am timestamptz` (null = Erstbuchung). Nur der Ingest setzt sie: gibt es zum `org_edition` beim Einfügen schon eine `partner_deal`-Zeile, bekommen die neuen Zeilen `now()`. Beim `on conflict … do update` bleibt der Wert unverändert.
   *Verworfen:* (a) ableiten über `partner_deal.payload->'line_items'` — jsonb-Verbund, bricht bei Zeilen ohne Line-Item-Id, die Anzeige bräuchte trotzdem eine Funktion; (b) `created_at` nach dem ersten Ingest — Testdaten und Einträge des Teams sähen nachgebucht aus.
2. **Gate** in `ingest_partner_deal`: `primary_contact_missing` entfällt, wenn die Organisation schon eine Zeile `org_membership` mit `primary_ops` hat. Kontakte am Folge-Deal sind dann optional; `primary_conflict` (anderer Hauptkontakt) und `primary_contact_multiple` bleiben. Die Funktion ändere ich auf Basis des Snapshots, `fn-diff` zeigt die zwei Stellen.
3. **Anzeige:** `partner_overview.products[]` bekommt `nachgebucht_am` (eine Zeile mehr im JSON, auf Basis des Snapshots). Die Liste fasst Zeilen je SKU zusammen (Summe der Menge, ein Eintrag je Leistung) und nennt den Nachbuchungs-Anteil: „× 10 · davon 2 nachgebucht am 12.10.2026“; eine ganz nachgebuchte Leistung: „nachgebucht am 12.10.2026“. Dasselbe in der Admin-Karte „Gebucht“ (`/admin/partner/<Organisation>`, liest dieselbe Funktion). Zusammen mit PART-100 (Trennlinien in dieser Liste), weil es dieselbe Liste ist.
4. **Test** `supabase/tests/v6_nachbuchung.sql` (Wegwerf-Transaktion): zwei Deals derselben Firma — Folge-Deal **ohne Kontakte** wird übernommen (L1), Folge-Deal mit anderem Hauptkontakt scheitert weiter mit `primary_conflict`; dieselbe SKU in beiden Deals (Kontingentsumme, zwei Zeilen); `nachgebucht_am` nur an den Zeilen des zweiten Deals, nie am ersten; erneuter Lauf des zweiten Deals ändert nichts (`already`); `partner_overview` liefert das Feld; Idempotenz der Kontingente.
5. **Testdaten** (`scripts/testdaten-konrad.mjs`, Schritt `nachbuchung`, braucht die Migration): Konrads Test-Organisation bekommt einen zweiten Deal `ZZTEST-DEAL-2` samt zwei Folge-Leistungen (eine neue SKU, eine bereits gebuchte) mit `nachgebucht_am` — direkt geschrieben, ohne HubSpot. Konrad klickt `/partner` → „Gebuchte Leistungen“, im Admin `/admin/partner/<Test-Organisation>` → „Gebucht“ und „Deals“.
6. **Runbook** `docs/runbooks/hubspot-ingest.md`: Abschnitt „Nachbuchung“ — wie Sales sie anlegt, was das Portal tut, was nicht (L4, L5).

**Admin-Weg:** vorhanden — die Admin-Karte „Gebucht“ zeigt dasselbe wie das Portal; die Deals stehen dort schon (`partner_deals`).

**Keine Mail** an den Partner bei einer Nachbuchung: die Leistung erscheint in der Liste, die Checkliste bekommt ihre Aufgaben, das Kontingent steigt. Eine Mail wäre eine neue Entscheidung (Vorlage, Empfänger, Zeitpunkt) — nur auf Wunsch.

## Offen — Entscheidung bei Konrad und Sales

**F1 · Wie legt Sales eine Nachbuchung an?**
- **A — als neuer Deal** in derselben Pipeline und Phase „Onboarding Start (Automation)“. So läuft es heute; es braucht nur die Punkte oben (L1–L3). **Empfehlung.**
- **B — als neue Positionen am bestehenden Deal** (zweites Angebot im selben Deal). Das liest heute niemand (L4). Wenn Sales so arbeitet, braucht es einen **Nachtrag-Weg**: Sales schiebt den Deal zurück in „Onboarding Start“, der Abgleich erkennt „schon übernommen“ und übernimmt nur die Line-Items, deren Id wir noch nicht kennen, als Nachbuchung (Aufwand etwa ein Tag: `ingestDeal` im `already`-Zweig, ein Parameter an `ingest_partner_deal`, Test). Ohne diese Absprache bleibt B unsichtbar.

**F2 · Gate (L1):** Ist es richtig, dass am Folge-Deal keine Kontakte mehr nötig sind, sobald die Organisation einen Hauptkontakt hat? Kommen am Folge-Deal Kontakte dazu, werden sie wie bisher angelegt.

## Reihenfolge

1. Freigabe des Datenmodells (diese Notiz) und Antwort auf F1/F2.
2. Migration als Vorschlag unter `supabase/migrations/vorschlag/` mit Test; der PR trägt „Migration enthalten“.
3. Nach „Migration live“: Oberfläche (Portal und Admin), Testdaten-Schritt, Runbook.
