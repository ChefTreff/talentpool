# Vorschlag PART-116 · „Angebot erstellen“ im Messeshop-Warenkorb (SevDesk-Angebot)

Stand 09.10.2026, Partner-Chat. **Datenmodell und Ablauf vorab an Plan — gebaut wird nach Freigabe.** Grundlage: Befund des Admin-Chats `docs/befund-part116-sevdesk-angebot-2026-10-08.md` (#383), Konrads Antworten K-81 (08.10.), Code auf `main` gelesen, SevDesk nur **lesend** angesprochen (kein `getPdf`, nichts angelegt).

## Entschieden (K-81, Konrad 08.10.2026 über Plan)
1. **Sofort verbindlich, mit Angebotsnummer** (`AN-####`) — und **die Bestellung wird mit dem Angebot vorläufig festgesetzt**: Warenkorb-Stand gesperrt, bis die PO-Nummer kommt oder das Angebot **verfällt** oder **zurückgezogen** wird.
2. **Standardtexte, 30 Tage** Gültigkeit.
3. **Kontaktanlage in SevDesk ja; Abgleich immer über die Kundennummer** (HubSpot `company_id`, ADM-057 `organization.customer_number`): SevDesk-Kontakt per Kundennummer suchen, sonst anlegen.
4. **Probelauf mit ZZTEST-Kontakt und Entwurf: ja** — Konrad genehmigt den Schreibzugriff **in meinem Chat** (ich frage ihn dort direkt).
5. **EU-/Auslandspartner:** „Angebot beim Team anfragen“.

## Neu gelesen (heute, nur `GET`)
- `GET /Contact?customerNumber=<Nummer>` **filtert wirklich**: eine nicht vorhandene Nummer liefert 0 Treffer, eine vorhandene genau den Kontakt. Der Abgleich per Kundennummer geht also ohne Umweg.
- Die bestehenden Angebote tragen als Kopftext „Moin Moin! Wir freuen uns über … In diesem Rahmen möchten wir folgende Leistungen anbieten.“ und als Fußtext „Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung. Wir bedanken uns sehr für Ihr Vertrauen. Mit freundlichen Grüßen [%KONTAKTPERSON%]“; Titel (`header`) = „Angebot AN-####“; `taxRule` 1, EUR, netto; **kein** `validUntil`, keine Zahlungs- oder Lieferbedingungen. Die Gültigkeit steht bei uns im Fußtext. Jüngste Nummer heute: AN-1232 — der Nummernkreis läuft, wir verbrauchen ihn mit.

## Ablauf aus Sicht der Partnerin
1. Warenkorb (`/partner/shop/warenkorb`) mit Positionen; neben „Verbindlich bestellen“ ein **zweiter Knopf „Angebot erstellen“** (sekundär; die primäre Aktion bleibt die Bestellung).
2. Klick → Server erzeugt das Angebot (siehe „Route“), die Bestellung steht auf **„Angebot erstellt“**: der Warenkorb ist gesperrt, oben ein Hinweis mit **Angebotsnummer, „gültig bis …“ und PDF-Download**.
3. Die Partnerin gibt das PDF an ihre Einkaufsabteilung, bekommt die **PO-Nummer**, trägt sie in das Feld ein und klickt **„Verbindlich bestellen“** (wie heute, mit den Preisen und Mengen des Angebots).
4. **Oder** sie zieht das Angebot zurück („Warenkorb wieder bearbeiten“) — dann ist der Warenkorb wieder frei; ein neues Angebot ist möglich. Ohne Reaktion **verfällt** das Angebot nach 30 Tagen, spätestens mit dem Ende der Shop-Phase.

## Zustände der Bestellung
Neuer Wert **`quoted`** in `shop_order.status` (heute `draft`, `editing`, `pending`, `completed`, `cancelled`):

| Von | Auslöser | Nach | Wirkung |
|---|---|---|---|
| `draft`, `editing` | „Angebot erstellen“ (`shop_quote_begin`) | `quoted` | Preise aus dem Katalog **frisch gesetzt** (wie bei `shop_confirm`), Bestand **reserviert** (Frage Q1), Warenkorb gesperrt |
| `quoted` | `record_shop_quote` (Route, nach SevDesk) | `quoted` | Referenz `external_ref`, `quote_valid_until` = heute + 30 Tage |
| `quoted` | `shop_quote_abort` (Route, wenn SevDesk scheitert) | `editing` | Reservierung frei, nichts bleibt zurück |
| `quoted` | `shop_confirm` mit PO-Nummer | `pending` | **Preise und Mengen des Angebots** (keine Preisaktualisierung), sonst wie heute |
| `quoted` | `shop_quote_withdraw` (Partner mit Bearbeitungsrecht oder Team) | `editing` | Reservierung frei, Audit `shop.quote_withdrawn`; **das SevDesk-Angebot bleibt** (siehe Q3) |
| `quoted` | Ablauf (Housekeeping) | `editing` | wie „zurückgezogen“, Audit `shop.quote_expired` |
| `quoted` | Ende der Shop-Phase | `cancelled` | wie ein Entwurf in `run_shop_finalization` (Reservierung frei) |
| `quoted` | `shop_cancel` | `cancelled` | wie heute |

`pending` bleibt die verbindliche Bestellung (Bestätigungsmail, Rechnungslauf nach dem Summit); `quoted` löst **keine** Mail, keinen Rechnungslauf und keine Checklisten-Erfüllung aus (`shop_sync_fulfilled_deliverables` zählt nur `pending`/`editing`/`completed`).

## Datenmodell — Migration `v6_shop_angebot` (Vorschlag)
**Spalten an `shop_order`:** `quote_valid_until timestamptz` (gesetzt von `record_shop_quote`), `quote_started_at timestamptz` (Beginn des Angebots-Vorgangs; Grundlage der Aufräumregel, siehe unten). Check-Constraint `status` um `quoted` ergänzt; der **Teilindex `shop_order_active_uidx`** (eine aktive Bestellung je Org-Edition und Phase) nimmt `quoted` auf.

**Funktionen (neu, alle Definer, `search_path` gepinnt, Fehlerschlüssel nach `docs/db-konventionen.md`):**
- **`shop_quote_begin(p_order_id uuid) returns jsonb`** — für Partner mit Bearbeitungsrecht (`partner_can_edit`) und Partner-Team. Prüft Status (`draft`/`editing`, sonst `not_editable`), Phase offen (`phase_closed`), Positionen vorhanden (`empty_order`), Merch vollständig (`merch_incomplete`), Bestand (`out_of_stock`), **Kundennummer vorhanden** (`quote_customer_number_required`), **Land = Deutschland** (`quote_country_unsupported`), **höchstens drei Angebote je Bestellung** (`quote_limit_reached`, Nummernkreis-Schutz; Zähler in `external_ref.meta.history`). Dann **atomar**: Preise aus dem Katalog setzen, `shop_reconcile_ledger(order, false)` (Reservierung), Status `quoted`, `quote_started_at = now()`, und **liefert die Grundlage** für das Angebot: Positionen (SKU, Name, Einheit, Menge, Netto, USt-Satz), Summen, Firmierung, Adresse mit Zusatz, USt-ID, Rechnungs-E-Mail, Kundennummer, bestehende `sevdesk_contact_id`, Bestellnummer, Hash der Positionen. Die Sperre **vor** dem SevDesk-Aufruf verhindert Doppelklick und gleichzeitige Änderungen am Warenkorb, ohne dass ein festgeschriebenes SevDesk-Angebot ohne passende Bestellung entsteht. (Das ist die Rolle, die im Befund `shop_quote_basis` hatte — mit Sperre, weil eine reine Lesefunktion den Warenkorb nicht festhält.)
- **`record_shop_quote(p_order_id uuid, p_sevdesk_order_id text, p_number text, p_contact_id text, p_net_cents bigint, p_lines_hash text) returns void`** — **nur `service_role`** (`auth.uid() is not null` ⇒ 42501, wie `ingest_partner_deal`): ein Partner darf kein Angebot „melden“, das es nicht gibt. Prüft Status `quoted` ohne Referenz, gleichen Hash, schreibt `external_ref (system 'sevdesk', object_type 'shop_quote', object_id = Bestell-Id, external_id = SevDesk-Order-Id, meta { number, valid_until, net_cents, lines_hash, contact_id, history })`, setzt `quote_valid_until = now() + 30 Tage`, `organization.sevdesk_contact_id` (wenn leer, wie `record_shop_invoice`). **Audit `shop.quote_created` mit Bestell-Id, Angebotsnummer, Netto-Summe — ohne Klartext-Adresse.**
- **`shop_quote_abort(p_order_id uuid, p_reason text) returns void`** — nur `service_role`: Status zurück auf `editing`, Reservierung frei, Audit `shop.quote_aborted` (Grund als Schlüssel).
- **`shop_quote_withdraw(p_order_id uuid) returns void`** — Partner mit Bearbeitungsrecht und Team: `quoted` → `editing`, Reservierung frei, Audit `shop.quote_withdrawn`; die `external_ref` bleibt (Verlauf).
- **Housekeeping** `shop_quotes_housekeeping()` im bestehenden Lauf (`run_partner_housekeeping`, Cron `/api/cron/mail` alle 10 Minuten): (a) **abgelaufen** (`quote_valid_until < now()`) ⇒ `editing`, Audit `shop.quote_expired`; (b) **hängengeblieben** (`quoted` ohne Referenz und `quote_started_at` älter als 10 Minuten — die Route ist abgestürzt) ⇒ `editing`, Audit `shop.quote_aborted` (`stale`).

**Geänderte Funktionen (Basis: Snapshot, `fn-diff`):**

| Funktion | Änderung |
|---|---|
| `shop_upsert_line`, `shop_remove_line` | bei `quoted` Fehler **`order_quoted`** (wie `order_pending` bei `pending`) — der Warenkorb ist gesperrt |
| `shop_confirm` | nimmt `quoted` an (heute nur `draft`/`editing`); bei `quoted` **keine Preisaktualisierung** aus dem Katalog; Audit nennt die Angebotsnummer |
| `shop_cancel` | `quoted` ist stornierbar |
| `shop_my_orders` | `quoted` zählt als aktive Bestellung (`active`); liefert `quote_valid_until` und `quote_number` |
| `shop_orders_admin`, `shop_admin_set_status` | Team sieht `quoted` mit Nummer und Frist; kann zurückziehen (`editing`) |
| `run_shop_finalization` | `quoted` am Phasenende wie ein Entwurf: `cancelled`, Reservierung frei |
| `record_shop_invoice`, `shop_invoice_candidates` | **unverändert** — der Rechnungslauf liest nur `completed` und den `object_type` `shop_order`; das Angebot (`shop_quote`) stört ihn nicht |

**Referenz:** eigener `object_type` **`shop_quote`**, weil `shop_order` für die **Rechnung** schon belegt ist (`unique (system, object_type, object_id)`). Eine Zeile je Bestellung; bei einem zweiten Angebot nach Rücknahme wird sie fortgeschrieben, die frühere Nummer steht in `meta.history`.

## Route (nur serverseitig, Token nie im Browser) — `POST /api/partner/shop/angebot`
1. **Sitzung** → Nutzer-Client. `shop_quote_begin(order_id)` (Rechte, Sperre, Preise, Bestand, Grundlage) — scheitert er, ist nichts passiert.
2. **SevDesk-Kontakt:** `GET /Contact?customerNumber=<Nr>`; gefunden ⇒ verwenden; sonst `POST /Contact` (Name, USt-ID, **customerNumber**) + Rechnungsadresse + Rechnungs-E-Mail (die vorhandenen Bausteine `createContact`, `addContactAddress`, `addContactEmail` aus `lib/sevdesk/client.ts`). Das ist der **Schreibzugriff auf ein Fremdsystem** (Entscheidung 3).
3. **`POST /Order/Factory/saveOrder`** mit `orderType` AN, Status 100, `taxRule` 1, EUR, netto, Titel „Angebot AN-…“ (die Nummer vergibt SevDesk), Positionen mit `part` (Artikelstamm aus `lib/sevdesk/parts.ts`, sonst `name`), Einheit 1, Kopftext und Fußtext aus **Standardtexten** (siehe unten), Bestellnummer als Betreff.
4. **`GET /Order/{id}/getPdf`** (schreibt den Beleg fest — gewollt, Entscheidung 1) und das PDF an die Partnerin durchreichen, **ohne Ablage bei uns**.
5. **`record_shop_quote`** mit dem Service-Client. **Scheitert ein Schritt vor 3**, ruft die Route `shop_quote_abort` (die Bestellung ist wieder frei). **Scheitert `record_shop_quote` nach 3**, steht ein SevDesk-Angebot ohne Referenz: Fehler in `integration.sync_error` (`object_type shop_quote`), der Fall ist selten und das Team räumt auf (der Housekeeping-Schritt (b) gibt die Bestellung nach zehn Minuten frei).
6. **PDF erneut laden:** `GET /api/partner/shop/angebot/<Bestell-Id>/pdf` — Rechte aus der Sitzung, SevDesk-Id aus `external_ref`, `getPdf` (auf einem festgeschriebenen Beleg wirkungslos).
**Sicherheit:** die Organisation kommt aus der Sitzung und der Bestellung, nie aus dem Request; `service_role` und Token nur serverseitig nach der Rechteprüfung; keine Adressen im Audit; kein SevDesk-Aufruf aus dem Browser; Antworten ohne Stacktraces.

**Standardtexte (Vorschlag, DE; EN-Partner bekommen die deutsche Fassung, die Buchhaltung arbeitet auf Deutsch):** Kopftext: „Moin Moin! Wir freuen uns über eure Teilnahme am Future Leader Summit. In diesem Rahmen möchten wir folgende Leistungen aus dem Messeshop anbieten.“ — Fußtext: „Dieses Angebot ist 30 Tage gültig (bis {Datum}). Die verbindliche Bestellung gebt ihr im Partner-Portal unter Messeshop auf, mit eurer Bestellnummer (PO). Alle Preise netto zuzüglich gesetzlicher Umsatzsteuer. Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung. Wir bedanken uns sehr für Ihr Vertrauen. Mit freundlichen Grüßen [%KONTAKTPERSON%]“. Ablage der Texte: Konstante in `lib/sevdesk/angebot.ts` (nicht in der Datenbank — sie ändern sich selten und gehören ins Review).

## Oberfläche und Admin-Weg
- **Partner:** Warenkorb mit „Angebot erstellen“ (Fehlerfälle: `quote_customer_number_required` und `quote_country_unsupported` zeigen **„Angebot beim Team anfragen“** mit `partner@`-Link statt des Knopfes; `quote_limit_reached` genauso). Im Zustand `quoted`: Hinweisfläche (Nummer, gültig bis, PDF, „Warenkorb wieder bearbeiten“), PO-Feld, „Verbindlich bestellen“. Bestellungsliste (`/partner/shop/bestellungen`) zeigt „Angebot AN-… · gültig bis …“.
- **Admin** (Admin-Vollständigkeit): die Bestellungsliste unter `/admin/partner/bestellungen` zeigt Status, Nummer, Frist; Aktion „Angebot zurückziehen“ (Team). Ein Angebot **für** eine Partnerin erstellen kann das Team nicht (es kann die Bestellung der Partnerin im Admin bearbeiten, wie heute) — erst auf Wunsch.
- **Konrads Konto:** seine Test-Organisation trägt `customer_number` mit Präfix `ZZTEST`; für Organisationen mit diesem Präfix arbeitet die Route im **Probebetrieb**: Kontakt und Angebot als **Entwurf (Status 100), kein `getPdf`, keine Nummer verbraucht**, das Angebot wird nach dem Klick in SevDesk wieder gelöscht (Entwürfe sind löschbar). So sieht Konrad den ganzen Ablauf — Knopf, gesperrter Warenkorb, Hinweis, Rücknahme, Bestellung —, ohne den echten Nummernkreis anzufassen; das PDF steht dort als „Im Probebetrieb nicht erzeugt“. Testdaten-Schritt `angebot` (Warenkorb mit Positionen, Kundennummer `ZZTEST-…`).
- **Runbook** `docs/runbooks/sevdesk-shop-angebote.md`, `docs/mail-plan.md` unverändert (keine Mail).

## Test
SQL-Test `supabase/tests/v6_shop_angebot.sql` mit echtem Rollenwechsel (Partner mit Bearbeitungsrecht, Partner ohne, Team, fremde Organisation): jede Abweisung mit Gegenstück; Zustandsübergänge der Tabelle oben einzeln; Warenkorb gesperrt (`order_quoted`), Preise aus dem Angebot bei `shop_confirm`; Housekeeping (abgelaufen, hängengeblieben); `record_shop_quote` für Aufrufer 42501; Audit ohne Adresse; Rechnungslauf unberührt. TypeScript-Tests: Zuordnung Bestellung → `saveOrder`-Payload (reine Funktion `lib/sevdesk/angebot.ts`), Fehlerzuordnung der Route, Seiten-Verdrahtung. Mutationen wie bei den übrigen PRs.

## Offene Fragen
- **Q1 · Reservierung.** Soll das Angebot den Bestand **reservieren** (Empfehlung: ja — sonst lässt sich der angebotene Preis und die Menge nicht halten), oder nur die Preise festhalten? Gegen die Reservierung spricht, dass ein Angebot 30 Tage Ware bindet (Gitterbox, Tischkicker …); dagegen hilft Rücknahme und Ablauf. **Empfehlung: reservieren.**
- **Q2 · Kundennummer fehlt.** Partner, die nicht aus HubSpot kommen (kein `customer_number`), bekommen „Angebot beim Team anfragen“. Alternative: Nummer im Admin pflegen (ADM-057 kann das) — **Empfehlung: beim Team anfragen**, das Team trägt die Nummer ein und die Partnerin kann es danach selbst.
- **Q3 · SevDesk-Angebot nach Rücknahme/Ablauf.** Es bleibt **offen in SevDesk** (Status „versendet“ nach `getPdf`?) — die Buchhaltung sieht ein Angebot, das ins Leere läuft. Möglich: bei Rücknahme `Order/{id}` auf „abgelehnt“ (300) setzen (zweiter Schreibzugriff). **Empfehlung: v1 ohne**, die Buchhaltung sieht an der Bestellung (Referenz im Admin), was daraus wurde; Statusabgleich später.
- **Q4 · Mail.** Keine Mail zum Angebot (die Partnerin hat das PDF); eine Erinnerung vor Ablauf wäre eine neue Entscheidung — **Empfehlung: nein in v1**.
- **Q5 · Mehrere Angebote.** Höchstens **drei** je Bestellung (Nummernkreis-Schutz); danach „beim Team anfragen“.

## Reihenfolge
1. Freigabe dieses Vorschlags (Datenmodell, Zustände, Q1–Q5) durch Plan.
2. Migration als Vorschlag mit Test; der PR trägt „Migration enthalten“.
3. Nach „Migration live“: Route, Oberfläche, Admin, Testdaten, Runbook; **Probelauf gegen SevDesk** mit ZZTEST-Kontakt und Entwurf nach Konrads Ja in meinem Chat (der Admin-Chat prüft den Client `lib/sevdesk/client.ts`, den ich um `findContactByCustomerNumber` und `saveOrderDraft` ergänze).
