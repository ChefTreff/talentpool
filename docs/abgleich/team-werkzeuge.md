# Abgleich-Matrix · Team-Werkzeuge (Airtable-Interfaces, Google Sheets, Automationen) ↔ Team-Seiten der Plattform

**Stand: 2026-09-17 · Entwurf der Architektur-Session (Codebefund, nicht am Gerenderten geprüft) · zur Prüfung durch Konrad im Walkthrough**

**Quellen.** Alt: `docs/legacy-inventar.md` §1 (Speaker & Programm, insbesondere 1.4 Pipeline, 1.5 Manager-Scoping, 1.7 Automationen), §2 (Partner), §3 (Hackathon), §4 (Initiativen), §5 (Volunteering), §7 (Querschnitt), §8 (Side-Formate), §10 (make.com, nur Konsequenzen), §11 (Regieplan-Sheet), §14/§14.1 (Wikis), §15 (Master-Programm-Sheet), §16 (Item-Liste). Neu: Seitenbaum des Repos (`app/(admin)/**`, `app/(speaker-leads)/**`, `app/(produktion)/**`, `app/regie/**`, `app/(hackathon)/**`), die zugehörigen RPCs in `supabase/migrations/*.sql`, `docs/schema.md`, `lib/areas.ts`. Bereits entschieden: `docs/entscheidungen.md` ab 11.09.2026, `docs/feedback-runde-2-2026-09-14.md`, `docs/speaker-portale-abgleich-2026-09-15.md`, `docs/speaker-felder-abgleich-2026-09-15.md`. Auftrag und Kandidatenliste: `docs/plan-ergaenzung-2026-09-17.md` §3 und §5.5.

**Methode.** Zeile = eine alte Sicht, ein altes Feld oder eine alte Automatisierung. Gelesen wurde der Quelltext, nicht die gerenderte Seite — anders als bei `docs/feedback-runde-1-abgleich.md` (F4), das am Gerenderten geprüft wurde. Die Lehre aus F4 §7 gilt deshalb doppelt: **ein Codebefund sagt, was gebaut ist, nicht, was man sieht.** Was hinter Reitern und Zuständen liegt, prüft Konrad im Walkthrough.

**Regel.** Die Matrix benennt Lücken, sie schließt keine. Gebaut wird erst, was Konrad je Zeile als „FLS27 braucht es" markiert; alles andere wird als **bewusst weggelassen** ins Entscheidungslog geschrieben, damit es nicht in jeder Runde neu auftaucht.

**Status.** Genau einer von **vorhanden** · **anders** (mit einem Halbsatz, wie) · **fehlt** · **bewusst weggelassen** (mit Verweis).
„Prüfung Konrad" (✓ / ✗ / Kommentar) und „Prio" (P1/P2/P3) bleiben leer — die füllt der Walkthrough.

**Umfang.** 149 Zeilen: 59 vorhanden · 44 anders · 40 fehlt · 6 bewusst weggelassen.

| Abschnitt | Zeilen | vorhanden | anders | fehlt | bewusst weggelassen |
|---|---|---|---|---|---|
| 1 · Speaker & Programm | 43 | 18 | 12 | 12 | 1 |
| 2 · Partner | 31 | 15 | 8 | 6 | 2 |
| 3 · Volunteers | 19 | 7 | 7 | 5 | 0 |
| 4 · Hackathon, Initiativen, Side-Formate | 23 | 6 | 9 | 6 | 2 |
| 5 · Querschnitt | 33 | 13 | 8 | 11 | 1 |

---

## 1 · Speaker & Programm

Alt: Base `appGv7ZYysgs2krlb` (9 Bühnen-Interfaces, Sonderansichten, 12 Standalone-Formulare), Regieplan 2026 (Google Sheet, §11), Master-Programm FLS26 (Google Sheet, §15).
Neu: `/admin/speaker*`, `/admin/programm`, `/admin/hospitality`, `/admin/anreise`, `/admin/technik`, `/admin/reisekosten`, `/admin/speaker-tickets`, `/speaker-leads/*`, `/produktion`, `/regie/*`.

