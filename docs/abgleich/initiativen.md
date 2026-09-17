# Abgleich · Airtable-Base Initiativen → Partner-Portal als Partner-Typ „Initiative"

**Stand: 2026-09-17 · Entwurf der Architektur-Session (Codebefund, nicht am Gerenderten geprüft) · zur Prüfung durch Konrad im Walkthrough**

**Quellen (Altsystem):** `docs/legacy-inventar.md` §4 (Base `app7yb6gSbHl6kqVg`: Applications & Outreach, Onboarding-Data, Freitickets, PhD, Award, Messestand, Ticketholder-Tabellen), §2.1 (Tabelle „Initiativen Alle Bewerbungen" in der Partner-Base), §7 (Querschnittsmuster 1–3), §16 (Item-Liste). **Entscheidungen:** Entscheidungslog D („Initiativen: Partner-Portal mit Org-Typ Initiative + Produkt Initiativen-Partnerschaft"), Antwort 21, `docs/arbeitsauftrag-welle-3.md` Punkt 11, `docs/masterplan.md` Welle 4. **Neu:** `app/(partner)/**`, `app/(admin)/admin/partner/**`, Migrationen.

**Methode.** Zeile = eine Tabelle oder ein Mechanismus der Initiativen-Base; daneben, was das Partner-Portal davon heute trägt, mit Beleg im Code. Diese Matrix beantwortet die Frage aus dem Ergänzungsplan §3: **trägt der Partner-Typ wirklich alle Initiativen-Fälle?**

**Regel (aus F4, gilt weiter):** Diese Matrix **benennt Lücken, sie schließt keine.** Nichts daraus wird gebaut, bevor du je Zeile entschieden hast.

**Kurzantwort vorweg:** Das **Onboarding** einer Initiative trägt das Portal heute (Logo, Beschreibung, Kontakte, Rechnungsdaten, Checkliste, Standnummer). Was **davor** und **daneben** liegt, trägt es nicht: Bewerbungs- und Agreement-Strecke, Barter-Deal ohne Rechnung, der 50-%-Code, Beachflag, Volunteers-Zusage, Award und die Tagesbelegung eines Standes.

---

## 1 · Organisationstyp und Steuerung

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Eigene Base je Zielgruppe (Initiativen getrennt von Partnern) | eine `organization`-Tabelle mit `type` | **vorhanden** — Querschnittsmuster 1 des Inventars umgesetzt | `organization.type` (`supabase/migrations/20260908141744_v2_identity_roles.sql`) | | |
| Typ „Initiatives" / „Universities & Foundations" | Vokabular `organization_type`: corporate, startup, **initiative**, **university**, agency, media, public, **foundation**, service | **vorhanden** | `20260908145110_v2_seed_vocab_fls27.sql`; Ergänzungen `20260911120247_v3_vocab_org_type_foundation.sql`, `20260911121546_v3_vocab_org_type_service.sql` | | |
| Typ am Datensatz pflegen | — | **fehlt** — `organization.type` wird **nur beim ersten HubSpot-Ingest** gesetzt (`coalesce(…, 'corporate')`), der Aktualisierungszweig fasst ihn nicht an; es gibt keine RPC und keine Oberfläche, die ihn ändert. Gesucht: `org_type` in `app/`, `components/` — kommt nur in Typdefinitionen vor, wird nirgends angezeigt | `ingest_partner_deal` in `20260911074329_v3_ticket_allocations.sql`; `update_partner_onboarding` in `20260910163331_v3_partner_deliverables.sql`; `lib/hubspot/mapping.ts` (`ORG_TYPES`) | | |
| Initiativen als eigene Liste/Ansicht | — | **fehlt** — `/admin/partner` zeigt weder Typ-Spalte noch Filter, obwohl `partner_admin_overview` `org_type` liefert. Der Arbeitsauftrag B9 sah „Initiativen als Filter (Org-Typ)" vor | `app/(admin)/admin/partner/page.tsx`; RPC `partner_admin_overview` (`20260910163331_v3_partner_deliverables.sql`) | | |
| Produkt „Initiativen-Partnerschaft" (Entscheidung D) | — | **fehlt** — im Produktstamm gibt es keinen Artikel für Initiativen (gesucht: „initiativ", „partnerschaft", „barter" in `docs/referenz/item-liste-2026.csv`: kein Treffer). Nächstliegend ist `I-65476` „All-Inclusive Stand – Start-Up (1,5 qm)" zu 2.900 € netto | `docs/referenz/item-liste-2026.csv`; `20260915115415_v5_messestand.sql` (`area_sqm = 1.5`) | | |
| Eigener Bereich/Login für Initiativen | Initiativen laufen im Partner-Portal | **bewusst weggelassen** (Entscheidungslog D, Antwort 21) — die Bereichsliste kennt kein `initiative` | `lib/areas.ts` | | |

