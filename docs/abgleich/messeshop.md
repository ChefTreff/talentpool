# Abgleich · Messeshop (WooCommerce `partner.chef-treff.de`) → `/partner/shop`

**Stand: 2026-09-17 · Entwurf der Architektur-Session (Codebefund, nicht am Gerenderten geprüft) · zur Prüfung durch Konrad im Walkthrough**

**Quellen (Altsystem):** `docs/legacy-inventar.md` §2.6 (Messeshop/WooCommerce), §13.3 (Walkthrough Shop, 08.09.), §13.4 (Bestellungen & Katalog), §2.1/§2.2 (Product-Data, Bundles, Kategorien, Shop-Rollen), §16 (Item-Liste 2026 = Katalogquelle). **Neu:** `/partner/shop`, `/partner/shop/[sku]`, `/partner/shop/warenkorb`, `/partner/shop/bestellungen`, `/admin/partner/produkte`, `/admin/partner/bestellungen`, `/produktion/bestellungen`.

**Methode.** Zeile = eine Seite oder Funktion des alten Shops; daneben der neue Ort, der Status und der Beleg im Repo (Seitenpfad, Komponente, RPC, Migration). Anders als `docs/feedback-runde-1-abgleich.md` (dort am Gerenderten geprüft) ist dieser Entwurf **ausschließlich am Quelltext** entstanden — er sagt, was gebaut ist, nicht, wie es sich anfühlt.

**Regel (aus F4, gilt weiter):** Diese Matrix **benennt Lücken, sie schließt keine.** Nichts daraus wird gebaut, bevor du je Zeile entschieden hast, ob FLS27 es braucht.

**Was `feedback-runde-1-abgleich.md` schon abdeckt** (nicht wiederholt, nur verfeinert): Messeshop im selben Login, sieben Kategorien identisch, „Auf Anfrage"-Produkte über `shop_request_product`, eigene Bestellhistorie.

---