| Alte Sicht / Funktion (Werkzeug) | Neu (Pfad oder RPC) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| **9 Airtable-Interfaces je Bühne** als faktische Zugriffsgrenze | Eine Oberfläche, Scope über die Rollenzuweisung | **anders** — `role_assignment(role, scope_type='stage', scope_id)` statt neun Arbeitsflächen | `can_edit_stage` in `20260910170349_v3_hubspot_ingest.sql`; Scope-Auswahl in `/admin/rollen` | | |
| Interfaces geben Stage Leads volle Schreibrechte **inkl. Login-E-Mail, Telefon, Hospitality** (Befund 1.8/2) | Schubfach im Lead-Portal: Typ, Jobtitel, Organisation, Reception, Reisekosten, interne Notiz; Pass-Typ, Hotelkategorie, Hospitality, Lounge nur für das Team | **anders, mit Absicht** — E-Mail und Telefon sind nirgends im Lead-Portal änderbar | `app/(speaker-leads)/speaker-leads/SpeakerDrawer.tsx`, `types.ts` (`TEAM_ONLY`) | | |
| Speaker (Master): Liste mit neun Statusfeldern | `/admin/speaker` (`manager_speakers`), Suche + Filter Status/Typ/Betreuung | **vorhanden** | `app/(admin)/admin/speaker/page.tsx`, Migration 0103 | | |
| Speaker (Master): Datensatz bearbeiten (~20 Felder) | `/admin/speaker/[id]` (`speaker_detail`, `update_speaker`) | **vorhanden** | Migration 0103 | | |
| Speaker Buddy / „Speaker Lead" als Link (nur 54 % gepflegt, kein eigenes Feld) | `speaker_profile.owner_person_id`, `handover_speaker`, `/admin/speaker-leads` | **vorhanden** — eigenes Feld statt Zweckentfremdung | Migrationen 0103/0104 | | |
| Moderator & Speaker Buddys (Tabelle mit Portrait) | `edition_contact` + `/admin/ansprechpartner` (`upsert_edition_contact`, Foto-Upload) | **vorhanden** | Migration 0091 | | |
| Manager füllt: Stage-Zuordnung des Speakers (`Speaker-Type` als Bühnen-Tag) | Bühne ergibt sich aus Session → Slot → Stage; `speaker_type` ist nur noch eine Kategorie | **anders** — keine Bühnenmarkierung am Speaker | `session_speaker`, `slot.stage_id`; Vokabular `speaker_type` | | |
| Manager füllt: Sprache | `person.preferred_language` und `session.language` | **anders** — am Menschen und an der Session, nicht am Speaker-Profil | `docs/schema.md` (`person`, `session`) | | |
| Manager füllt: Hospitality-Status, Travel-Coverage (+Pauschale), Reception, interne Notiz | Felder am `speaker_profile`, im Admin-Detail pflegbar | **vorhanden** | `update_speaker`, `approve_travel_costs` | | |
| Manager füllt: **Sponsored-Flag** (bezahlter Speaking-Slot) | — | **fehlt** — kein Kommerz-Bezug an Speaker, Slot oder Session | `docs/schema.md` (`slot`, `session`) | | |
| **Sonderansicht „Speaker-Bilder"** | — | **fehlt** — kein Team-Blick auf Portraits; `/admin/technik` filtert auf `kind = presentation` | `app/(admin)/admin/technik/page.tsx`; `speaker_asset` | | |
| **BÜHNEN VOLO VIEW** (read-only Runsheets je Bühne) | `/regie/druck` (Druckansicht ohne Rahmen) und `/regie/csv` | **vorhanden** | `app/regie/druck/page.tsx`, `app/regie/csv/route.ts` | | |
| **EINLASS & SPEAKERSCARE VOLO VIEW** (Ausstehend → Akkreditiert Speaker Counter → Ankunft Speakerslounge) | `/checkin` (`checkin_scan`), Lounge als Kennzeichen am Profil | **anders** — ein Scan-Kiosk statt einer Volo-Liste; die dreistufige Kette gibt es nicht | `app/(checkin)/checkin/*`, `speaker_profile.lounge_access` | | |
| **Regieplan** (Airtable-Ansicht) und Regieplan-Sheet: Zeitleiste je Bühne × Tag | `/produktion` und `/speaker-leads/regie` (`regie_view`, `upsert_regie_cue`, `regie_open_slots`) | **vorhanden** | `components/regie/*`, Migration 0101 | | |
| Regieplan: **Headset-/Handmic-Nummern** im Moderationstext | `regie_cue.mic_assignments` (jsonb) ist angelegt und wird durchgereicht | **fehlt in der Oberfläche** — Spalte da, nicht angezeigt, keine Kollisionsprüfung | `components/regie/types.ts`; `docs/schema.md` (`regie_cue`) | | |
| Regieplan: Spalte **Regie** (Slides / Video / Audio / Custom Fonts / Clicker / Publikumsmikro, teils Slide-Skripte) | Freitextspalte `regie`; das strukturierte Feld `regie_cue.media` liegt brach | **anders** — Freitext wie im Sheet | `components/regie/RegieTable.tsx` | | |
| Regieplan: Verantwortliche (Regie / Backstage / Technik) | Freitextspalten `regie`, `backstage`, `moderation` | **anders** — keine Personen-Referenz am Cue | `components/regie/RegieTable.tsx` | | |
| Regieplan: Änderungen als Freitext („VERSCHOBEN! NEUE ZEIT!!") | `slot_history` und `log_audit('regie.cue_saved')` | **anders** — protokolliert, aber ohne Ansicht | `docs/schema.md` (`slot_history`), `upsert_regie_cue` | | |
| Regieplan: bühnenübergreifende Sicht (parallele Bühnen nebeneinander) | — | **fehlt** — `AxisPicker` wählt genau eine Bühne und einen Tag; Druck und CSV ebenso | `components/regie/AxisPicker.tsx` | | |
| Regieplan: Vorlage „Aufgang → Session → Abgang" (3er-Sequenz) | „Aus Slot übernehmen" legt eine Zeile je Slot an | **anders** — eine Zeile statt Sandwich; Vorlage als CSV im Repo | `docs/vorlagen/regie-2026-main-stage-fr.csv`, `regie_open_slots` | | |
| **Master-Programm (Sheet): Raster Tag × Bühne, Slots von Hand verschieben** | `/admin/programm` und `/speaker-leads/board` (`create_slot`, `move_slot`, Drag & Drop, Resize) | **vorhanden, besser** — 5-Minuten-Raster, Konfliktprüfung, Änderungslog | Masterplan v0.1c; `components/programme/Board.tsx` | | |
| Master-Programm: Farbe = Status ohne Legende | `slot.status` (`open`, `requested`, `confirmed_title_open`, `final`, `unused`) mit Legende | **vorhanden** | Vokabular `slot_status`; `set_slot_status` | | |
| Master-Programm: **„Status (Konrad)"** Offen / Übergeben / Konrad Lead | — | **fehlt** — kein Übergabestatus; `slot.responsible_person_id` existiert, wird nirgends gelesen oder geschrieben | `docs/schema.md` (`slot`) | | |
| Master-Programm: **„Kommerz"** Gebucht (Bezahlt) / In Absprache / Wunsch (Kostenlos) / Zugesagt (kostenlos) | — | **fehlt** — kein Feld; Partnerbezug nur über `slot_type='partner_block'` und `stage.partner_org_id` | `docs/schema.md` (`slot`), `20260908142441_v2_edition_programme.sql` | | |
| Master-Programm: Backlog „Speaker Zusagen" und „Partnerslots Sold" zum Hineinziehen | Backlog-Leiste am Board aus `programme_backlog` | **anders** — nur Sessions **ohne Slot**; zugesagte Speaker ohne Session und verkaufte Partnerslots stehen nicht darin | View in `20260908182849_v2_programme_editor.sql` | | |
| Master-Programm: Moderation je Slot | `session.moderation_person_id` liegt in der Datenbank | **fehlt in der Oberfläche** — kein Feld im Session-Schubfach | `components/programme/SessionDrawer.tsx` | | |
| Master-Programm: **Masterclass-Planung** (32 Masterclasses, Raumraster 15 Min, Räume I–V, Priorität 1–4, Sprache, Bewerbung FCFS/Ja, Zulassungskriterien) | Masterclass = `session.format`, Bewerbung über `access_mode='application'`, Räume als Bühnen (`stage.room`), Entscheidung in `/admin/bewerbungen` | **anders** — Raster und Prioritätenliste entfallen; **Priorität 1–4 und das FCFS-Kennzeichen gibt es nicht** | `components/programme/*`, `applications_overview`, `decide_application` | | |
| Master-Programm: Öffnungszeiten je Bühne × Tag als Rahmen | `stage_day.open_from` / `open_to` — das Board prüft sie beim Verschieben | **fehlt in der Oberfläche** — geprüft ja, pflegbar nein | `can_edit_slot` / `move_slot` in `20260908142441`; Seed `20260908145110` | | |
| **Location & Stages** (11 Bühnen/Tracks anlegen und pflegen) | — | **fehlt** — Bühnen entstehen ausschließlich per Migration | Seed `20260908145110_v2_seed_vocab_fls27.sql`; keine RPC (`stage` nur `select` im Code) | | |
| Themen (17 Stück) als Multi-Select | `session.tags` und Tabelle `track` | **anders** — `track` ist angelegt, `upsert_session` nimmt `track_id` entgegen, gesetzt wird es nirgends | `components/programme/actions.ts`; `docs/schema.md` (`track`) | | |
| **Hotel** (Kontingent 25hours, Booking Status, Kategorie) | `/admin/hospitality` (`hospitality_admin_overview`, `upsert_hospitality_quota`, `confirm_hospitality`, `decline_hospitality`) | **vorhanden, besser** — Kontingent, Warteliste, Zeitfenster | Migration 0030 | | |
| **Shuttle** (Fahrten, Pick-up/Drop-off, Booking Status) | dieselbe Seite, Kontingentart `shuttle` | **vorhanden** | Migration 0030 | | |
| „Speaker Arrival" / An- und Abreise | `/admin/anreise` und `/speaker-leads/anreise` (`speaker_travel_list`), Filter Tag / Verkehrsmittel / nur Abholung / nur offen | **vorhanden** | Migration 0098 | | |
| **Ticket Status** (Ready to Create → Created and sent · Additional Ticket · Discount created) | `/admin/speaker-tickets` (`speaker_tickets_admin`, `confirm_companion_ticket`, `decline_companion_ticket`), Ausstellung über `speaker_ticket_create` | **vorhanden** | Migration 0034 | | |
| Präsentationen prüfen (im Alt-System nur Dateifeld) | `/admin/technik` (`set_tech_check`, Status pending/checked/issue, Notizpflicht bei Problem), Erinnerung `send_presentation_reminders` | **vorhanden, neu** | Migrationen 0035/0036 | | |
| Reisekosten (Travel-Invoice-Automation, nie deployed) | `/admin/reisekosten` (`expense_queue`, `approve_expense`, `reject_expense`, `mark_expense_paid`, PDF-Ablage) | **vorhanden, neu** | Migrationen 0031–0033 | | |
| **Status (Swapcard)** Draft → Ready 2 Publish → Published, „Ready to Import" | Swapcard-Adapter deckt **nur Aussteller** ab | **fehlt** — Sessions und Speaker laufen nicht nach Swapcard; `session.swapcard_id` wird nie geschrieben | `lib/event-app/swapcard/adapter.ts`; Spalte in `20260908142441` | | |
| **Status (Website)** NEW → UPLOADED | Sanity-Veröffentlichung gibt es nur für Partner-Logos | **fehlt** für Speaker | `lib/sanity/publish.ts`; Runbook `docs/runbooks/sanity-partner-logos.md` | | |
| 12 Standalone-Formulare: 5 Onboarding-Varianten, Hotel, Shuttle | Speaker-Portal (`/speaker/profil`, `/speaker/travel`) hinter dem Login | **bewusst weggelassen** — „Prefilled Unique Form" als Handshake entfällt (Inventar §7.4; F4 §4) | `app/(speaker)/speaker/*` | | |
| Standalone-Formular „Slot-Eintragung" | Board (`create_slot`, Doppelklick auf die Spalte) | **vorhanden** | `components/programme/Board.tsx` | | |
| Standalone-Formular „Stage-Lead-Onboarding" | `/admin/speaker-leads` (Personensuche → `assign_role('speaker_manager')`) | **vorhanden** | Migration 0104 | | |
| **Speaker-Applications** (öffentliches Bewerbungsformular, im Alt-System eine Sackgasse) | — | **fehlt** — kein öffentlicher Weg hinein; Speaker entstehen nur über `upsert_speaker` / `invite_speaker` | keine öffentliche Route unter `app/` | | |
| Exhibitors (Sync): Swapcard-IDs für Sponsored Slots | `external_ref` + Ausstellerlauf im Partner-Admin | **vorhanden** (siehe Abschnitt 2) | `/admin/partner/integrationen` | | |

---

## 2 · Partner

Alt: Base `appbhdF78LhXRbCtL` (Customer-Data, Contact-Data, Offer-Data, Product-Data, Booth), Messeshop WooCommerce, 26 Automationen (4 deployed).
Neu: `/admin/partner` mit sieben Reitern, `/produktion/*`.

| Alte Sicht / Funktion (Werkzeug) | Neu (Pfad oder RPC) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| **Customer-Data** als Org-Master mit Views | `/admin/partner` (`partner_admin_overview`) und `/admin/partner/[org]` (`partner_overview`) | **vorhanden** | `app/(admin)/admin/partner/page.tsx` | | |
| Customer-Data: Views je Segment (Product Type, Status, Sonderitems) | — | **fehlt** — die Übersicht hat keine Suche, keinen Filter, keinen Editions-Umschalter; sortiert wird fest in der RPC | `app/(admin)/admin/partner/page.tsx` | | |
| **Contact-Data** je Organisation (485 Zeilen, n:1) | `/admin/partner/[org]` (`partner_contacts`, `upsert_partner_contact`) | **vorhanden** | Migration 0040 | | |
| Contact Type: Primary · Signing · **Accounting** · **CC** · Event-App Member | Rollen `primary_ops`, `signing`, `accounting`, `additional`, `event_app_member` | **anders** — CC heißt `additional`; der Anlegedialog bietet nur vier Rollen, **`accounting` ist dort nicht wählbar** (kommt nur aus HubSpot) | `app/(admin)/admin/partner/[org]/OrgDetail.tsx`; `lib/hubspot/mapping.ts` | | |
| **Offer-Data** (900 Angebotszeilen, Produkt nur als Text-SKU) | `org_product` (echte Verknüpfung) plus `partner_deals` als HubSpot-Spiegel | **anders** — HubSpot ist die Quelle, das Portal spiegelt und löst die SKU echt auf | Migrationen 0043/0044; `/admin/partner/[org]` | | |
| **Product-Data (All Items)**, Katalog 110 Artikel | `/admin/partner/produkte` (`admin_products`, `upsert_product`), Freitextsuche | **vorhanden** | Migration 0038; `docs/referenz/item-liste-2026.csv` | | |
| **Product-Data (Bundles)**, Stückliste der Standpakete | `product_component` (`upsert_product_component`); speist zugleich „das ist in deinen 18 qm drin" | **vorhanden, besser** | Migration 0094; Entscheidungslog 14.09. Punkt 1 | | |
| **Booth (All Information)**: Standnummer, Segment, Typ, QM, Rückwandmaße | `/admin/partner/[org]` (`upsert_booth`) | **vorhanden** | Migration 0094 | | |
| Booth: Mobiliar, Strom, Wasser als Spalten je Stand | `booth_service_check` je Stand × Artikel, abgehakt in `/produktion/staende` (`set_booth_service_check`) | **anders** — Checkliste aus dem Produktstamm statt fester Spalten | Migration `20260914094832_v4_produktion.sql` | | |
| Booth: **Standliste über alle Stände** (Standnummern, Ausstellerliste) | `exhibitor_list` existiert, ist aber auf die Zielgruppen Partner/Speaker beschränkt und nur im Partner-Portal eingebunden | **fehlt** im Team-Bereich — `/produktion/staende` gruppiert nur die Checkliste; `upsert_booth` ist für die Produktion freigegeben, aber nicht verdrahtet | `20260915115415_v5_messestand.sql`; `app/(partner)/partner/messestand/page.tsx` | | |
| **Hallenplan-PDF** an ablaufender Notion-URL (Befund 2.7/9) | `/produktion/dateien` (`edition_files_admin`, `set_edition_file`, Art `hallenplan`) | **vorhanden** — die Datei selbst fehlt noch | Migration 0094; `docs/feedback-runde-2-2026-09-14.md` „Was fehlt" | | |
| Status **Onboarding Filled / Onboarding Call** | `partner_set_onboarding_status` (none · invited · filled · call_done) | **vorhanden** | Migration 0040 | | |
| **Invoice-Block** (Rechnungsstatus No/Sent/Paid, Rechnungsadresse, USt-ID, Rechnungsmail, PO) | Werte liegen in `org_edition`, die Org-Seite zeigt sie nicht; gepflegt werden sie nur vom Partner selbst | **fehlt** — kein Rechnungsblock und kein Rechnungsstatus im Admin; `shop_invoice_refs` hat keinen Aufrufer | `app/(admin)/admin/partner/[org]/OrgDetail.tsx`; `20260911083629_v3_shop_invoices.sql` | | |
| Bestellungen: **PO-Nummer** je Auftrag | `shop_order.po_number` wird von `shop_orders_admin` geliefert | **fehlt in der Oberfläche** — nicht angezeigt | Migration 0095; `app/(admin)/admin/partner/bestellungen/OrdersView.tsx` | | |
| **Vivenu Codes Created** + `# Tickets` Partner/Talente als vier Felder an der Org | `/admin/partner/kontingente` (`ticket_allocations_admin`, `set_ticket_allocation`), Abgleich über `/api/cron/vivenu-allocations` | **vorhanden, besser** — Zeilen statt Felder, mit Status, Einlösestand, Undershop | Migration `20260911074329_v3_ticket_allocations.sql` | | |
| Pass-Typ je Partner (Talente- vs. Startup-Ticket) | `set_pass_type_choice` auf der Org-Seite, Vorbelegung aus HubSpot | **vorhanden** | Migration 0105 | | |
| **Exhibitor Shop Password / Shop-Rolle** (eigener Shop-Login je Org) | ein Login mit Bereichen | **bewusst weggelassen** — Antwort 45; F4 §4 | `lib/areas.ts` | | |
| **Status (Backdrop)** / Rückwand-Freigabe | Pflicht `backdrop_print` in der Checkliste, Freigabe in `/admin/partner/review` (`review_deliverable`, Begründungspflicht, Mail bei Ablehnung) | **vorhanden, besser** — Frist, Versionen, Protokoll | `20260910163331_v3_partner_deliverables.sql` | | |
| Rückwandmaße als Prüfgrundlage für die Druckdatei | Maße sind Stammdaten am Stand | **anders** — keine Maß- oder Formatprüfung der hochgeladenen Datei | `upsert_booth`; `partner_asset` | | |
| **Product Type steuert Hub-Sichtbarkeit** (Sonderstand, 18qm, Hackathon, Masterclass, Speaking …) | gebuchte Produkte steuern Seiten, Pflichten und Rollen (`trg_org_product_roles`, `deliverable_template.product_sku`) | **anders** — aus der Buchung abgeleitet statt als Select gepflegt | Migrationen 0041/0047 | | |
| Logo → Remove.bg → Placid → Partnergrafik | Logo als `partner_asset`, Freigabe über die Checkliste, Veröffentlichung nach Sanity | **anders** — Freistellen und Grafikbau entfallen; Media Kit fehlt (F4 Lücke 1) | `lib/sanity/publish.ts`; `docs/feedback-runde-1-abgleich.md` §5 | | |
| Sanity-Veröffentlichung auslösen (Website-Logos) | Route `POST /api/admin/sanity/partner-logos` | **fehlt in der Oberfläche** — kein Aufrufer in `app/`; nur `scripts/sanity-dryrun.mjs` | `app/api/admin/sanity/partner-logos/route.ts` | | |
| **Sponsoring-Level** (Logo Type Swapcard, steuert Reihenfolge auf der Website) | `org_edition.sponsoring_level` + Vokabular `sponsoring_level` | **fehlt in der Oberfläche** — weder sichtbar noch pflegbar, kommt nur aus HubSpot | Migration 0097; `OrgDetail.tsx` | | |
| **Exhibitor Shop – Order Overview** (toter Klon, 0 Zeilen) | `/admin/partner/bestellungen` (`shop_orders_admin`, `shop_admin_set_status`, `shop_admin_set_line`, `shop_report`) und `/produktion/bestellungen` (`supplier_order_list`, CSV je Dienstleister) | **vorhanden, besser** — die Lücke des Altsystems ist geschlossen | Migration 0048 | | |
| Messeshop-Rechnung (WooCommerce-Invoice-Datei) | SevDesk-Entwürfe aus dem Shop, Trockenlauf vor Echtlauf (`/api/admin/sevdesk/shop-invoices`) | **vorhanden** | Migration 0052; Runbook `docs/runbooks/sevdesk-shop-rechnungen.md` | | |
| „Auf Anfrage"-Artikel und Änderungswünsche (Mail an Konrad) | `shop_requests_admin`, `shop_request_answer` | **vorhanden** — strukturierte Anfrage statt Mail-Rückfall | Migration 0048; F4 §7 | | |
| **Checklist & Deadlines** (im Alt-System „not built yet", Countdowns hartcodiert in SoftR) | `deliverable` + `deliverable_template` (`/admin/partner/vorlagen`) + `deadline` (`/admin/fristen`) + Erinnerungs-Digest | **vorhanden** — die größte Lücke des Altsystems ist geschlossen | Migrationen 0041/0045/0046 | | |
| **2026 Gipfel – Partner ALL** (Sales-Longlist, 772 Zeilen, unverlinkt) | HubSpot | **bewusst weggelassen** — CRM bleibt HubSpot (Masterplan §5; Antwort 56 ff.) | `docs/masterplan.md` §5 | | |
| Hubspot-Kundennummer-Generator (einzige deployte Automation) | HubSpot-Ingest mit Deal-Gate und Fehlermail | **anders** — Nummer kommt aus HubSpot, das Portal prüft und spiegelt | Migrationen 0043/0044 | | |
| Event-App-Mitglieder (Contact Type) → Swapcard-Exhibitor | `/admin/partner/integrationen` (Ausstellerlauf mit Trockenlauf) + Selbstauskunft `org_step` | **vorhanden** — die Selbstpflege durch den Partner fehlt weiter (F4) | Migrationen 0055/0093 | | |
| Automationen 2.5 (26, davon 4 deployed) | siehe Abschnitt 5 | **anders** | — | | |

---

## 3 · Volunteers

Alt: Base `appRrXacJe9PQ748O` (Volunteers Confirmed mit ~250 Feldern, Einsatz-Raster mit 119 Stundenspalten, Interfaces „VOLO ÜBERSICHT" und „NON/FEHLT VOLOS", 8 Formulare).
Neu: `/admin/volunteers` (Bewerbungen, Schichten, Tickets), `/volunteers/*`.

| Alte Sicht / Funktion (Werkzeug) | Neu (Pfad oder RPC) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Interface **„VOLO ÜBERSICHT"** | `/admin/volunteers` (`volunteer_admin_overview`), Suche + Statusfilter mit Zählern | **vorhanden** | Migration 0065 | | |
| Volunteers (Confirmed) mit **~250 Feldern** | `volunteer_profile` mit 24 Spalten | **anders** — bewusst schlank; Ratings und Feedbackfelder sind nicht übernommen | `docs/schema.md` (`volunteer_profile`) | | |
| Zuteilung: sechs Tages-Zuteilungen + „Zugeteilt Status" (1–4 Schicht, Wartepool, NEU ZUGETEILT, ÄNDERUNG, ABSAGE) | `shift_assignment` je Schicht (`assigned`, `confirmed`, `declined`, `no_show`, `waitlisted`) | **anders, besser** — Zuteilung an der Schicht statt als Spaltensatz an der Person | Migration 0065 | | |
| **Einsatz-Raster mit 119 Stunden-Spalten**, Kapazität implizit | `shift` mit Start/Ende, `capacity`, `overbook`, Ort, Lead, Briefing; `/admin/volunteers/schichten` (`upsert_shift`, `assign_shift`, `unassign_shift`) | **vorhanden, besser** — echte Zeiten und Soll-Kapazität | Migration 0065 | | |
| **Shift Confirmation** (Rückbestätigung) | `confirm_shift` / `decline_shift` im Volunteer-Portal; Erinnerung über `send_shift_reminders` im Cron | **anders** — Selbstbedienung und Automatik; im Admin gibt es dafür **keinen Knopf** | `app/(volunteers)/volunteers/actions.ts`; `/api/cron/mail` | | |
| Warteliste / Nachrücken | `promote_shift_waitlist`, läuft automatisch bei Absage, Entfernen und im Housekeeping | **anders** — ohne Bedienelement im Admin | `20260911165420_v4_volunteers.sql` | | |
| Interface **„NON/FEHLT VOLOS"** (Telefon-Nacharbeit, Spalte ANRUFER, Nacharbeit-Status AUSSTEHEND → ANGERUFEN → POSITIV / ABSAGE / NUMMER FALSCH) | — | **fehlt** — keine Nacharbeitssicht, keine Telefonnummer in den Volunteer-Sichten | Suche ohne Treffer in `app/`, `lib/`, `supabase/migrations` | | |
| Discount-Code 50 % je Volunteer | `/admin/volunteers/tickets` (`volunteer_tickets_admin`), Ausgabe und Widerruf über `/api/cron/volunteer-tickets` | **vorhanden, besser** — Status, Einlösung, Fehlerfeld | Migration 0065; `lib/vivenu/volunteers.ts` | | |
| **Zertifikat** für Volunteers | — | **fehlt** — kein Feld, keine Seite, kein Dokument | Suche ohne Treffer im Repo | | |
| **Accommodation Offer** (37 Hostel-Betten, Arrival/Departure, Bezahlung) | — | **fehlt** — kein Datenmodell | Suche ohne Treffer im Repo | | |
| **Anmeldung Volunteer Day** (Kick-off, 62 Anmeldungen, Dietary) | — | **fehlt** — kein Side-Format-Objekt für Volunteers | `session.access_mode` nur für Talent-Formate genutzt | | |
| Feedback: 5 Selbst-Ratings, ~40 Feedbackfelder, Feedback-Tabellen Team Leads | — | **fehlt** — keine Retro im Portal | `docs/schema.md` (`volunteer_profile`) | | |
| **Waitlist FLS27** (359 Alt-Profile, Prefilled Link, Bewertung) | Bewerbung mit Status `applied` | **anders** — Bewerbung statt Warteliste; die Warteliste an der Schicht ist etwas anderes | `apply_volunteer`; Migration 0065 | | |
| T-Shirt-Größe, Areas (6), Tagespräferenzen, Verfügbarkeit, Crew-Buddy | Felder am Profil, in der Bewerbungsliste sichtbar | **vorhanden** | `volunteer_admin_overview` | | |
| Rolle (20 Rollen) je Position | `shift.area` + `shift.position` + Vokabular `volunteer_area` | **vorhanden** | Migration 0065 | | |
| Briefing-URL und Sicherheitsbriefing je Position | `shift.briefing_md` + Volunteer-Wiki (`kb_article`, Zielgruppe `volunteer`) | **vorhanden** | Migrationen 0065/0083 | | |
| Exportlisten für die Arbeit vor Ort | `/admin/volunteers/export` (CSV, zwei Blöcke, ohne Geburtsdatum) | **vorhanden** | `app/(admin)/admin/volunteers/export/route.ts` | | |
| Check-in der Crew über Airtable | `/checkin` (`checkin_scan`) | **anders** — ein Kiosk für alle Zielgruppen | Migration 0090 | | |
| Kommunikation als Checkbox-Wellen + WhatsApp-Gruppen | `mail_log` (siehe Abschnitt 5); WhatsApp bleibt außerhalb | **anders** | `docs/mail-plan.md` | | |

---

## 4 · Hackathon, Initiativen, Side-Formate (Team-Sicht)

Alt: `appVO7yVsIZzdd2Bm` (Hackathon, 7 unverlinkte Tabellen), `app7yb6gSbHl6kqVg` (Initiativen, 9 Tabellen, null Record-Links), `appwhzibE1E6Gm7bL` / `app7znFsinqqv5O0M` (Company Tours, Masterclasses — ein Personen-Tabellen-Klon mit Spaltenpaaren).

| Alte Sicht / Funktion (Werkzeug) | Neu (Pfad oder RPC) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Hackathon Applications (512 Zeilen, Rohtopf) | `hack_application` über `apply_hackathon` im Hackathon-Portal | **vorhanden** (Eingang) | Migration `20260914095624_v4_hackathon.sql` | | |
| Hackathon: **Bewerbungen sichten und entscheiden** (Selektion 512 → 310) | `set_hack_application_status` existiert, wird aber nirgends aufgerufen; es gibt keine Bewerbungsliste | **fehlt** — kein Ort im Portal | `20260914095624_v4_hackathon.sql`; keine Verwendung in `app/` oder `components/` | | |
| Participants (310) mit Ops-Feldern (Vivenu-ID, Barcode, Swapcard-Profil, Briefings) | `/hackathon/teams` (`hack_admin_overview`) zeigt Teams, Mitglieder, Challenge, Einreichung, Bewertungen | **anders** — Teamsicht statt Teilnehmerliste | `app/(hackathon)/hackathon/teams/page.tsx` | | |
| Challenges nur als Select (7 belegt) | `hack_challenge` mit Beschreibung, Preisen, Mentoren, Kriterien; Freigabe aus dem Partner-Formular über `publish_hack_challenge` | **vorhanden, besser** | Migration `20260914095624` | | |
| Challenge-Zuteilung („6 Teams je Challenge") | `assign_challenges` verteilt gleichmäßig auf Teams ohne Challenge; `set_team_challenge` (von Hand umhängen) hat keine Oberfläche | **anders** — automatisch ja, einzeln umhängen nein | `app/(hackathon)/hackathon/actions.ts` | | |
| Teams, Submissions, Judging (im Alt-System **nicht vorhanden**, Teams nur Freitext) | `hack_team`, `hack_team_member`, `hack_submission`, `/hackathon/judging` (`set_hack_score`, Partner-Jury nur für die eigene Challenge) | **vorhanden, neu** | Migration `20260914095624` | | |
| Briefing-Wellen 01.04. / 06.04. als Checkboxspalten | `mail_log` und Hackathon-Wiki | **anders** | `docs/mail-plan.md`; Migration 0083 | | |
| Zeitplan des Hackathons | `/hackathon/schedule` liest nur `programme_public`; gepflegt wird im Programm-Board | **anders** — Anzeige, kein eigener Editor | `app/(hackathon)/hackathon/schedule/page.tsx` | | |
| Discord (im Alt-System kein Feld) | Link aus `HACKATHON_DISCORD_URL` | **vorhanden** — URL noch nicht gesetzt (Abschluss-Checkliste) | `app/(hackathon)/hackathon/*` | | |
| Hack26 – Feedback & Warteliste 27 (NPS, Top/Flop) | — | **fehlt** | — | | |
| Professoren-Outreach (99 Zeilen) | HubSpot | **bewusst weggelassen** — Akquise bleibt CRM (Masterplan §5) | `docs/masterplan.md` §5 | | |
| Initiativen: **Applications & Outreach** (Akquise-Funnel, Agreement-Stufen) | HubSpot + Organisationstyp `initiative` | **anders** — derselbe Weg wie beim Partner | `lib/hubspot/mapping.ts`; Vokabular `organization_type` | | |
| Initiativen: **eigene Sicht für das Team** | — | **fehlt** — `partner_admin_overview` liefert `org_type` mit, die Oberfläche nutzt ihn nicht; kein Filter, keine Seite | `app/(admin)/admin/partner/*`; `docs/arbeitsauftrag-welle-3.md` (B9, „Initiativen als Filter") | | |
| Initiativen: Onboarding-Data mit ~20 Kommunikations-Checkboxen | `org_step` (Selbstauskunft) und `mail_log` | **anders** | Migration 0093 | | |
| Initiativen: **100 %- und 50 %-Discount-Code** nebeneinander | `org_ticket_allocation`: ein Kontingent je Pass-Typ mit einem Code | **anders** — zwei Rabattstufen je Organisation sind nicht vorgesehen | Migration `20260911074329` | | |
| Initiativen: Freitickets-Einlösung (294 Zeilen) | `ticket` + `used_count` am Kontingent, Abgleich aus vivenu | **vorhanden** | Migrationen 0049/0075–0078 | | |
| Initiativen: **Award** (33 Zeilen, Stimmen, Mission, Bilder, Zustimmung) | — | **fehlt** | — | | |
| Initiativen: **Messestand mit „Ini Tag 1 / Tag 2"** (zwei Initiativen teilen einen Stand) | `booth` je Organisation × Edition | **fehlt** — ein Stand kennt keine Tagesteilung | `docs/schema.md` (`booth`) | | |
| **Company Tours / Masterclasses**: eine Zeile je Person, Angebot als Spaltenpaar `Bewerbung: X` + `Status: X` | `session` (Angebot mit Kapazität, Frist, Format) + `application` (Person × Session) + `/admin/bewerbungen` (`decide_application`, `release_decisions`, `promote_waitlist`, `expire_overdue_applications`) | **vorhanden, besser** — echte Angebots-Entität, Warteliste, Fristen | Migrationen 0020/0021 | | |
| Partner-Interface je Masterclass: Partner sieht **alle** Bewerberdaten und löst mit einem Klick Mail + Kalender aus | `/partner/bewerber` mit Consent-Gate, Datenminimierung und Freigabe durch das Team | **anders, mit Absicht** — Inventar §7.12 | Migration 0047 | | |
| Exportlisten „Teilnehmerliste – <Tour>" je Angebot | — | **fehlt** — kein Export je Session/Format | `/admin/bewerbungen` ohne Exportweg | | |
| PhD-Breakfast-Zielgruppe (125 Zeilen, eigene Tabelle) | `person_eligibility` / `person_interest` | **anders** — Merkmal an der Person statt eigener Tabelle | `docs/schema.md` | | |
| Vier identische Uni-Ticketholder-Tabellen, „Alle Ticketholder" (658) | `person` + `registration` + `ticket` | **bewusst weggelassen** — Editions- und Personendimension statt Klontabellen (Inventar §7.8) | `docs/schema.md` | | |

---

## 5 · Querschnitt

| Alte Sicht / Funktion (Werkzeug) | Neu (Pfad oder RPC) | Status | Beleg | Prüfung Konrad | Prio |
|---|---|---|---|---|---|
| Airtable-Automationen (43 / 13 deployed bzw. 26 / 4) | Logik als Trigger und RPC in der Datenbank, Transport über vier Cron-Routen | **vorhanden** — Inventar §7.10 umgesetzt | `vercel.json`; `/api/cron/mail` (alle 10 Min: `run_application_housekeeping`, `run_partner_housekeeping`, `run_volunteer_housekeeping`, `send_presentation_reminders`, `purge_diet_data`, `purge_checkins`, Mail-Warteschlange) | | |
| make.com: HubSpot → Airtable | `/api/cron/hubspot-sweep` (alle 15 Min) + Webhook `/api/webhooks/hubspot` (signiert, idempotent) | **vorhanden** | Migrationen 0043/0044; Runbook `docs/runbooks/hubspot-ingest.md` | | |
| make.com: Vivenu-Coupons je Partner | `/api/cron/vivenu-allocations` (alle 30 Min) | **vorhanden** | Migration 0049; Runbook `docs/runbooks/vivenu-kontingente.md` | | |
| make.com: Vivenu-Ticketeingang | Webhook `/api/webhooks/vivenu` (`ingest_vivenu_ticket`); der Nachlauf `/api/cron/vivenu-tickets` **steht nicht im Cron-Plan** | **anders** — Webhook ja, geplanter Sweep nein | `vercel.json`; `app/api/cron/vivenu-tickets/route.ts` | | |
| make.com: Swapcard-Aussteller | `/api/admin/swapcard/exhibitors` aus dem Partner-Admin, Trockenlauf vor Echtlauf | **vorhanden** | Migration 0055; Runbook `docs/runbooks/swapcard-aussteller.md` | | |
| make.com: Swapcard-Sessions und -Speaker (`importEventPlannings`, People) | — | **fehlt** — der Adapter kennt nur Aussteller | `lib/event-app/swapcard/adapter.ts` | | |
| make.com: SevDesk-Rechnungsentwürfe | `/api/admin/sevdesk/shop-invoices` (nur Messeshop) | **vorhanden** | Migration 0052 | | |
| make.com: Placid / Remove.bg (Partner- und Speaker-Grafiken) | — | **fehlt** — Media Kit und Partnergrafik (F4 Lücke 1) | `docs/feedback-runde-1-abgleich.md` §5 | | |
| make.com: Drive-Ordner und Kalendereinladungen (undeployed) | — | **fehlt** | `docs/legacy-inventar.md` §1.7 | | |
| Hartcodierte Schlüssel in Blueprints, ~23 verwaiste aktive Webhooks (§10, 🔴) | Werte nur in Vercel-Env, Webhooks mit Signatur und Idempotenz | **vorhanden** — Abschalten der Altszenarien steht in `docs/abschluss-checkliste.md` | `lib/vivenu/signature.ts`, `lib/hubspot/signature.ts`; `integration.webhook_event` | | |
| **Läufe und Fehler sehen** (in Airtable die Automations-Historie) | `/admin/partner/integrationen` zeigt HubSpot-Sync-Fehler und Webhooks (`partner_ingest_log`, `resolve_sync_error`) | **anders** — nur ein System hat eine Ansicht; `integration.sync_job` wird geschrieben und nie gelesen | `20260910170349_v3_hubspot_ingest.sql`; `start_sync_job` / `finish_sync_job` ohne lesende Seite | | |
| **Mail-Wellen als Checkbox-Spalte je Mailing** (drei Bases, Inventar §7.5) | `mail_log` je Mail mit Zustellstatus; `/admin/mail` | **anders** — jede Mail steht als Zeile, die Seite zeigt aber nur die letzten zwanzig, ohne Filter und ohne erneuten Versand | `docs/mail-plan.md`; `app/(admin)/admin/mail/page.tsx` | | |
| **Mail-Vorlagen bearbeiten** (in Airtable im Automations-Schritt) | `mail_template` in der Datenbank, gefüllt nur per Migration | **fehlt** — kein Editor; `mail_template` kommt in `app/` nicht vor | `lib/mail/send.ts`; `docs/schema.md` (`mail_template`) | | |
| Dubletten (Dedup nur im Szenario, kein Constraint, Inventar §10/5) | `potential_duplicate` + `/admin/dubletten` (bestätigen / verwerfen, mit Audit) | **vorhanden** | `20260721160704_import_staging.sql` (`potential_duplicate`); `app/(admin)/admin/dubletten/*` | | |
| Dubletten **zusammenführen** | `person_merge_log` ist angelegt, es gibt keine Funktion und keinen Knopf | **fehlt** — die Dublettenseite zeigt nur ID-Fragmente, keinen Vergleich | `docs/schema.md` (`person_merge_log`); `app/(admin)/admin/dubletten/*` | | |
| **Rollen-Scoping über Interfaces** (Inventar §7.7) | `/admin/rollen` (`assign_role`, `revoke_role`) mit Scopes `edition`, `portal`, `stage`, `stage_day`, `slot`, `org` | **vorhanden, besser** | `20260910085741_v2_admin_read_paths_roles.sql` (`assign_role`); `app/(admin)/admin/rollen/*` | | |
| Team-Rollen an **einem** Ort verwalten (wer gehört zum Team, welcher Bereich) | `/admin/team` (PR #48, Migration 0106) | **vorhanden** — seit 17.09. auf `main` (Merge #48, 0106 live) | Entscheidungslog 17.09. | | |
| Vokabulare als Airtable-Single-Selects (frei pflegbar) | `vocab_term` + `/admin/vokabular` | **anders** — nur aktiv/inaktiv; Anlegen, Umbenennen, Sortieren und Löschen nur per Migration | `app/(admin)/admin/vokabular/*` | | |
| „Jahr = neue Base / neue Tabelle" (Inventar §7.8) | Edition als Dimension an jeder Tabelle | **vorhanden** | `docs/schema.md`; `event.is_edition` | | |
| **Edition, Tage, Bühnen, Bühnen-Tage und Tracks anlegen** | — | **fehlt** — weder Seite noch RPC; die FLS27-Bühnen stehen als `insert` in der Seed-Migration | `20260908145110_v2_seed_vocab_fls27.sql`; alle Zugriffe auf `event`/`stage`/`event_day` im Code sind `select` | | |
| Deadlines hartcodiert in SoftR (Inventar §7.6) | `deadline` je Edition + `/admin/fristen` (`upsert_deadline`, Vorlaufzeit der Erinnerung) | **vorhanden** | `20260910104806_v2_speaker_content_assets.sql` (`deadline`, `upsert_deadline`) | | |
| Frist wieder entfernen | — | **fehlt** — kein `delete_deadline`, nur Anlegen und Ändern | `app/(admin)/admin/fristen/*` | | |
| **Consent fehlt systematisch** (Speaker, Volunteers, Bewerberdaten — Inventar §7.9) | `consent_record` + View `consent_current`, erfasst bei Bewerbung, Volunteering und Speaker-Zusage | **vorhanden** (Erfassung) | `20260908141744_v2_identity_roles.sql` (`consent_record`); `app/(talent)/onboarding/actions.ts` | | |
| Consent-Übersicht und Widerrufe für das Team | — | **fehlt** — keine Ansicht auf `consent_record` | keine Verwendung in `app/(admin)` | | |
| **„Profil löschen" + Suppression** (Datenschutz, AGENTS) | `delete_my_profile()` (anonymisiert, schreibt `suppression`), `is_suppressed` vor jedem Versand | **fehlt in der Oberfläche** — die Funktion hat **keinen Aufrufer**, weder Selbstbedienung noch Admin-Warteschlange; die Sperrliste hat keine Ansicht | `20260908141744_v2_identity_roles.sql`; keine Verwendung in `app/` | | |
| Audit / Nachvollziehbarkeit (in Airtable die Record-Historie) | `audit_log` wird von jeder Team-Aktion geschrieben (`log_audit`) | **fehlt in der Oberfläche** — „Nur service_role liest", keine Seite | `docs/schema.md` (`audit_log`); `lib/audit.ts` | | |
| Speaker (Master) als **Arbeitsfläche für Personen** (suchen, korrigieren) | `/admin/personen`: letzte 200 Personen, Detailseite lesend; änderbar ist nur die Briefanrede | **anders** — Leseliste ohne Suche und Filter; gepflegt wird je Domäne (Speaker, Partner, Volunteer) | `app/(admin)/admin/personen/*`; `set_person_salutation` | | |
| Dateien der Edition (Hallenplan, Anfahrt, Aufbauplan) | `/produktion/dateien` (`edition_files_admin`, `set_edition_file`) | **anders** — liegt in der Produktion, nicht im Admin; über die Seitenleiste der Produktion **nicht erreichbar** (nur über die Reiter) | Migration 0094; `app/(produktion)/layout.tsx` gegen `produktion/shell.tsx` | | |
| Kiosk-/Gerätekonten am Einlass | Rolle `checkin_operator` über `/admin/rollen` vergebbar; `isKioskOnly` sperrt alles andere | **anders** — Rolle ja, ein Gerätekonto anlegen nein | `lib/areas.ts`; Migration 0090 | | |
| Wikis + Chatbot „Chefi" (Inventar §14) | `/admin/wiki` (`upsert_kb_article`, `publish_kb_article`, Zielgruppen, Phase, Gültigkeit); Chatbot gibt es nicht | **anders** — Redaktion vorhanden, Bot offen (F4 §3) | Migrationen 0083/0096; `docs/feedback-runde-1-abgleich.md` §3 | | |
| Loom-Videos und Einbettungen in Notion/SoftR | `/admin/videos` (`portal_videos_admin`, `upsert_portal_video`) je Schlüssel und Zielgruppe | **vorhanden** | Migration 0092 | | |
| Ansprechpartner und Öffnungszeiten als Fließtext im Wiki | `/admin/ansprechpartner` (`upsert_edition_contact`, `upsert_edition_info`) | **vorhanden** | Migrationen 0091/0102 | | |
| Private Mobilnummern von Team und Freelancern in Interfaces und Wiki | dienstliche Kontaktdaten je Edition, Rollen-Postfächer | **bewusst weggelassen** — AGENTS „Datenschutz"; Entscheidungslog 14.09. | Migration 0091 | | |

---

## Verwaltungsfunktionen, die im Admin fehlen

Verdichtet aus allen Zeilen mit Status **fehlt** oder **anders**, gruppiert. Die Kandidatenliste aus `docs/plan-ergaenzung-2026-09-17.md` §5.5 ist dabei Punkt für Punkt bestätigt oder korrigiert.

**A · Stammdaten der Edition**
1. **Editionen, Tage, Bühnen, Bühnen-Tage und Tracks anlegen und pflegen** — Kandidat **bestätigt**: es gibt weder Seite noch RPC, die FLS27-Bühnen stehen als `insert` in `20260908145110_v2_seed_vocab_fls27.sql`.
2. **Öffnungszeiten je Bühne × Tag** (`stage_day.open_from/open_to`) — neu gegenüber §5.5: das Board erzwingt sie beim Verschieben, pflegen kann sie niemand.
3. **Vokabular pflegen** — neu: `/admin/vokabular` kann nur aktiv/inaktiv; Anlegen, Umbenennen, Sortieren und Löschen gehen nur per Migration.
4. **Fristen löschen** — neu: `upsert_deadline` legt an und ändert, ein Löschweg fehlt.

**B · Datenschutz und Nachweis**
5. **Audit-Log-Ansicht** — Kandidat **bestätigt**: `audit_log` wird geschrieben, liest nur `service_role`, keine Seite.
6. **Consent-Übersicht** — Kandidat **bestätigt**: Einwilligungen werden versioniert erfasst, es gibt keine Ansicht.
7. **„Profil löschen"-Anfragen** — Kandidat **korrigiert und verschärft**: es fehlt nicht nur die Warteschlange im Admin, sondern jeder Auslöser — `delete_my_profile()` ist gebaut und freigegeben, wird aber von keiner Seite aufgerufen.
8. **Suppression-Liste** — Kandidat **bestätigt**: Tabelle und Prüfung stehen, eine Ansicht fehlt.
9. **Personen zusammenführen** — neu: `/admin/dubletten` markiert nur; `person_merge_log` existiert ohne Funktion, und die Seite zeigt statt der Namen nur ID-Fragmente.

**C · Kommunikation**
10. **Mail-Vorlagen bearbeiten** — Kandidat **bestätigt**: `mail_template` kommt in der Anwendung nicht vor, Vorlagen ändert nur eine Migration.
11. **Mail-Protokoll als Arbeitsmittel** — neu: `/admin/mail` zeigt zwanzig Zeilen ohne Filter, ohne Detail und ohne erneuten Versand; als Ersatz für die Mail-Checkboxspalten der Alt-Bases reicht das nicht.

**D · Bereiche ohne vollständige Admin-Fläche**
12. **Hackathon-Admin** — Kandidat **teilweise bestätigt**: Challenges freigeben, Challenges zuteilen und Judging gibt es; **fehlt** sind die Bewerbungsliste mit Entscheidung (`set_hack_application_status` ohne Oberfläche), das einzelne Umhängen einer Challenge (`set_team_challenge`) und ein eigener Zeitplan (`/hackathon/schedule` ist Anzeige).
13. **Initiativen als eigene Sicht** — Kandidat **bestätigt**: der Organisationstyp `initiative` existiert und wird von `partner_admin_overview` geliefert, die Oberfläche nutzt ihn nirgends. Dazu fehlen Award, Standteilung „Tag 1 / Tag 2" und die zweite Rabattstufe.
14. **Team-Verwaltung** — Kandidat **bestätigt**: `/admin/team` ist seit 17.09. auf `main` (Merge #48, Migration 0106); der Zugriffsschnitt `is_staff()` → `has_role('admin')` ebenfalls (Merge #49, 0107). Beim Erstellen der Matrix waren beide noch offen.
15. **Kiosk-Konten** — Kandidat **teilweise korrigiert**: die Rolle `checkin_operator` ist über `/admin/rollen` vergebbar; was fehlt, ist das Anlegen eines Gerätekontos.

**E · Ansichten, die woanders oder gar nicht liegen**
16. **Dateien der Edition** — Kandidat **bestätigt**: sie liegen unter `/produktion/dateien`; dort sind sie zusätzlich nur über die Reiter erreichbar, nicht über die Seitenleiste der Produktion.
17. **Integrations-Status über alle Systeme** — Kandidat **bestätigt und verschärft**: eine Ansicht gibt es nur für HubSpot unter Partner. vivenu-Kontingente, Volunteer-Coupons, Swapcard-Aussteller, SevDesk-Rechnungen und die Sanity-Veröffentlichung schreiben `integration.sync_job`, das keine Seite liest; die Sanity-Route hat überhaupt keinen Aufrufer in der Anwendung.
18. **Standliste und Ausstellerliste im Team-Bereich** — neu: `exhibitor_list` ist auf Partner und Speaker beschränkt, `upsert_booth` ist für die Produktion freigegeben, aber nicht verdrahtet.
19. **Rechnungsblock am Partner** — neu: Rechnungsadresse, USt-ID, Rechnungsmail, PO-Nummer und Sponsoring-Level liegen in `org_edition` und werden auf der Org-Seite nicht gezeigt; ein Rechnungsstatus fehlt ganz, `shop_invoice_refs` hat keinen Aufrufer.

**F · Aus den Team-Werkzeugen, ohne Kandidat in §5.5**
20. **Speaker-Bilder** — keine Sicht auf Portraits und Bühnenfotos; `/admin/technik` zeigt nur Präsentationen.
21. **Regie-Feinwerkzeuge** — Mikrofonkanäle (`mic_assignments`) und Medienstatus (`media`) sind als Spalten da, aber weder sichtbar noch prüfbar; es fehlen Cue-Status, Verantwortliche als Person, eine Mehrbühnen-Ansicht und eine Ansicht auf `slot_history`.
22. **Programm-Felder** — Kommerz-Status und Partnerbezug am Slot fehlen; `slot.responsible_person_id` („Status Konrad": übergeben an wen) und `session.moderation_person_id` existieren ohne Oberfläche; Masterclass-Priorität und FCFS-Kennzeichen fehlen.
23. **Swapcard-Abgleich für Sessions und Speaker** — heute nur Aussteller; damit fehlen die Statusketten „Ready to Import" und „Published" aus der Speaker-Base ersatzlos.
24. **Volunteer-Werkzeuge** — Nacharbeitssicht (Telefonkampagne), Zertifikate, Unterkunft und Feedback fehlen; Schichtbestätigung, Nachrücken und Erinnerungen gibt es nur als Selbstbedienung und Cron, ohne Bedienelement im Admin.
25. **Öffentliches Speaker-Bewerbungsformular** — es gibt keinen Weg hinein; Speaker entstehen nur durch das Team.

**Zahl: 25 Verwaltungsfunktionen** (davon 10 aus der Kandidatenliste bestätigt, 4 korrigiert oder verschärft, 11 neu).

---

## Fragen an Konrad

1. **Stammdaten der Edition:** Reicht es, Editionen, Tage, Bühnen und Tracks weiter per Migration durch die Architektur-Session anzulegen — oder soll das Team FLS28 allein aufsetzen können? Davon hängt Punkt A1/A2 ab.
2. **Regie:** Braucht ihr Headset- und Handmic-Kanäle sowie den Medienstatus (Slides / Video / Audio / Fonts / Clicker) als eigene Spalten mit Kollisionsprüfung — oder bleibt es beim Freitext wie im Sheet?
3. **Regie:** Braucht ihr die bühnenübergreifende Ansicht, die im Sheet gefehlt hat (parallele Bühnen nebeneinander, Konflikte quer)?
4. **Programm:** Soll der Slot einen Kommerz-Status (Gebucht bezahlt / In Absprache / Wunsch / Zugesagt) und einen Übergabestatus („Status Konrad") bekommen, oder genügt der Weg über die Session und HubSpot?
5. **Swapcard:** Sollen Sessions und Speaker aus dem Portal nach Swapcard laufen? Heute geht nur der Ausstellerlauf; ohne das bleibt die Programm-Übergabe Handarbeit.
6. **Speaker-Bilder:** Braucht das Team eine Sicht auf Portraits und Bühnenfotos (Alt: Sonderansicht „Speaker-Bilder")? Sie hängt am Foto-Upload, der speakerseitig noch fehlt (F4 Lücke 8).
7. **Volunteers:** Braucht ihr die Nacharbeitssicht („NON/FEHLT VOLOS" mit Anrufliste) und die Zertifikate wieder — oder reichen automatische Erinnerung und Selbstbestätigung?
8. **Initiativen:** Genügt der Organisationstyp im Partner-Admin mit einem Filter, oder braucht ihr eine eigene Sicht mit Award, Freitickets und geteiltem Messestand?

---

## Nicht geprüft

- **Nicht am Gerenderten.** Grundlage ist der Quelltext. Was hinter Reitern, Aufklappern und Zuständen liegt, sieht ein Codebefund zwar, aber er sagt nichts darüber, ob es im Betrieb auffindbar und bedienbar ist (Lehre aus F4 §7).
- **Die Alt-Systeme selbst wurden nicht erneut geöffnet.** Alle Alt-Zeilen stammen aus `docs/legacy-inventar.md` (Stand 08.09.2026). Was dort fehlt, fehlt auch hier.
- **make.com nur über die Konsequenzen** (§10). Die Blueprints wurden nicht Szenario für Szenario gegen den neuen Stand gehalten; die 30 bzw. 22 nie ausgerollten Airtable-Automationen sind nicht einzeln aufgeführt.
- **Rechteprüfungen** wurden an Funktionsnamen und Guard-Zeilen abgelesen, nicht durchgespielt — Ausnahmen: `can_edit_stage`, `can_edit_regie`, `is_partner_team`, `is_volunteer_team`, `is_hack_team`.
- **Zeitpunkt.** Die Matrix entstand am 17.09. vormittags; `/admin/team` (#48, 0106) und der Zugriffsschnitt (#49, 0107) wurden am selben Tag gemergt und sind oben nachgetragen, aber nicht erneut gegen den Code geprüft.
- **Mengen und Laufzeit.** Ob Listen ohne Filter (Partner-Übersicht, Personen, Speaker-Tickets, Reisekosten) bei echten Datenmengen noch arbeitsfähig sind, sagt dieser Abgleich nicht.
- **Datenmigration.** Ob die Altbestände in die neuen Strukturen passen, ist eine eigene Frage (AGENTS: Migration der Altdaten ist der letzte Schritt).