## 2 · Applications & Outreach (Akquise-Funnel, 84 Zeilen)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Bewerbung einer Initiative (Status New → Accepted / Refused) | — | **fehlt** — `application` ist rein personenbezogen (Person × Session, kein `org_id`); `20260910173421_v3_partner_applications_stages.sql` heißt zwar „partner_applications", regelt aber die **Talent**-Bewerbungen auf Partner-Formate | `application` in `20260908144639_v2_application_ticket.sql`; `partner_applications` in `20260910173421` | | |
| **Öffentliches Bewerbungsformular** (Inbound, Uni-Formular) | — | **fehlt** — es gibt keine öffentliche Strecke: öffentlich sind nur `/`, `/login`, `/tickets/bestaetigung` und die CSP-Route | `proxy.ts` (`PUBLIC_PATHS`) | | |
| Felder Inbound/Outbound, University, # Members, Background (13 Werte) | — | **fehlt** — kein Feld an `organization` oder `org_edition`; Hintergrund/Themen gibt es nur bei Personen | `organization` (`docs/schema.md` §`organization`) | | |
| **Agreement-Strecke** (Send Offer → Negotiation → Onboarding Filled), Agreement-PDF/DOCX | nur `org_edition.onboarding_status` mit vier Werten: none · invited · filled · call_done | **fehlt** — das beginnt **nach** dem Abschluss. Kein Angebots- oder Vertragsdokument an der Organisation (das Vokabular `doc_type` kennt `offer`, hängt aber an keiner Org) | `org_edition` in `20260910162431_v3_partner_org_context.sql`; `20260721160705_seed_vocab.sql` | | |
| Akquise insgesamt | läuft in HubSpot; das Portal übernimmt den fertigen Deal | **anders**, mit Absicht (Pipeline-Bruch aus Befund §2.7/5 bleibt bestehen — jetzt aber mit klarer Grenze) | `ingest_partner_deal`; `partner_deal` (`20260910170826_v3_partner_deal.sql`); `event.hubspot_pipeline_id`/`stage` | | |
| **Barter-Deal: Leistung gegen 0 €** | — | **fehlt** — Leistungen entstehen ausschließlich aus HubSpot-Line-Items; es gibt keinen Weg, einer Org ohne Deal Leistungen zuzuweisen, und im Shop ist „kein Kauf zu 0 €" ausdrücklich Regel | `org_product` (`20260910162431_v3_partner_org_context.sql`); `shop_upsert_line` weist `net_price_cents = 0` mit `request_only` ab (`20260911070632_v3_shop.sql`) | | |
| Rechnungsadresse im Bewerbungsformular | `org_edition.invoice_*` im Onboarding | **vorhanden** | `20260910162431_v3_partner_org_context.sql` | | |