## 1 · Zugang und Konto

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Eigener WooCommerce-Login „FLS ANMELDEN", Passwort je Org automatisch erzeugt, Primary-Mail als Benutzername | kein eigener Shop-Login; der Shop ist ein Bereich des Portals | **bewusst weggelassen** — „drei Logins → einer" (Entscheidung 08.09., Antwort 45; Entscheidungslog „Scope = Plattform") | `app/(partner)/partner/shop/layout.tsx`; Org-Kontext über `getPartnerScope()` in `app/(partner)/partner/org.ts` | | |
| „Mein Konto" auf Bestellungen + Abmelden reduziert (Adressen/Downloads ausgeblendet) | Reiter „Bestellungen" im Shop; Abmelden in der Portal-Hülle | **anders** — kein Konto-Bereich im Shop, weil das Konto das Portalkonto ist | `SectionTabs` in `app/(partner)/partner/shop/layout.tsx` | | |
| **Shop-Rolle je Org: „2 Basic" / „3 Limited"** (Customer-Data, steuert den sichtbaren Katalog) | keine Rollentrennung; alle Mitglieder einer Org sehen denselben Katalog | **bewusst weggelassen** — Entscheidungslog 08.09. („keine Rollentrennung, Hinweise auf Produktebene"), umgesetzt als S2 | `supabase/migrations/20260911070632_v3_shop.sql`, Kommentar über `shop_catalogue` („S2: keine Rollentrennung"); Hinweise je Artikel über `product.shop_hint_de/en` | | |
| Wer bestellen darf: wer das Shop-Passwort hat (eine Person je Org) | bestellen darf `primary_ops`, `additional`, `signing`; `event_app_member` liest nur | **anders**, mehr — Rechte hängen an der Kontaktrolle, nicht am Passwort | `partner_can_edit` (`supabase/migrations/20260910162431_v3_partner_org_context.sql`), Prüfung in jeder Schreib-RPC; Oberfläche `canEditOnboarding` in `app/(partner)/partner/types.ts` | | |
| Login-Daten und Countdowns standen zusätzlich auf der Hub-Seite „Partner-Shop" | entfällt (kein Passwort mehr zu verteilen) | **bewusst weggelassen** — siehe `partner-hub-rest.md`, Abschnitt Partner-Shop-Seite | — | | |

## 2 · Einstieg in den Shop

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Landing mit 3-Schritte-Erklärung (Kategorien entdecken → Warenkorb → Bestellung absenden) | keine Startseite; der Shop beginnt im Katalog | **bewusst weggelassen** — Entscheidungslog 08.09. („Messeshop-Anpassungen: keine Startseite") | `app/(partner)/partner/shop/page.tsx` ist der Katalog | | |
| **Erklär-Video** auf der Landing | — | **fehlt** — der Mechanismus existiert (`portal_video`, Loom, je Zielgruppe und Edition), aber kein Schlüssel für den Shop. Gesucht: `loadVideo(...)` in `app/(partner)/partner/shop/**` — belegt nur `partner_tickets` und `partner_event_app` | `components/video/load.ts`; `supabase/migrations/20260915114209_v5_portal_video.sql`; Verwendungen in `app/(partner)/partner/tickets/page.tsx`, `app/(partner)/partner/event-app/page.tsx` | | |
| **Zwei Deadlines** prominent auf der Landing | Phasenhinweis auf jeder Shop-Seite, Frist aus `deadline` | **vorhanden**, besser — Datum kommt aus der Datenbank je Edition, nicht aus dem Text | `app/(partner)/partner/shop/PhaseBanner.tsx`; RPC `shop_phase_info` / `shop_phase` (`20260911070632_v3_shop.sql`); Fristen `shop_phase_1/2/3` in `20260910144439_v3_products.sql` | | |
| CTA „Zum Wiki" neben „Zum Shop" | Wiki ist ein eigener Portalbereich, im Shop nicht verlinkt | **anders** — gesucht: Wiki-Verweis in `app/(partner)/partner/shop/**`, keiner vorhanden | `app/(partner)/partner/wiki/page.tsx` | | |

(Der Datenschutzhinweis im Shop-Footer ist nur am Gerenderten vergleichbar — siehe „Nicht geprüft".)

## 3 · Katalog

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| `/shop/` mit sieben Kategorien (Essentials, Pflanzen, Mobiliar, Personal, Specials, Standgastronomie, Technik) | Kategorie-Reiter, serverseitig gefiltert, Kategorie steht in der Adresse | **vorhanden** | `app/(partner)/partner/shop/page.tsx` (Reiter aus `product.category`); Vokabular `product_category` in `20260910144439_v3_products.sql` | | |
| ~80 Produkte auf 7 Seiten, 12 je Seite (Blätterwerk) | eine Liste je Kategorie, ohne Seitenzahlen | **anders** — kein Paginieren; die Kategorie ist der Schnitt | `app/(partner)/partner/shop/page.tsx` | | |
| Je Produkt: Name, Beschreibung, Bild, Preis | Produktkachel mit Bild, Name, Beschreibung, Nettopreis, Einheit | **vorhanden** | `app/(partner)/partner/shop/Produktkarte.tsx`; RPC `shop_catalogue` | | |
| **Bestand „x Vorrätig"** an jedem Artikel | „Noch N verfügbar" erst ab zehn Stück, „Ausverkauft" bei null; gezeigt wird der **freie** Bestand | **anders**, bewusst (F11.1, Feedback-Runde 2) — Gesamtbestand minus bestätigter und offener Bestellungen, Entwürfe reservieren nicht | `shop_stock_available` und Lagerbuch `stock_ledger` (`20260911070632_v3_shop.sql`); Schwelle `STOCK_HINT_FROM = 10` in `app/(partner)/partner/shop/format.ts` | | |
| **Preise netto**, USt-Satz überall „7" | Nettopreis am Artikel, `vat_rate` je Produkt (0/7/19), Steuer erst in der Summe | **vorhanden**, sauberer | `product.vat_rate` (`20260910144439_v3_products.sql`); `shop_order_totals` | | |
| **„Auf Anfrage"-Artikel** (0,00 € im Katalog, Text „Mail an Konrad") | Knopf „Anfragen" statt Warenkorb, Anfrage landet beim Partner-Team | **vorhanden** (bereits in F4 korrigiert) — abgeleitet aus `net_price_cents = 0` | RPC `shop_request_product`; `request_only` in `shop_catalogue`; Team-Sicht `shop_requests_admin` | | |
| Kein Suchfeld im Katalog | Suche über Name, Beschreibung, Hinweis und Artikelnummer, Begriff in der Adresse | **vorhanden**, neu (F11.3) | `app/(partner)/partner/shop/ShopBar.tsx`; Filterung in `app/(partner)/partner/shop/page.tsx` | | |
| Produkt hatte in WooCommerce eine eigene Detailseite | eigene Seite je Artikel mit Zurück-Weg, der Suche und Kategorie mitnimmt | **vorhanden** (F11.3) | `app/(partner)/partner/shop/[sku]/page.tsx` | | |
| **Bundles / Stand-Pakete** (Product-Data Bundles, 34 Zeilen) als Shop-Artikel | Pakete sind `product.type = package` und **nicht** im Shop sichtbar; ihre Ausstattung steht auf `/partner/messestand` | **anders** — der Shop verkauft Zusatzleistungen, das Paket kommt aus dem Angebot | `product_component` (`20260910144439_v3_products.sql`); Entscheidungslog 14.09., Punkt 1; `app/(partner)/partner/messestand/page.tsx` | | |
| Kategorien ohne Preise wären im Shop unsichtbar (branding, infrastruktur, nebenkosten, standbau, company_tours, hackathon) | `product.shop_visible` je Artikel | **vorhanden** — mit dem bekannten Hinweis aus F4 §7: ohne Preise werden sie beim Freischalten zu Anfragen | `shop_catalogue` (`where p.active and p.shop_visible`) | | |

**Neu gegenüber dem Altbestand** (keine Zeile, weil es im alten Shop nichts dazu gab): **Merch-Artikel mit Konfiguration** — Dialog je Artikel, Pflichtfelder werden beim Bestätigen geprüft (`app/(partner)/partner/shop/MerchDialog.tsx`, `product.merch_config`, `supabase/migrations/20260911134144_v4_merch_config_check.sql`; Entscheidung 08.09. „Merch-Kategorie").

## 4 · Warenkorb und Bestellweg

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Warenkorb (WooCommerce-Standard) | eigene Seite, Knopf oben rechts mit Zahl der Positionen | **vorhanden** (F11.1/F11.4) | `app/(partner)/partner/shop/warenkorb/Warenkorb.tsx`; `cartCount` in `format.ts`; `ShopBar.tsx` | | |
| „Bestellung absenden" | Bestätigen mit Zwischenschritt: Rechnungsdaten anzeigen und abhaken, PO-Nummer, Bemerkung | **vorhanden**, mehr (F11.2) | RPC `shop_confirm` (`20260915114654_v5_shop_po_nummer.sql`, dritter Parameter `p_po_number`); Oberfläche `Warenkorb.tsx` | | |
| Rechnungsadresse im Bestellformular eingeben | Adresse aus den Stammdaten wird **gezeigt und bestätigt**; Ändern führt nach „Eure Daten" | **anders**, mit Absicht — eine Adresse, ein Ort (Entscheidungslog 14.09., Punkt 4) | `Warenkorb.tsx` (`adresseOk`, `invoiceEdit`); `org_edition.invoice_*` | | |
| **Zwei Bestellphasen mit festen Countdowns** (13.03. / 27.03. im Alt-System) | drei Phasen aus `deadline` je Edition; Phase 3 nur für `late_orderable`-Artikel | **anders**, mehr — die Phase wird **serverseitig** in jeder Schreib-RPC geprüft, nicht nur angezeigt | `shop_phase`, `shop_upsert_line` (`phase_closed`, `late_only`) in `20260911070632_v3_shop.sql`; Fristen-Saat in `20260910144439_v3_products.sql` | | |
| **Lunch-Paket in der Nachbestellphase** | Phase 3 = „Nachbestellung (Lunch-Paket)", Frist 09.04.2027; das Paket ist zugleich Checklistenpunkt und gilt mit der Bestellung als erledigt | **vorhanden**, mehr (Entscheidung 08.09.) | `deadline`-Schlüssel `shop_phase_3` und `lunch_package`; `deliverable_template.fulfilled_by_sku = 'I-79520'` in `20260911085655_v3_deliverable_extras.sql` | | |
| Bestellung nach Absenden ändern: nicht vorgesehen (Mail an Konrad) | „Bearbeiten" öffnet die bestätigte Bestellung erneut, solange die Phase läuft; „Stornieren" gibt den Bestand frei | **vorhanden**, neu | RPCs `shop_edit`, `shop_cancel`, Lagerabgleich `shop_reconcile_ledger` | | |
| Kein Bestandsschutz beim Bestellen (WooCommerce-Bestand nur Anzeige) | Bestand wird beim Einlegen **und** beim Bestätigen geprüft (`out_of_stock`) | **vorhanden**, neu | `20260911122018_v3_shop_stock_check_early.sql` | | |
| Bestellbestätigung per Mail | Mail an Bestätigende **und** Hauptkontakt, zweisprachig, mit Positionen und Frist | **vorhanden** | `queue_mail('shop_order_confirmed', …)` in `shop_confirm` | | |
| Verbindlich-Werden zur Frist | Housekeeping macht bestätigte Bestellungen einer beendeten Phase `completed`, leere Entwürfe verfallen | **vorhanden**, neu | `run_shop_finalization`, eingehängt in `run_partner_housekeeping` | | |

## 5 · Bestellübersicht des Partners

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| `/my-account/orders/`: Tabelle Nr. · Datum · Status · Gesamtsumme · Aktionen | Reiter „Bestellungen" mit denselben Spalten | **vorhanden** (F11.4, Vorlage war der Screenshot des Vorjahres) | `app/(partner)/partner/shop/bestellungen/Bestellungen.tsx`; RPC `shop_my_orders` | | |
| Aktion „Anzeigen" führt auf eine Bestell-Detailseite | Zeile klappt auf: Positionen, Summen, Phase, Bestätigt am, PO, Bemerkung | **anders** — Aufklapper statt eigener Seite | `Bestellungen.tsx` | | |
| Hinweisbalken „E-Mail bestätigen, um frühere Bestellungen zu verknüpfen" | entfällt | **bewusst weggelassen** — Feedback-Runde 2, F11.4 („ohne den Hinweisbalken, den es bei uns nicht braucht") | — | | |
| **Rechnung zur Bestellung** (WooCommerce-Invoice-Datei je Bestellung, Netto-Summe) | Partner sieht Summen, aber **kein Rechnungsdokument** | **fehlt** — der Rechnungslauf erzeugt SevDesk-Entwürfe, es gibt keinen Rückweg ins Portal. Gesucht: `invoice`/`pdf`/`download` in `app/(partner)/partner/shop/**` und in `app/(partner)/partner/dateien/**` | `shop_invoice_candidates`, `record_shop_invoice` (`20260911083629_v3_shop_invoices.sql`) schreiben nur nach SevDesk; vgl. `partner-hub-rest.md`, Abschnitt „Alle Dateien" | | |

## 6 · Team: Katalogpflege

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Katalogquelle Airtable Product-Data (110 Items, 68 publiziert), Sync nach WooCommerce | `product` ist die Quelle; nach dem Import ist das Portal die Wahrheit, kein Sync | **anders**, einfacher | `product` (`20260910144439_v3_products.sql`, Tabellenkommentar); Import `scripts/import-products.mjs`, Referenzdaten `docs/referenz/item-liste-2026.csv` | | |
| Pflege je Artikel: Name, Beschreibung, Kategorie, Lieferant, EK, Marge, VK, Bestand, Sichtbarkeit | Produkte-Reiter im Partner-Admin mit allen Feldern, dazu Bündel-Stückliste | **vorhanden** | `app/(admin)/admin/partner/produkte/ProductEditor.tsx`; RPCs `admin_products`, `upsert_product`, `upsert_product_component` | | |
| Produktbilder im Shop-Backend hochladen | Bilder liegen im Bucket `product-images`, gepflegt über das Import-Skript — **nicht** im Admin | **fehlt** (im Admin) — der Editor zeigt `images` nicht als Feld. Gesucht: `images` in `ProductEditor.tsx` (nur als Vorgabewert `null`) | `20260911074852_v3_product_images_bucket.sql` („Pflege über Import-Skript/Admin"); `scripts/import-product-images.mjs` | | |
| „Auf Anfrage" = Artikel mit 0,00 € | dieselbe Ableitung (`net_price_cents = 0`) | **vorhanden** — mit dem Hinweis aus F4 §7 (57 preislose Artikel, davon 7 im sichtbaren Shop) | `shop_catalogue`, Spalte `request_only` | | |
| Bestand als Zahl in Airtable, „Amount Sold" nie gepflegt | Lagerbuch, nur anhängen; Team-Korrekturen möglich | **vorhanden**, besser | `stock_ledger` (`20260911070632_v3_shop.sql`) | | |
| Einheiten steckten im Artikelnamen („1qm Teppich") | `product.unit` als eigenes Feld (piece, sqm, m, package, hour, person, day) | **vorhanden**, besser | `20260910144439_v3_products.sql` | | |

## 7 · Team: Bestellungen, Auswertung, Produktion

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| „Exhibitor Shop – Order Overview" (Airtable, **leer** — toter Klon); Bestellungen mischten sich in Offer-Data | `/admin/partner/bestellungen`: Bestellungen je Edition mit Status, Positionen, interner Bemerkung | **vorhanden**, löst Befund 2.7/6 | `app/(admin)/admin/partner/bestellungen/OrdersView.tsx`; RPCs `shop_orders_admin`, `shop_admin_set_line`, `shop_admin_set_status` | | |
| Bestellungen landeten als Angebotszeilen (Offer-Data) beim Partner | Shop-Bestellungen sind **eigene** Objekte und erscheinen **nicht** unter „gebuchte Leistungen" (`org_product`) | **anders** — bewusst getrennt (Angebot ≠ Nachbestellung); Folge siehe nächste Zeile | `org_product` wird nur aus HubSpot/Deal/Kontingenten befüllt (`20260910170349`, `20260910170826`, `20260911074329`); `run_shop_finalization` schreibt dorthin nicht | | |
| Bestellliste für den Messebauer je Dienstleister | `/produktion/bestellungen` summiert je Lieferant — **aus `org_product`**, also **ohne** die Messeshop-Bestellungen | **fehlt** — was im Shop bestellt wurde, steht nicht in der Lieferantenliste. Gesucht: `shop_order_line` in `supabase/migrations/20260914094832_v4_produktion.sql` und `20260914104754` — kommt dort nicht vor | RPC `supplier_order_list` (`20260914104754_v4_produktion_ticketartikel.sql`); Seite `app/(produktion)/produktion/bestellungen/page.tsx`, CSV unter `…/csv/route.ts` | | |
| Rechnungsstellung: WooCommerce-Rechnungsdatei + Mail (eine der vier deployten Automationen) | Rechnungslauf im Admin erzeugt SevDesk-Entwürfe je Org über alle `completed`-Bestellungen, idempotent über `external_ref` | **anders**, mehr — Probelauf und Echtlauf getrennt | `OrdersView.tsx` (`invoices(dryRun)`); `shop_invoice_candidates`, `record_shop_invoice`; `lib/sevdesk/**` | | |
| Auswertung je Artikel / Umsatz | `shop_report` je Edition (nur `completed`) im Admin | **vorhanden** | RPC `shop_report` (`20260911070632_v3_shop.sql`) | | |
| Anfragen („auf Anfrage"-Artikel, Sonderwünsche) liefen per Mail an Konrad | Anfrageliste im Admin mit Antwort und Status; nach der Messestand-Frist läuft auch der Änderungswunsch hier ein | **vorhanden**, mehr | `shop_requests_admin`, `shop_request_answer`; Entscheidungslog 14.09./15.09. („Änderungswunsch als `shop_request_product(p_sku = null)`") | | |

---

## Fragen an Konrad

1. **Shop-Rollen Basic/Limited:** Im Alt-Shop sah nicht jede Org denselben Katalog. Wir haben das bewusst gestrichen (Hinweise stehen am Artikel). Gab es 2026 einen Fall, in dem eine Org etwas **nicht** sehen sollte — und war das eine Preis- oder eine Berechtigungsfrage?
2. **Rechnung für den Partner:** Soll die Messeshop-Rechnung im Portal sichtbar sein (wie im alten File-Hub), oder bleibt sie Sache der Mail aus SevDesk?
3. **Lieferantenliste:** Sollen die Messeshop-Bestellungen in `/produktion/bestellungen` einfließen — oder bestellt die Produktion beim Messebauer bewusst getrennt vom Shop?
4. **Drei Phasen statt zwei:** Der Alt-Shop hatte zwei Fristen, wir haben drei (Phase 3 nur Lunch-Paket und markierte Artikel). Stimmen die Daten 19.03. / 02.04. / 09.04.2027, und welche Artikel außer dem Lunch-Paket sollen in Phase 3 noch bestellbar sein?
5. **Erklär-Video und Einstieg:** Der Alt-Shop erklärte den Ablauf in drei Schritten mit Video. Reicht der Phasenhinweis, oder brauchen wir einen Einstieg mit Video (der Mechanismus liegt bereit)?
6. **Produktbilder:** Sie kommen heute nur über das Import-Skript ins Portal. Soll das Team Bilder im Produkte-Reiter selbst tauschen können?
7. **Paket-Bestandteile im Shop:** Soll man Einzelteile eines gebuchten Pakets im Shop **zusätzlich** kaufen können (Alt: ja, über dieselben Artikel), oder soll der Shop davon abraten?
8. **Preise:** Der Altbestand führt USt überall als „7" — für Mobiliar und Technik unplausibel. Welcher Satz gilt 2027 je Kategorie? (Betrifft den Rechnungslauf, nicht die Anzeige.)

## Nicht geprüft

- **Alles, was nur am Gerenderten sichtbar ist:** Lesbarkeit der Kategoriereiter, Verhalten des Warenkorb-Knopfs auf dem Telefon, Leerzustände, Dialoge (Merch-Konfiguration, Stornieren), Fehlermeldungen der RPCs in echter Anzeige.
- **Der Katalog Artikel für Artikel.** Dieser Abgleich vergleicht Mechanik, nicht Inhalt; ob alle 68 publizierten Artikel übernommen sind, entscheidet die Migration (`scripts/import-products.mjs`, `docs/referenz/item-liste-2026.csv`).
- **Datenschutzhinweis und Footer** des Alt-Shops gegen die Portal-Hülle.
- **Der Bestellweg gegen echte Daten:** Phasen, Lagerbuch und Finalisierung sind in Tests belegt, aber nicht mit Konrads Testorganisation durchgespielt.
- **SevDesk-Echtlauf.** Nur der Probelauf ist ohne Folgen; ob der Entwurf in SevDesk richtig aussieht, zeigt erst der erste echte Lauf.
