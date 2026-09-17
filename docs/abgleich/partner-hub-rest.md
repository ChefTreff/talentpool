# Abgleich · SoftR Partner Hub, der Rest → Partner-Portal

**Stand: 2026-09-17 · Entwurf der Architektur-Session (Codebefund, nicht am Gerenderten geprüft) · zur Prüfung durch Konrad im Walkthrough**

**Quellen (Altsystem):** `docs/legacy-inventar.md` §13.1 (Walkthrough Partner Hub, 08.09.), §2.4 (Seitenliste des Hubs), §2.5 (Countdowns, Automationen), §2.7 (Befunde), §3 (Hackathon-Base), §14 (Wiki und Chatbot „Chefi"), §16 (Item-Liste). **Neu:** `app/(partner)/partner/**`, `app/(hackathon)/**`, `app/(admin)/**`.

**Methode.** Diese Matrix nimmt die Seiten des alten Hubs auf, die `docs/feedback-runde-1-abgleich.md` (F4, 14.09.) **nicht oder nur halb** abdeckt; was dort schon steht, wird hier nur verfeinert oder verwiesen. Geprüft ist ausschließlich der Quelltext — der Befund sagt, was gebaut ist, nicht, wie es sich anfühlt.

**Regel (aus F4, gilt weiter):** Diese Matrix **benennt Lücken, sie schließt keine.** Nichts daraus wird gebaut, bevor du je Zeile entschieden hast.

**Was F4 bereits abgedeckt hat** (hier nicht wiederholt): Home, Onboarding & Kontakte, Tickets, Event App, Messestand/Rückwand, Messeshop (siehe `messeshop.md`), Bewerber, Standbühne. **Weiterhin als Lücke aus F4 offen und hier nur bestätigt:** Media Kit, Chatbot, Angebote/Rechnungen im Dateibereich, Hallenplan.

---

## 1 · Hackathon-Seite (alt `/hackathon`, sichtbar bei Product Type = Hackathon)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Menüpunkt „Hackathon" im Partner-Menü, sichtbar nur für Hackathon-Partner | **kein** Hackathon-Eintrag im Partner-Menü; wer beides hat, wechselt über den Portal-Umschalter | **anders** — gesucht: Hackathon-Schlüssel in `app/(partner)/partner/nav.ts` (`PartnerNavKey`) und Ordner `app/(partner)/partner/hackathon/`, beides nicht vorhanden | `app/(partner)/partner/nav.ts`; `app/(partner)/layout.tsx`; Bereich `lib/areas.ts` (Rollen `hackathon_participant`, `hackathon_partner`) | | |
| **Challenge-Formular** (Titel, Beschreibung, Kriterien) | Pflicht `hackathon_challenge` in der Partner-Checkliste, an das Produkt `I-37220` gebunden; Freigabe durch das Hackathon-Team, erst dann wird die Challenge sichtbar | **vorhanden**, mehr — mit Freigabe-Gate statt direkter Veröffentlichung | `deliverable_template` „hackathon_challenge" und `publish_hack_challenge` in `supabase/migrations/20260914095624_v4_hackathon.sql`; Team-Sicht `app/(hackathon)/hackathon/teams/TeamsView.tsx` | | |
| **Preise** (was der Partner auslobt) | Feld `prizes` im Challenge-Formular und in `hack_challenge` | **vorhanden** | `hack_challenge.prizes`, Formularfeld `prizes` in derselben Migration | | |
| Mentoren, Ressourcen, Bewertungskriterien | Felder `mentors`, `resources`, `criteria` (Schlüssel, Beschriftung, Gewicht) | **vorhanden**, mehr — Gewichte fließen in die Bewertung | `hack_challenge`; RPCs `hack_judging`, `set_hack_score`; `app/(hackathon)/hackathon/judging/` | | |
| **Speed-Dating** (Termine Partner × Teams) | — | **fehlt** — gesucht: `speed-dating`, `speeddating` in `app/`, `lib/`, `components/`, `supabase/`; nur in `docs/legacy-inventar.md` und `docs/fragenkatalog-2026-09-07.md` | — | | |
| **Hackathon-Backdrop** (eigener Upload für die Hackathon-Fläche) | — | **fehlt** — gesucht: `hackathon_backdrop`; `backdrop_print` gibt es nur für die Messestand-Rückwand an den Stand-SKUs | `deliverable_template` „backdrop_print" in `supabase/migrations/20260910163331_v3_partner_deliverables.sql` | | |
| **Team-Formular** (Partner meldet sein Hackathon-Team an) | — | **fehlt** — Teams bilden sich selbst (`create_hack_team`, `join_hack_team` arbeiten auf der angemeldeten Person); der einzige Org-Bezug im Hackathon ist `hack_challenge.org_id` | `supabase/migrations/20260914095624_v4_hackathon.sql` | | |
| Countdowns 20.03. / 31.03. / 06.04. (hartcodiert in SoftR) | Frist der Challenge-Pflicht aus `due_rule` | **fehlt** — die Vorlage nutzt `{"weeks_before": 8}`, `deliverable_due` kennt nur `deadline_key` und `offset_days` ⇒ die Pflicht bleibt **ohne Frist** und wird nie überfällig | `deliverable_due` in `supabase/migrations/20260910163331_v3_partner_deliverables.sql` gegen die Vorlage in `20260914095624_v4_hackathon.sql` | | |
| — | Admin-Oberfläche für den Hackathon | **fehlt** — Verwaltung nur über `/hackathon/teams`; `app/(admin)/layout.tsx` sagt es selbst: „Hackathon und Produktion haben noch keine Admin-Seite" | `app/(admin)/layout.tsx` | | |

## 2 · Media Kit (alt `/media`)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Seite „Media Kit" mit Marken-Material zum Download | — | **fehlt** (bestätigt F4, Lücke 1) — gesucht: `mediakit`, `media_kit`, `media-kit` in `app/`, `lib/`, `components/`, `supabase/`, `scripts/`: kein Treffer außerhalb der Doku | — | | |
| **Partnergrafik** („Wir sind dabei"-Grafik, erzeugt über Remove.bg + Placid) | — | **fehlt** — gesucht: `partnergrafik`, `partner_graphic`, `placid`, `share_graphic`, `og_image`: kein Treffer | Alt-Automation beschrieben in `docs/legacy-inventar.md` §2.5 | | |
| (speakerseitiges Gegenstück: Bühnenfotos, persönliche Speaker-Grafik) | — | **fehlt** — dieselbe Lücke, siehe `docs/feedback-runde-1-abgleich.md` §1 und §5 Punkt 1 | — | | |
| Logos des Partners für die Website | Logo-Pflichten `logo_vector` / `logo_png`, Veröffentlichung nach Sanity | **vorhanden**, andere Richtung — das Portal **liefert** Logos, es gibt keine Marken-Mediathek für den Partner | `docs/runbooks/sanity-partner-logos.md`; Migration `20260911113609_v3_logo_png_public_bucket.sql` | | |

## 3 · Alle Dateien / File-Hub (alt `/filehub`)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Liste aller Dateien der Organisation | `/partner/dateien` mit Fassungen, Prüfstatus und Prüfhinweis | **vorhanden**, mehr — Versionen und Freigabe gab es im Alt-Hub nicht | `app/(partner)/partner/dateien/page.tsx`, `FileList.tsx`; RPC `my_partner_assets` (`20260911085655_v3_deliverable_extras.sql`); Bucket `partner-assets`, Signed URL 60 s | | |
| **Angebot** (aus SevDesk) | — | **fehlt** — die Seite sagt es selbst: „Angebot und Rechnung kommen später dazu." | `lib/i18n/de.json`, Schlüssel `partnerFiles.invoicesSoon`; gerendert in `app/(partner)/partner/dateien/page.tsx` | | |
| **Rechnung** und **Messeshop-Rechnung** | — | **fehlt** — SevDesk-Anbindung läuft nur in eine Richtung (Entwurf raus); kein Dokumentenabruf, keine Ablage, keine Leserechte für Partner | `lib/sevdesk/client.ts`, `shop-invoices.ts` (kein GET/PDF); `20260911083629_v3_shop_invoices.sql` entzieht `external_ref` alle Grants | | |
| **Logo** und **Rückwand** im Dateibereich | erscheinen in der Liste, weil sie Pflichten sind (`logo_vector`, `logo_png`, `backdrop_print`) | **vorhanden** | `20260910163331_v3_partner_deliverables.sql` | | |
| **„Other files" — freier Upload** durch den Partner | kein freier Upload; Uploads laufen nur über eine Pflicht (Checkliste, Rückwand) | **anders / fehlt** — gesucht: Upload-Feld in `app/(partner)/partner/dateien/**` (keins); Uploads nur über `registerPartnerAsset` aus `checkliste/ChecklistView.tsx` und `messestand/Rueckwand.tsx` | `app/(partner)/partner/actions.ts` | | |

## 4 · Masterclass-Sichtbarkeit (alt: Seite nur bei gekauftem Item I-33783)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Menü und Seiten werden über das gekaufte Produkt freigeschaltet (User-Group je Product Type) | dasselbe Prinzip, aber aus den gebuchten Leistungen abgeleitet: `visibleNavKeys` entscheidet je Schlüssel | **vorhanden**, sauberer — „folgt aus den gebuchten Leistungen, nicht aus Rollen und nicht aus manuellen Freischaltungen" | `app/(partner)/partner/nav.ts` (`visibleNavKeys`), `app/(partner)/layout.tsx`; Datenquelle `partner_overview` (`20260911075953_v3_partner_overview_sessions.sql`); Tests in `tests/partner.test.ts` | | |
| **Eigene Masterclass-Seite** (Bewerbungen, Teilnehmerliste, Termin) | `/partner/bewerber` erscheint, sobald der Org eine Session gehört (`sessions_count > 0`) — deckt Masterclass, Company Tour und andere Formate gemeinsam ab | **anders** — ein Bereich für alle gastgebenden Formate statt einer Seite je Produkt; die SKU `I-33783` kommt im Code nicht vor | `nav.ts` (Schlüssel `applicants`); `session.host_org_id` in `partner_overview` | | |
| Masterclass-Bewerbungen: Partner sah alle Bewerberdaten, Klick löste direkt Mails aus | Auswahl mit Freigabe-Gate und Audit | **anders**, mit Absicht — Querschnittsbefund 12 des Inventars (Consent-Gate, Datenminimierung) | `app/(partner)/partner/bewerber/`; `docs/legacy-inventar.md` §7.12 | | |
| Standbühne / Stage-Produkte | `/partner/buehne` an `has_stage` bzw. SKU `I-79895` | **vorhanden** | `app/(partner)/partner/nav.ts` (`STAGE_SKU`) | | |

## 5 · Partner-Shop-Seite im Hub (alt `/messeshop`: Linkseite mit Login-Daten und Countdowns)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Linkseite zum WooCommerce-Shop mit **Login-Daten** der Organisation | entfällt — der Shop ist ein Bereich desselben Portals | **bewusst weggelassen** („drei Logins → einer", Antwort 45); kein WooCommerce-Bezug im Code (gesucht: `woocommerce`, `woo_`) | `app/(partner)/partner/shop/**`; Einzelheiten in `docs/abgleich/messeshop.md` §1 | | |
| **Countdowns** zu den Bestellphasen auf der Hub-Seite | Phasenhinweis auf jeder Shop-Seite, Frist aus `deadline` | **vorhanden** | `app/(partner)/partner/shop/PhaseBanner.tsx`; RPC `shop_phase_info` → `shop_phase` (`20260911070632_v3_shop.sql`) | | |
| Wiki-Verweis neben dem Shop-Link | Wiki ist ein eigener Bereich, im Shop nicht verlinkt | **anders** — siehe `messeshop.md` §2 | `app/(partner)/partner/wiki/page.tsx` | | |
| Fristen auf der Startseite als Countdown | Dashboard zeigt kommende Fristen mit Countdown | **vorhanden** | `components/ui/Countdown` in `app/(partner)/partner/page.tsx`, Quelle `partner_overview.deadlines` | | |

## 6 · FAQ & Wiki mit Chatbot (alt `/faq`)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Notion-Wiki-Embed, 26 Artikel, Kategorie-Filter, **ohne** Zielgruppentrennung (Speaker-Artikel für Partner sichtbar) | `/partner/wiki` mit Zielgruppen, Rollen, Phase und Editions-Overlay | **vorhanden**, besser | `components/wiki/WikiPage.tsx`, `WikiView.tsx`; Tabelle `kb_article` in `20260914095053_v4_wissensbasis.sql`; RPC `kb_articles` | | |
| Artikel-Inhalte | zehn Artikel aus dem Notion-Wiki übernommen — **als Entwurf**, weil sie FLS26-Daten tragen | **anders** — 10 der 26 Artikel, keiner veröffentlicht; Freischalten ist deine Aufgabe (Feedback-Runde 2, Teil 4, „Offen für Konrad") | `20260915114852_v5_wiki_inhalte.sql`; Redaktion unter `/admin/wiki` | | |
| Kategorie-Filter im Embed | Suche und Phasen-Auswahl im Browser über die geladenen Artikel | **anders** — keine Volltextsuche in der Datenbank (gesucht: `tsvector`, `to_tsquery`, `websearch` in allen Migrationen: kein Treffer) | `components/wiki/WikiView.tsx` (Filter über Titel und Text) | | |
| **Chatbot „Chefi"** (Chatbase-Embed), erster Anlaufpunkt auf beiden Hubs | — | **fehlt** (bestätigt F4 §3) — gesucht: `chefi`, `chatbot`: kein Code-Treffer. Auch die Grundlage fehlt: `kb_chunk`/pgvector sind ausdrücklich zurückgestellt | Kommentar in `20260914095053_v4_wissensbasis.sql`: „`kb_chunk`/pgvector und der Chatbot bleiben Welle 5"; Entscheidungslog (Chatbot als Entscheidung nach Go-live) | | |

## 7 · Checklist & Deadlines (alt: Menüpunkt vorhanden, Tabellen nie gebaut)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Menüpunkt „Checklist & Deadlines" — im Alt-Hub **nicht gebaut** (Befund §2.7/1) | `/partner/checkliste`: Pflichten je gebuchtem Produkt, Frist, Status, Upload mit Dateiregeln, Formularfelder | **vorhanden** — die größte Verbesserung gegenüber dem Alt-Hub | `app/(partner)/partner/checkliste/`; RPC `my_deliverables`; `deliverable`, `deliverable_template`, `partner_asset` in `20260910163331_v3_partner_deliverables.sql` | | |
| Fristen als hartcodierte SoftR-Countdowns (13.03. Rückwand, 31.03. Tickets …) | `deadline` je Edition; Pflichten ziehen ihre Frist über `due_rule` | **vorhanden**, besser | `deliverable_due`; Fristen-Saat in `20260910144439_v3_products.sql` | | |
| Kein Reminder-Mechanismus (§2.5) | Erinnerungs-Digest je Organisation, Überfälligkeit automatisch | **vorhanden**, neu | `send_partner_reminders`, `mark_overdue_deliverables` in `run_partner_housekeeping` | | |
| Pflichten entstehen von Hand | Trigger auf `org_product` legt sie an; entfallene Vorlagen werden `not_required` | **vorhanden**, neu | `sync_deliverables`, `template_applies` (`20260910163331_v3_partner_deliverables.sql`) | | |

---

## Fragen an Konrad

1. **Hackathon im Partner-Menü:** Ein Hackathon-Partner sieht heute keinen Hackathon-Eintrag im Partner-Portal, sondern wechselt über den Umschalter. Reicht das, oder soll das Partner-Menü einen Einstieg bekommen?
2. **Speed-Dating:** Gab es das 2026 wirklich als Funktion (Termine, Zuordnung), oder war die Hub-Seite nur Information? Davon hängt ab, ob das eine Bauaufgabe ist.
3. **Hackathon-Backdrop:** Eigener Upload für die Hackathon-Fläche — brauchen wir den 2027, oder reicht die Messestand-Rückwand?
4. **Frist der Challenge:** Die Challenge-Pflicht hat heute keine Frist. Welches Datum gilt 2027 (alt: 20.03. / 31.03. / 06.04.)?
5. **Media Kit:** Was gehört hinein — Logos und Marken-Material zum Herunterladen, die persönliche Partnergrafik, oder beides? Und wer pflegt es?
6. **Angebot und Rechnung im Portal:** Soll der Partner seine Dokumente im Dateibereich sehen (dafür müssten wir SevDesk auch lesen), oder bleibt es bei der Mail?
7. **Freier Upload:** Der Alt-Hub hatte „weitere Dateien hochladen". Braucht es das, oder sind Uploads bewusst immer an eine Pflicht gebunden?
8. **Chatbot:** Bleibt „Chefi" ein Ziel für 2027? Die Wiki-Struktur trägt ihn, die Indexierung (`kb_chunk`) wäre der nächste Schritt — das ist eine Produkt- und Kostenentscheidung, keine Bauaufgabe.

## Nicht geprüft

- **Alles, was nur am Gerenderten sichtbar ist:** Menüführung bei verschiedenen Produktzuschnitten, Leerzustände, Dialoge, Wortlaute.
- **Die Hackathon-Partner-Sicht mit echten Daten** — Konrads Testkonto hat keine Hackathon-Leistung; die Zeilen dieses Abschnitts sind Codebefunde.
- **Die Bewerber-Sicht** (`/partner/bewerber`) — laut F4 „am Testkonto nicht auslösbar", weil der Testorganisation Formate fehlen.
- **Die verbleibenden 16 Wiki-Artikel** aus dem Notion-Bestand: ob sie 2027 noch stimmen, entscheidet die Redaktion, nicht dieser Abgleich.
- **Der alte Hub selbst** wurde nicht erneut aufgerufen. Grundlage ist der dokumentierte Walkthrough vom 08.09.; die dort als „Inhaltsblock leer/nicht geladen" vermerkten Stellen (`/filehub`, nutzerbezogene Listen) bleiben unsicher.