## 3 · Onboarding-Data (aktive Initiativen, 82 Zeilen)

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Anzeige-, Rechts- und Kommunikationsname | `organization.legal_name`, `communication_name` | **vorhanden** | `docs/schema.md` §`organization` | | |
| Beschreibung, Logo (SVG) | Pflichten `logo_vector` und `logo_png` in der Checkliste, versioniert, mit Prüfung | **vorhanden**, besser | `deliverable_template` in `20260910163331_v3_partner_deliverables.sql`; `20260911113609_v3_logo_png_public_bucket.sql` | | |
| Zwei Kontakte je Initiative | Kontakte mit Rollen (`primary_ops`, `additional`, `signing`, `event_app_member`), genau ein Hauptkontakt | **vorhanden**, mehr | `org_membership` in `20260910162431_v3_partner_org_context.sql`; `/partner/kontakte` | | |
| **Partnergrafik** je Initiative | — | **fehlt** — dieselbe Lücke wie bei Partnern und Speakern, siehe `partner-hub-rest.md` §2 | — | | |
| **~20 Kommunikations-Checkboxen** (je Mailing eine Spalte) | Mail-Protokoll und Erinnerungs-Digest | **anders**, besser — Querschnittsmuster 5 (`communication_log`) ist als `mail_log` umgesetzt | `mail_log`; `send_partner_reminders` in `run_partner_housekeeping` | | |
| Logo-Placement | `org_edition.sponsoring_level` mit Rang-Vokabular steuert die Reihenfolge auf Website und Event-App | **anders** — die Rangfolge steuert die Reihenfolge, ein eigenes Placement-Feld („wo genau") gibt es nicht | `20260915112530_v5_sponsoring_level_vokabular.sql`; `event_app_exhibitors`; `docs/runbooks/sanity-partner-logos.md` | | |
| Standnummer der Initiative | `booth.booth_number`, gepflegt von Partner-Team oder Produktion | **vorhanden** | `booth` in `20260910163331_v3_partner_deliverables.sql`; `upsert_booth` in `20260915115415_v5_messestand.sql` | | |

## 4 · Kontingente, Codes, Freitickets

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Kontingent je Initiative (# Tickets vs. Redeemed) | `org_ticket_allocation` mit `quantity`, `used_count`, Coupon, Undershop-Link, Status | **vorhanden**, besser — der Einlöse-Stand wird aus den Tickets nachgezählt statt von Hand gepflegt | `20260908144639_v2_application_ticket.sql`; `20260911074329_v3_ticket_allocations.sql`; `recount_allocation_usage` in `20260912082615_v4_allocation_undershop_usage.sql` | | |
| **100-%-Rabattcode** | Coupon mit 100 % | **vorhanden** | `couponFields()` in `lib/vivenu/allocations.ts` (`discountType: "var"`, `discountValue: 1`) | | |
| **50-%-Rabattcode** (zweiter Code derselben Initiative) | — | **fehlt** — `org_ticket_allocation` hat **kein Feld für einen Rabattsatz**; 100 % steht fest im Code. Zwei Kontingente je Org sind nur über **verschiedene Pass-Typen** möglich (`unique (event_id, org_id, pass_type)`), nicht über verschiedene Rabatte. Gesucht: `discount`, `percent`, `rabatt` in allen Migrationen — nur `coupon_code`, `vivenu_coupon_id`, `vivenu_discount_id` | `org_ticket_allocation`; `set_ticket_allocation` (ändert Menge, Code, Link, Status, Notiz — keinen Satz) | | |
| Kontingente von Hand anlegen | entstehen automatisch aus gebuchten Ticket-Produkten | **anders** — ohne Ticket-Produkt im Deal gibt es kein Kontingent; für eine Initiative ohne Deal also gar keins | `sync_ticket_allocations` + Trigger `trg_org_product_allocations` (`20260911074329`) | | |
| Tabelle „Initiativen – Freitickets": **wer** hat eingelöst (Mail, Status, Plus One, Volunteering) | nur der Zähler „N von M eingelöst" | **fehlt** — es gibt keine RPC, die Ticketzeilen je Organisation herausgibt (alle 18 Ticket-Funktionen geprüft); kein „Plus One" außer dem Speaker-Begleitticket | `my_ticket_allocations`, `ticket_allocations_admin`; Partneransicht `app/(partner)/partner/tickets/TicketView.tsx` | | |
| „Alle Ticketholder" / Ticketholder je Universität (TUHH, Rostock, Leuphana, KLU) | — | **fehlt** — `person.university` ist Freitext ohne Verknüpfung zu einer `organization` vom Typ `university`; keine Auswertung je Uni | `person.university` (`20260721160701_core_schema.sql`); `app/(talent)/profil/ProfileForm.tsx` | | |

**Vorlage, falls die Einlöse-Liste gebaut werden soll:** Bei den Volunteers gibt es das Muster schon personengebunden — eigener Code je Person, Status none → issued → redeemed, Liste der Nicht-Einlöser, Erinnerungsmail (`supabase/migrations/20260914095318_v4_volunteer_tickets.sql`: `volunteer_tickets_admin`, `remind_volunteer_tickets`). Es fehlt nur die Klammer „Kontingent einer Organisation".

## 5 · Messestand, Mini-Booth, Beachflag

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Mini-Booth 1,5 qm für Initiativen | Produkt `I-65476` „All-Inclusive Stand – Start-Up (1,5 qm)", `area_sqm = 1.5`, Ausstattung als Stückliste; Anzeige auf `/partner/messestand` | **vorhanden** (als Startup-Paket) | `20260915115415_v5_messestand.sql`; `product_component`; `app/(partner)/partner/messestand/` | | |
| **Beachflag** als Leistung | — | **fehlt** als Produkt, Komponente oder Pflicht — sie steht nur im Beschreibungstext des Startup-Stands. In der Stückliste (`docs/referenz/product-bundles-2026.csv`) enthält `I-65476` Gitterbox, Strom und zwei Hocker, **keine** Beachflag. Ohne eigene Zeile gibt es auch keinen Druckdaten-Upload dafür | `docs/referenz/item-liste-2026.csv` (Beschreibung von `I-65476`); gesucht: „beachflag", „beach_flag" in `supabase/`, `app/`, `lib/`, `components/`: kein Treffer | | |
| **Messestand-Tabelle: zwei Initiativen teilen sich einen Stand, Tag 1 / Tag 2** | — | **fehlt** — `booth` hat `unique (org_edition_id)`: genau ein Stand je Organisation und Edition, ohne Tagesbezug. `event_day` ist mit `booth` nicht verknüpft | `booth` in `20260910163331_v3_partner_deliverables.sql`; `event_day` in `20260908142441_v2_edition_programme.sql`; `exhibitor_list` in `20260915115415` | | |
| Standliste mit Logos (Airtable-Share) | `exhibitor_list()` je Edition (Organisation, Standnummer, Typ, Segment, Paket) — **ohne Logo** | **anders** — bewusste Abweichung, weil die Logos im Bucket je Organisation liegen (Entscheidungslog 15.09., Abweichung 2) | `20260915115415_v5_messestand.sql` | | |
| Rückwand / Druckdaten | Pflicht `backdrop_print` mit Maßen, Frist und Versionen | **anders** — sie hängt an den vier großen Stand-SKUs (I-39709, I-50131, I-39740, I-79031), **nicht** am Startup-Paket `I-65476`. Eine Initiative mit Mini-Booth bekommt also keine Druckdaten-Pflicht — richtig, solange sie eine Beachflag statt einer Rückwand hat | `deliverable_template` „backdrop_print" in `20260910163331_v3_partner_deliverables.sql` | | |

## 6 · Volunteers, Award, PhD

| Alte Seite / Funktion | Neu (Pfad) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| **Initiative stellt N Volunteers** (Teil des Barter-Deals) | — | **fehlt** — `volunteer_profile` hängt nur an Person × Edition; in allen Volunteer-Migrationen und in `lib/volunteers/` kommt kein `org_id` vor. Auch kein Volunteer-Produkt und keine Volunteer-Pflicht in der Partner-Checkliste | `volunteer_profile` (`20260911165420_v4_volunteers.sql` ff.) | | |
| **Initiativen-Award**: Einreichung (Mission, Gründungsjahr, Bilder, Einwilligung) | — | **fehlt** — gesucht: `award`, `vote`, `voting`, `abstimm`, `jury`, `ballot`. Treffer nur: Hackathon-Judging (Jury bewertet Teams, nicht Publikum, ohne Org-Bezug) und `session_format = 'award'` als Programm-Etikett | `hack_judging_score` (`20260914095624_v4_hackathon.sql`); `session_format` in `20260908145110_v2_seed_vocab_fls27.sql` | | |
| Award-Abstimmung (Stimmen zählen) | — | **fehlt** — keine Voting-Tabelle | — | | |
| **PhD-Breakfast** (Zielgruppe, Karrierelevel, Studiengang, CV) | — | **fehlt** — gesucht: `phd`, `breakfast`, `doktorand`: nur „VC Breakfast" als Text in einem Wiki-Artikel | `20260915114852_v5_wiki_inhalte.sql` | | |
| Masterclass-Einladungen an Ticketholder | Bewerbung und Auswahl über `application` + `/partner/bewerber` | **anders**, besser — Angebot als eigenes Objekt statt Spaltenpaar (Querschnittsmuster 11) | `application`; `partner_applications` | | |

---

## Fragen an Konrad

1. **Trägt der Partner-Typ die Initiativen?** Nach diesem Befund: das Onboarding ja, der Deal davor nein. Reicht es, Initiativen wie Partner **nach** dem Abschluss zu führen (Anlage durch das Team, Akquise in HubSpot), oder braucht das Portal eine eigene Bewerbungs- und Agreement-Strecke?
2. **50-%-Codes:** Braucht FLS27 zwei Rabattstufen je Initiative? Wenn ja, ist das eine Datenmodell-Änderung (Rabattsatz je Kontingent) und betrifft auch die Vivenu-Anbindung.
3. **Barter:** Wie soll eine Leistung ohne Rechnung entstehen — als HubSpot-Deal mit 0 €, oder braucht das Portal einen Weg, einer Organisation Leistungen direkt zuzuweisen?
4. **Produkt „Initiativen-Partnerschaft":** Soll es das als eigene SKU geben (mit eigener Checkliste), oder bekommen Initiativen das Startup-Paket `I-65476`?
5. **Beachflag:** Eigene Leistung mit Druckdaten-Upload, oder bleibt sie Teil der Paketbeschreibung?
6. **Ein Stand, zwei Initiativen, zwei Tage:** War das 2026 die Regel oder die Ausnahme? Davon hängt ab, ob `booth` ein Tagesmodell braucht.
7. **Volunteers aus Initiativen:** Soll die Zusage („wir stellen 5") im Portal stehen — als Checklistenpunkt der Initiative, oder bleibt es eine Absprache?
8. **Award:** Bewerbung und Abstimmung gehören heute nirgendwohin. Läuft der Award 2027 wieder, und wenn ja: intern (Jury) oder öffentlich (Stimmen)?

## Nicht geprüft

- **Die Airtable-Base selbst** wurde nicht erneut geöffnet. Grundlage ist `docs/legacy-inventar.md` §4 (Stand 08.09.); Feldlisten und Zeilenzahlen stammen von dort.
- **Der gelebte Ablauf 2026** — wie viel von der Base wirklich benutzt wurde (die Freitickets-Tabelle deckte laut Inventar nur zwei Initiativen ab, die vier Uni-Tabellen sind identische Klone). Was davon FLS27 noch braucht, kann nur dein Walkthrough sagen.
- **Die Partneransicht mit einer Initiative** als Testorganisation — im Portal gibt es heute keine Org vom Typ `initiative` zum Ausprobieren; alle Zeilen sind Codebefunde.
- **Wie ein Initiativen-Kontingent in Vivenu aussieht** (Undershop, Coupon, Einlösung) — nur der 100-%-Fall ist im Code belegt, der Praxistest steht aus.

## Antworten Konrad (Walkthrough 17.09.2026)
17. **Eigene Strecke im Admin, wie ein CRM** (Funnel Bewerbung → Gespräch → Agreement → Onboarding); Initiativen sind nie in HubSpot → ADM-022.
18. **Zwei Rabattstufen (100 %/50 %) je Initiative** → Datenmodell-Änderung (Rabattsatz je Kontingent, vivenu-Codes) → ADM-022, Architektur-Session.
19. **Leistungen direkt im Portal zuweisen** (Barter ohne Deal) → ADM-022.
20. **Eigene SKU „Initiativen-Partnerschaft“** mit eigener Checkliste → ADM-022.
21. **Beachflag als eigene Leistung** mit Druckdaten-Upload → ADM-022.
22. **Zwei Tage sind die Regel, die Hälfte der Plätze tageweise** → ein Produkt für zwei Tage, eins für einen Tag; Stand tagesweise teilbar → Datenmodell (`booth` je Tag), Architektur-Session.
23. **Volunteer-Zusage als Checklistenpunkt** → ADM-022.
24. **Öffentlicher Award: ja** → ADM-024 (P3).
