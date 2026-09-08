# Legacy-Inventar — Bestandssysteme FLS26 (Airtable · SoftR · Swapcard)

> **Stand:** 07.09.2026 · **Methode:** read-only Auslesen der Airtable-Bases (Struktur, Vokabulare, Zeilenzahlen, Interfaces), der Notion-Briefings und der Swapcard-Developer-Docs. Keine Personendaten übernommen (aggregiert/redigiert). Zeilenzahlen ≈ (erste Seite à 50 bzw. `totalRecordCount`).
> **Zweck:** Grundlage für den Masterplan der ChefTreff-Plattform (Talent · Speaker · Programm · Partner · Hackathon · Initiativen · Volunteers · Admin · Integrationen).

**Quellen**
- Speaker & Programm: Airtable `appGv7ZYysgs2krlb` · Notion „MASTER BRIEFING FLS26 SPEAKER HUB (SoftR)" `2e217aa69eee807485d2cde028b19f3b` · Notion „Project Briefing Speaker Process – AirTable Automations" `2e017aa69eee80eda10bff1565caa542`
- Partner: Airtable `appbhdF78LhXRbCtL` · Notion „Partner Process 2026 – AirTable" `23917aa69eee8070bb9cda7be770a90a` · Notion „Partner Hub – SoftR" `30017aa69eee8194a5eec744cd168573` · Messeshop (WooCommerce, `partner.chef-treff.de`) — Briefing folgt
- Teilnehmer: Airtable `appHVQhV4Dp76hrMk` (bereits am 21.07. analysiert, siehe Plan)
- Hackathon: Airtable `appVO7yVsIZzdd2Bm` · Luma `luma.com/cheftreff-ai-hackathon`
- Initiativen: Airtable `app7yb6gSbHl6kqVg`
- Volunteering: Airtable `appRrXacJe9PQ748O`
- Swapcard: `swapcard.dev` (Content API, Webhooks, Analytics, SSO)

---

## 1 · Speaker & Programm (`appGv7ZYysgs2krlb`)

### 1.1 Tabellen

| Tabelle | Zweck | ~Zeilen | Schlüsselfelder | Links zu |
|---|---|---|---|---|
| **Speaker (Master)** | Speaker-Stammdaten, SoftR-Login-Quelle | 253 | Full Name (PK), Email (Login-ID), Record_ID, 9 Status-Felder, ~20 Lookups vom Slot | Slots, Speaker Buddy → Moderator, Hotel, Shuttle |
| **Slots & Timetable** | Session/Programm-Ebene, Swapcard-Sync, Regie | 170 | Slot-ID „SL###", Begins/Ends at, Speaker Arrival, Type, 7 Status-Felder, 6× REGIE-Felder | Stages, Speaker (n:m), Moderator, Sponsored Masterclass (Partner) → Exhibitors |
| **Location & Stages** | Bühnen/Tracks (6 Bühnen + Masterclass Track 1–4 + Builder Track) | 11 | Internal name, Display Name, Location | ← Slots |
| **Hotel** | Kontingent 25hours | 16 | Booking Status, Arrival/Departure, Kategorie | Speaker |
| **Shuttle** | Fahrten | 19 | Pick-Up/Drop-Off, Booking Status | Speaker |
| **Moderator & Speaker Buddys** | Stage Leads/Buddys/Moderatoren | 14 | Name, Buddy Type, Portrait | Speaker (129 Zuordnungen), Slots (96) |
| **Exhibitors (Sync)** | Swapcard-Exhibitor-IDs für Sponsored Slots | 90 | Swapcard Exhibitor ID | ← Slots |
| **Speaker-Applications** | öffentliches Bewerbungsformular | 4 | Status (ungenutzt), Talk-Type | — (kein Link!) |
| ARCHIV_Talks & Content / ARCHIV_Masterclass-Bewerbungen | Legacy | 1 / 1 | — | — |

### 1.2 Vokabulare
- **Slot-Day:** Donnerstag / Freitag / Samstag (Briefing sagt Friday/Saturday → Divergenz)
- **Type (Slot):** Keynote, Masterclass, Panel, Interview, Side-Event, Live-Podcast (Briefing zusätzlich: Startup Pitch, Meet the Fund, Company Tour, Break — ungenutzt)
- **Themen (17):** Career & Skills · Leadership & Management · Tech & AI · Industry Insights · Mindset & Personal Growth · Startup & Entrepreneurship · Research & Science · Impact & Sustainability · Sciencepreneurship · Female · Deep Tech · Marketing & Brand · Strategy & Consulting · Venture Capital · Finance & Banking · Politics & Society · Defense & Democracy
- **Status (Swapcard):** Draft · Working On · Ready 2 Publish · Changes 2 Publish · Published · Sync Error
- **Stage Lead Status:** Slot – Missing Information · Ready für Überprüfung · Ready to Import · Imported
- **Hospitality (Status):** VIP · Hotel & Shuttle · Only Hotel · Only Shuttle · No Hospitality (Default)
- **Ticket Status:** Ready to Create → Created and sent to the Speaker · Additional Ticket Yes/No · Discount created
- **Status (Website):** NEW → UPLOADED · **Status (Speaker Form):** Filled / New Update · **Status (Programm):** Bestätigt (Final)
- **Einlass:** Normal / Prio / VIP · **Check-In:** Ausstehend → Akkreditiert – Speaker Counter → Ankunft – Speakerslounge
- **Speaker-Type (= Bühnen-Tag):** Main Stage · Industry · Leadership & Growth · Impact & Tech · Impossible Founders · ZEIT:Future Forum · Masterclass · Stage
- **Buddy Type:** Speaker / General · **Contact Type:** Assistant / Agency / CC · **Hotel:** 25hours Hafencity / Altes Hafenamt
- **REGIE Presentation:** Only Slides · No Slides – Only Backdrop · Video File included · Audio File included · Custom Fonts provided

### 1.3 Programm-Hierarchie (wie modelliert)
`Location & Stages` (11) → 1:n `Slots & Timetable` (170) → n:m `Speaker (Master)`. **Tage sind kein Objekt** (Single-Select + redundantes Datum). Session-Format = `Type` (Select) — Masterclass/Panel/Keynote sind keine eigenen Tabellen. Sprecher pro Slot: 65×1, 13×2, 15×3, je 1×4/5, 5 Slots ohne Speaker. **Fehlt:** Zeitraster/Kapazität pro Bühne, Overlap-Validierung, saubere Tag/Datum-Kopplung.

### 1.4 Speaker-Pipeline
Speaker-Applications (isoliert) → interne Übergabe (Formular) → Speaker (Master) `Status (Website)=NEW` → Onboarding/Hub → `Speaker Form=Filled` → Ticket (Ready → Created) → Graphic Created → `Swapcard=Published` → `Programm=Bestätigt (Final)` → Website UPLOADED → Einlass/Check-In.
- **Manager füllt:** Name, Email, Job Title, Organisation, Sprache, Speaker Lead, Stage, Kontaktperson, Hospitality, Travel-Coverage (+Pauschale), Reception, interne Notiz, Sponsored-Flag.
- **Speaker füllt (Hub):** Job Title, Organisation, Beschreibung, Portrait, LinkedIn, Kontakte, Talk Titel/Beschreibung, Präsentation, Reisekosten-Rechnung, Hotel/Shuttle-Formular.
- **Consent:** kein explizites Feld für Foto/Recording/Veröffentlichung — nur Hilfetexte.

### 1.5 Manager-Scoping (dreifach, nicht normalisiert)
(a) **Airtable-Interface pro Bühne** (9 Stage-Interfaces = faktische Zugriffsgrenze) · (b) `Speaker-Type` Multi-Select filtert Views · (c) `Speaker Buddy`-Link (nur ~54 % der Speaker haben einen). **Kein dediziertes „Speaker Lead"-Feld** — Formular schreibt „Speaker Lead" in `Speaker Buddy`. Interfaces geben Stage Leads **volle Schreibrechte inkl. E-Mail (=Login), Telefon, Hospitality**. Sonderansichten: Speaker-Bilder, BÜHNEN VOLO VIEW (read-only Runsheets), EINLASS & SPEAKERSCARE VOLO VIEW, Regieplan. 12 Standalone-Formulare (5× Onboarding-Varianten, Slot-Eintragung, Stage-Lead-Onboarding, Hotel, Shuttle, Application).

### 1.6 SoftR Speaker Hub (7 Seiten, Login via Email in Speaker Master, nur eigener Record)
1 Welcome (Gruß, Vimeo, Maps, Buddy, Programm-Button) · 2 Onboarding (Stammdaten + Portrait; Email gesperrt; Additional Contacts; Reception-Sektion conditional) · 3 Travel & Accommodation (Hotel-Empfehlung / VIP-Buchung / Shuttle conditional auf Hospitality; Reisekosten-Upload conditional) · 4 Tickets & Access (Ticket-Download) · 5 Your Slot & Presentation (Talk-Felder editierbar, Swapcard-Felder gesperrt, Multi-Upload) · 6 Media Kit & Stage Photos (conditional auf Graphic/Photos) · 7 Support & FAQ (Chatbase, Notion-Wiki-Embed). Formulare nach Absenden sichtbar/gesperrt.

### 1.7 Automationen (43 in Airtable; 13 deployed)
**Deployed:** Hotel-Request → Mail/Slack · Hotel bestätigt → Gmail · Discount created → Gmail · Speaker created → Website=New · On Website → Uploaded · Speaker Form=Filled → Swapcard-Update · Stage Lead Status Ready → Slack · Ready to Import → Swapcard-Flag · Swapcard Imported → Stage Lead Status · Formular-Submits → Type/Status setzen.
**Undeployed/veraltet (30):** ID-Generierung, `SYNC SLOT → SPEAKER` (**0 Aktionen**), Arrival Time −20 min, Travel-Invoice → accounting/Asana, Drive-Ordner, Calendar Invites (+E-Mail-Change-Watcher), AI-Rewrite Title/Description, Swapcard Create Speaker/Sessions/Link, Vivenu Ticket + Companion Code, Remove BG, Placid Graphics, Welcome Mail.
**Extern (make.com):** Swapcard (Event `RXZlbnRfMjczMTM2Mg==`), Vivenu (Event `6880c2c5edb0e5d5e9836369`, Speaker Pass `690cc37bd2cc2724f4543cfb`), Placid, Remove.bg, Drive/Calendar, Slack, Gmail.
**Offen laut Briefing:** Foto-Mail 120 min nach Talk, Präsentations-Reminder 48h/12h, Shuttle-Bestätigung, Banner-Mail.

### 1.8 Befunde / Fragen
1. `SYNC SLOT → SPEAKER` ohne Aktion → doppelte manuelle Pflege.
2. Stage Leads dürfen Login-E-Mail, Telefon, Hospitality ändern → DSGVO-/Fehlerrisiko.
3. „Speaker Lead" ≠ Feld; Briefing-Tabelle „Speaker (Akquise)" existiert nicht.
4. Briefing beschreibt Tabellen (Speaker Management, Ticket-Holder/Transactions Vivenu, Talks & Content), die real fehlen/archiviert sind.
5. Slot-Day-Vokabular Briefing ≠ Base.
6. **Kein Consent-Feld** (Foto/Recording/Veröffentlichung).
7. Speaker-Applications = Sackgasse (4 Records, kein Link, kein Workflow).
8. Datenqualität: Exhibitors mit Test-Records/Duplikaten; Hotel/Shuttle ohne Speaker-Link.
9. Im Briefing vorgesehene Guard-/Statusfelder fehlen real (Error Logs, AI-Processed-Flags) → Loop-Risiko.
10. Zeitmodell (dateTime vs. duration) für Swapcard-Import ungelöst.
11. Notion-Seite „Konrad Helper Fields & Support Logic" ist ChatGPT-generiert/ungeprüft.

---

## 2 · Partner (`appbhdF78LhXRbCtL` „Gipfel 2026 – Partner")

### 2.1 Tabellen

| Tabelle | Zweck | ~Zeilen | Schlüsselfelder | Links zu |
|---|---|---|---|---|
| **Customer-Data** | Partner-Org (Master), Angebot/Rechnung, Ticket-Codes, Shop-Zugang, SoftR-Login, Hack-Onboarding | ~91 | Company (ID/Comm/Legal), Description, Logo (+Removed BG), Partnergraphic, Discount Codes + # Tickets (Partner/Talent), Exhibitor Shop Password/Role, Product Type, Onboarding Filled, Backdrop, Digital Branding, Invoice-Block, 10× „Hack –…" | Contact-Data, Offer-Data, Booth |
| **Contact-Data** | Ansprechpartner je Org (n:1) | 485 | Name, E-Mail, Phone, Position, **Contact Type**, Who added, Swapcard-IDs | Customer-Data |
| **Offer-Data** | gebuchte Leistungen = Angebotszeilen | 900 | Item-ID, Offer (ID), Product Name, Amount, Preise, Status (Masterclasses) | Customer-Data (Produkt nur per Text-SKU!) |
| **Product-Data (All Items)** | Katalog + Messeshop-Sync | 110 | Item-ID (SKU), Category, Supplier, Stock, Preise/Marge, Exhibitor-Shop-Block | — |
| **Product-Data (Bundles)** | Bundle-Auflösung (5 Stand-Pakete) | 34 | Bundle → Included Items | — |
| **Booth (All Information)** | Standflächen & Produktion | 134 | Standnummer, Segment, Type, QM, Rückwand-Maße, Mobiliar, Strom/Wasser, Exhibitor ID (SoftR) | Customer-Data |
| **2026 Gipfel – Partner ALL** | Sales-Longlist | 772 | Unternehmen, Umsatz, Checklist Runs | — (nicht verlinkt!) |
| **Initiativen Alle Bewerbungen** | Studenten-Initiativen | 83 | Status, Art, # Tickets, Gitterbox, Beachflag, Volunteers | — |
| **Masterclasses (Applications)** | Talent-Bewerbungen je Masterclass | 1 (leer) | Participant, Status (Partner/Intern), CV, LinkedIn, Company (Text) | — |
| **Exhibitor Shop – Order Overview** | WooCommerce-Bestellungen | **0** | Klon des Produkt-Schemas | — |
| Hubspot-Kundennummer-Generator, Automation-Settings | Helper | 1/1 | — | — |

### 2.2 Vokabulare
- **Contact Type:** Primary Contact (Operations) · Signing Contact · Accounting Contact · CC Contact · Event-App Member *(entspricht exakt unserem `contact_role`)*
- **Product Type (steuert Hub-Sichtbarkeit):** Sonderstand · 18qm · 9qm · 4qm · Hackathon · Masterclass · Speaking · Company Tour · Digital Branding
- **Leistungen:** All-Inclusive Stand Intro 4qm / General 9qm / Premium 18qm / Start-Up 1,5qm · Signature Stand · Eigenproduktion · Masterclass · Company Tour Spot · Main Stage Panel · Topic Stage Speaking · Stage Branding · Side Event · Tickets-Partner · Tickets-Talente · Add-ons (Rückwand, Monitor, Barhocker, Stehtisch, Teppich, Strom, Beleuchtung, Gitterbox, TV, Catering)
- **Sponsoring-Level (Logo Type Swapcard):** Presenting · Premium · Official · Family · Startup · Hackathon · ZEIT:Future Forum
- **Produkt-Kategorien:** Standfläche, Standbau, Mobiliar, Standgastronomie, Technik, Branding, Specials, Personal, Pflanzen, Stage Products, Tickets, Hackathon, Company Tours, Essentials
- **Booth:** Type BN A/P/S/G/C/B · Produktion/Eigenbau/Sonderbau · Rückwand: nur Druck / Design & Druck / Beachflag / keine · Segmente 00-Intern…11-Crew
- **Status Customer-Data:** Onboarding Filled · Onboarding Call (FB Done / Follow-Up) · Invoice Status (No/Sent/Paid) · Vivenu Codes Created · Exhibitor Shop Role (2 Basic / 3 Limited) · Status (Backdrop) · Hack-OB / Touren-OB / MasterC / Sonderitems
- **Initiativen:** Bewerbung New/In Progress/Accepted/Refused · Agreement Negotiation → Send Offer → Onboarding Filled

### 2.3 Datenmodell (wie modelliert)
Customer-Data (Company ID „C-xxxxx" aus HubSpot) = Hub. **Kontakte** echte Links, rollenbasiert (Primary Contact → SoftR-/WooCommerce-/Swapcard-Login). **Leistungen** echte Links (Offer-Data), aber Produkt/Bundle nur per Text-ID. **Tickets** kein Objekt: Kontingent + Coupon-Code als 4 Felder auf der Org. **Deliverables/Uploads** als Felder auf der Org mit je einem Status-Select — **kein Deadline-Tracking**. **Booth** einzige echte Produktions-Untertabelle.

### 2.4 SoftR Partner Hub (Login Primary-Contact-Mail; Onboarding-Formular als Gate)
Welcome · Unternehmens-Onboarding & Kontakte (editierbar; Kontaktliste read-only) · File-Hub (Angebot, Rechnung, Messeshop-Rechnung, Logo, Rückwand; Upload „Other files") · Tickets (Codes, Vivenu-Embed, Countdown 31.03.) · Event-App (Formular erzeugt Contact „Event-App Member") · Messestand & Rückwand (Backdrop-Upload, Countdown 10.03., Hallenplan, Standliste — nur Stand-Produkttypen) · Hackathon (Challenge-Formular, Preise, Speed-Dating, Backdrop, Team-Formular — User-Group Product Type = Hackathon) · Partner-Shop (Login-Daten, Countdowns, Wiki) · Masterclass (nur wenn Item I-33783 gekauft) · Media Kit · FAQ/Wiki (Chefi-Chatbot) · **Checklist & Deadlines** (Checklist-Tabellen existieren nicht — „not built yet").

### 2.5 Automationen (26; **nur 4 deployed**)
Muster: `record created` Customer-Data → Shop-Passwort, Discount-Codes (Partner/Talent), WooCommerce-Kunde, SoftR-Login-Mail, Vivenu-Coupons · `Onboarding Filled` → Swapcard-Exhibitor · Logo → Remove.bg → Placid → Partnergrafik · Rollen-Zuweisung WooCommerce · Contact created → Staff-Anlage + Welcome-Mails; Swapcard-ID → Attendee/Exhibitor-Zuordnung · Invoice Send → Gmail · Product-Data → HubSpot + WooCommerce-Sync · Backdrop-Upload → Slack.
**Deployed nur:** HubSpot-Kundennummer, 2× Rückwand-Slack, WooCommerce-Rechnungsmail. Deadlines **nur als hartcodierte SoftR-Countdowns** (13.03./27.03. Shop, 10.03. Rückwand, 20.03./31.03./06.04. Hackathon, 31.03. Tickets). Kein Reminder-Mechanismus.

### 2.6 Messeshop / WooCommerce
Shop `partner.chef-treff.de`; Katalog-Quelle Product-Data (110 Items, 68 publiziert). Zugang pro Org: generiertes Passwort + Primary-Mail + Shop-Rolle. Bestellungen landen als Offer-Data-Zeilen (numerische Offer-ID) — Order-Overview-Tabelle leer (toter Klon). Rechnung separat (WooCommerce-Invoice-File, Net Sum); sevDesk nur im Briefing.

### 2.7 Befunde / Fragen
1. Checklist-Tabellen fehlen komplett → Hub-Seite „Checklist & Deadlines" nicht baubar.
2. 4/26 Automationen deployed — Absicht oder Nachwirkung?
3. Hackathon-Feldnamen Briefing ≠ Base (Must/Can vs. Criteria); Team-Felder fehlen.
4. Masterclass-Sichtbarkeit an Kauf-Item gebunden, kein Flag; Applications leer, Text-verknüpft.
5. Pipeline-Bruch: Longlist (772) nicht mit Customer-Data (~91) verlinkt; Lead→Signed in HubSpot, Onboarding→Delivered in Airtable.
6. Order-Overview leer; Bestellungen mischen sich in Offer-Data.
7. Deliverable-Deadlines nicht in Daten.
8. Doppelte Kontakt-Wahrheit (Link vs. Freitext).
9. Hallenplan-PDF an ablaufender Notion-URL.
10. SoftR-Briefing 1.6 „NOT READY"; Prio-Liste: Hackathon/Masterclasses (P1), Company Tours/Branding/Side-Events (P2).

---

## 3 · Hackathon (`appVO7yVsIZzdd2Bm`)

| Tabelle | Zweck | ~Zeilen | Schlüsselfelder |
|---|---|---|---|
| FLS26 – Hackathon Applications | Bewerbungs-Rohtopf 2026 | 512 | Record_ID, Status, Skills, Team Name (Freitext), Unique Onboarding Form |
| Hackathon 2026 – Participants | Zugesagte + Ops | 310 | Status, Challenge, Vivenu Customer ID/Barcode, Swapcard Profile created, Briefings 01.04/06.04, FLS26 Ticket |
| 2025 – Applications / Participants | Vorjahr | 288 / 223 | Challenge 1–7, Empfehlungen, CV, Confirmed |
| 2024 – Participants | Historie (Hackathon+Startup) | 204 | Startup-Phase, Funding, Pitch Deck, Team-Mitglieder |
| Professoren | Multiplikatoren-Outreach | 99 | Uni, Status |
| Hack26 – Feedback & Warteliste 27 | NPS + Warteliste | 29 | Rating, Challenge, Top/Flop |

**Alle 7 Tabellen unverlinkt.** Teams nur Freitext, Challenges nur Select.
**Vokabulare:** Challenge 2026 (7 belegt: BCG Platinion · BioNTech · Eurogate · Factory Berlin · Finanz Informatik · HERO Software · pacemaker.ai; Luma bewirbt 9) · Status: confirmed approval / declined / Absage nach Confirmation · Profession: Bachelor/Master · Dual · PhD/Postdoc · Founder · Freelancer · Professional · Skills (14): ML/DL · NLP · CV · Data Sci/Eng · Frontend · Backend/APIs · Cloud/DevOps · Cybersecurity · Robotics/IoT · Prompt Eng/LLM Apps · Product Design/UX · Business Strategy/GTM · Project Mgmt · How did you hear (10) · Dietary (Omnivore/Vegetarian/Vegan) · Overnight Stay.
**Modell:** Application (512) → Selektion → Participants (310) → Challenge → Ticket (Vivenu) → Swapcard-Profil → Briefing-Wellen → Feedback (29). **Lücken:** keine Teams-/Challenges-/Submissions-/Judging-/Schedule-Tabelle, kein Discord-Feld, keine Application↔Participant-Verknüpfung, Jahre als getrennte Tabellen.
**Luma 2026:** 09.–10.04.2026, Factory Hammerbrooklyn Hamburg, kostenlos mit Auswahl, 350 Plätze / 357 „Went", 18–35 J., „9 challenges, 6 teams per challenge, 3–5 people per team", Veranstalter ChefTreff / Be Brave gUG.

---

## 4 · Initiativen (`app7yb6gSbHl6kqVg`)

| Tabelle | Zweck | ~Zeilen | Schlüsselfelder |
|---|---|---|---|
| Applications & Outreach | Akquise-Funnel | 84 | Initiative (ID), Status (Application/Agreement), Type, Inbound/Outbound, University, # Members, Background, # Tickets, Logo Placement, Mini-Booth, Beachflag, Volunteers, Price, Agreement PDF/DOCX, Rechnungsadresse |
| Onboarding-Data | aktive Partner + Leistungs-/Kommunikations-Tracker | 82 | ID/Display/Legal, Description, Logo, Grafik, 100%-/50%-Discount-Code, # Tickets vs. Redeemed, Standnummer, ~20 Kommunikations-Checkboxen |
| Initiativen – Freitickets | Einlösung Kontingente | 294 | Email, Initiative, Plus One, Status, Volunteering |
| PhD | PhD-Breakfast-Zielgruppe | 125 | Karrierelevel, Studiengang, CV |
| Award | Initiativen-Award | 33 | Stimmen, Mission, Gründungsjahr, Bilder, Zustimmung Datenverarbeitung |
| Messestand | Standbelegung 2 Tage | 9 | Standnummer, Ini Tag 1/2 (Freitext), Logos |
| Alle Ticketholder | Masterclass-Einladungen | 658 | Masterclasses, Einladung, Status |
| Netzwerkpartner FLS27 | Nachfolgejahr, Stub | 3 | Kontakt |
| Ticketholder TUHH / Rostock / Leuphana / KLU | 4 identische Uni-Tabellen | klein | Name, Mail, Assignee, Status |

**Null Record-Links** — Kopplung nur über Text-`Initiative (ID)`.
**Vokabulare:** Status (Application) New/Accepted · Type Initiatives / Universities & Foundations · Inbound/Outbound: Form / University Form / Outbound · Agreement: Send Offer → Negotiation → Onboarding Filled · Background (13): Business · Entrepreneurship · Finance · Consulting · Marketing · Sustainability · Women/Diversity · Science · Tech & AI · Informatik · Engineering · Anderes · Freitickets-Status (Duales Studium … Professional).
**Modell:** Barter-Deal (Tickets + Logo + Mini-Booth + Beachflag + Volunteers gegen 0 €) → Agreement → Onboarding-Form (Logo SVG, 2 Kontakte, Rechnungsadresse) → Vivenu 100%/50%-Codes → Einlösung. Systemkette in Feldbeschreibungen: **HubSpot → Airtable → WooCommerce / Vivenu / Swapcard / SoftR / sevDesk / Placid.**
**Lücken:** Kontingent nur als zwei Zahlen, keine Ticket-Zeilen; Freitickets deckt nur 2 Initiativen; Award dupliziert Org-Daten; 4 Uni-Tabellen identisch; Kommunikation als Checkboxen.

---

## 5 · Volunteering (`appRrXacJe9PQ748O`)

| Tabelle | Zweck | ~Zeilen | Schlüsselfelder |
|---|---|---|---|
| **Volunteers (Confirmed)** | Crew (~250 Felder!) | 266 | Volunteer (ID), Rolle, Lead, T-Shirt, 6× Tages-Zuteilung, 6× Staffed, Zugeteilt Status, Shift Confirmation, Discount-Code 50%, Crew-Buddy, 5 Selbst-Ratings, Sicherheitsbriefing, Zertifikat, ~40 Feedbackfelder |
| **Einsatz** | Positions-/Schichtraster | 222 (98 Positionen) | Position, Briefing-URL, Sicherheitsbriefing, **119 Stunden-Link-Spalten** (Di 07.04. 7 Uhr … So 12.04. 18 Uhr) |
| Waitlist | FLS27-Warteliste + Alt-Profile | 359 | Jahr, Prefilled link, Bewertung, T-Shirt, Areas |
| Accommodation Offer | Hostel-Betten | 37 | Bett, Arrival/Departure, Bezahlung |
| Anmeldung Volunteer Day | Kick-off 24.03. | 62 | Anmeldung, Dietary |
| Ohne Account / Non Confirmed / dedupliziert | Telefon-Nacharbeit | 72 / 53 / klein | Status, ANRUFER |
| Feedback_ / Feedback Team Leads | Retro | 16 / 6 | Ratings, Freitext |

**Vokabulare:** T-Shirt S–XXL · Areas (6): Growth · Partnerships · People · Production · Program · Side Events · Rolle (20): Check-In · Cloakroom · Construction · Infostand/Merch · Production Helpdesk · Sustainability · Speakers Care · Speaker Reception · Afterparty · Marketing · Masterclasses · Company Tours · Hackathon · Stage (6 Bühnen) · Wartepool · Zugeteilt Status: 1–4 Schicht · Wartepool · NEU ZUGETEILT · ÄNDERUNG · ABSAGE · Praktikum · Current Status: School/Bachelor/Master · Founder · Professional 0–3/4–7/7+ · Helped before: no / once / twice · Nacharbeit-Status: AUSSTEHEND · ANGERUFEN-… · POSITIV · ABSAGE · NUMMER FALSCH.
**Schichtmodell:** eine Zeile pro Position-Instanz, Zeit als **119 Stunden-Spalten** mit Links auf Volunteers; Kapazität implizit; **keine Soll-Kapazität, kein Check-in, kein Schichtdauer-Feld** (Team-Lead-Feedback: Start/Ende nicht einsehbar). Zuweisung durch Orga (Volunteer gibt Präferenzen: Areas, Tage, Availability, 5 Ratings). `Shift Confirmation` = Rückbestätigung; Nicht-Bestätiger → Telefon-Kampagne. Briefing via Notion-Wiki-URL, Sicherheitsbriefing, Slides, Zertifikate. Kommunikation: Checkbox-Wellen + WhatsApp-Gruppen + Event-App. **Consent-Feld `Agree` unbelegt.**
**Interfaces:** „NON/FEHLT VOLOS" (Nacharbeit) · „VOLO ÜBERSICHT". 8 Formulare, u. a. **Waitlist FLS27: 13.–17.04.2027, 12.500 TN.**

---

## 6 · Swapcard Developer API (`swapcard.dev`)

- **GraphQL only.** Content API `POST developer.swapcard.com/event-admin/graphql` · Analytics API (NDJSON-Stream) · Exhibitor Leads API (eigenes Token).
- **Auth:** statischer API-Key im `Authorization`-Header (kein Bearer/OAuth), **pro Event** in Studio erzeugt, einmal sichtbar, ohne Ablauf; Rechte = Rechte des zugehörigen Users. Kein Sandbox — Wegwerf-Event nutzen.

| Objekt | R/W | Operationen | Notizen |
|---|---|---|---|
| Event | R | `event(s)` | kein Create/Update |
| People/Attendees | **R+W** | `importEventPeople` (Bulk-Upsert), `updateEventPerson`, `deleteEventPeople` | **`clientId` = externe ID → idempotent.** Gruppen (≥1, müssen existieren), Barcodes, Speaker-Rolle auf Sessions, Exhibitor-Member, Custom Fields, Filter `lastUpdatedSince` |
| Speakers | W via People | `isSpeakerRoleOnPlannings` | kein eigenes Objekt |
| Sessions (Planning) | **R+W** | `importEventPlannings`/`upsertEventPlannings`, `deleteEventPlannings` | Upsert per `clientId`; Titel/Beschreibung (Translations), beginsAt/endsAt, place, speakers, exhibitors, maxSeats, canRegister, Gruppen-Restriktion; Tracks = Custom Fields |
| Places/Stages | R+W | `createLocations`, `updateLocations` | |
| Exhibitors/Sponsors | **R+W** | `upsertEventExhibitors(V2)`, `updateExhibitor(s)`, Sponsor-Mutationen | Upsert per `clientId`; `type` = Sponsoring-Tier; Members, Booths, Dokumente |
| Meetings | R+W | `meetings`, `createMeeting`, `updateMeeting` | Inputs dünn dokumentiert |
| Custom Fields | R+W | Field-Definitionen (10 Typen) für People/Exhibitors/Planning/Products | Select-Keys werden geslugged |
| Groups/Ticket Types/Roles | R+W | `createEventGroup`, `createTicketType`, `createRole` | |
| Codes/Check-in | W | `accessCodesScan`, `createCode` | dünn |

- **Webhooks:** People/Exhibitor/Planning CREATE·UPDATE·DELETE, Planning Attendee CREATE·DELETE (Session-Anmeldung), Meeting CREATE·UPDATE; **kein Check-in-Webhook**; HMAC-SHA256 `X-Signature-256`; max 20 Subscriptions/Event; Retry undokumentiert.
- **Limits:** 60.000 Punkte/min, 10.000/Query (Mutation = 1.000 → ≈60 Mutationen/min), Body ≤ 1 MB, Pagination max 200 (empf. 100).
- **SSO:** SAML 2.0 — Swapcard kann **SP** sein (wir IdP), no-code in Studio, **nur mit Branded App / White-Label-Add-on.** Default: Magic-Link 72h.
- **Vivenu:** **kein nativer Connector** (nur Zapier) → Vivenu→Swapcard ist unsere Aufgabe.
- **Implikationen:** `clientId` überall stabil vergeben (wir = Quelle für Programm, Personen, Exhibitors) · Poll (`lastUpdatedSince`) + Webhook-Hybrid · Bulk-Imports statt Einzel-Calls · Key-Management pro Event · SSO kommerziell klären · Tracks/Tiers sind Konventionen, die wir versionieren müssen.

---

## 7 · Querschnitt — wiederkehrende Muster (Input fürs Zielmodell)

1. **Organisation + Kontakte (Rollen) + Leistungen + Deliverables + Kontingente** — identisch bei Partner, Hackathon-Partner, Initiative, Universität. → ein `organization`-Objekt mit Typ/Tier + `engagement` pro Event.
2. **Zweistufiger Funnel Application → Confirmed** in jeder Base (512→310, 84→82, 359→266, Speaker-Applications) — nie verlinkt. → ein generisches `application`-Objekt (Person × Angebot × Status).
3. **Kontingent-/Ticket-Mechanik via Discount-Codes** (Partner, Initiativen, Volunteers, Speaker) → `entitlement` (wer, wie viele, welcher Typ, eingelöst).
4. **Prefilled „Unique Onboarding Form"** als Handshake (Hackathon, Initiativen, Volunteers) → im Portal durch Login ersetzt.
5. **Checkbox-Spalte pro Mailing** als Kampagnen-Log (3 Bases) → `communication_log`.
6. **Deadlines/Checklisten hartcodiert in SoftR**, Checklist-Tabellen nie gebaut → `deliverable` mit Fälligkeit + Status + Reminder.
7. **Rollen-Scoping über Interfaces** (9 Bühnen-Interfaces) → `role_assignment(person, role, scope: event/stage/org)`.
8. **Jahr = neue Tabelle/Base** (2024/2025/2026, FLS27-Stubs) → Event-Dimension (`event`-Edition) statt Klonen.
9. **Consent fehlt systematisch** (Speaker, Volunteers, Partner-Bewerberdaten) → `consent`-Log als Pflichtbaustein.
10. **Automationen überwiegend undeployed / Logik verstreut** (13/43 bzw. 4/26) → Logik in die Datenbank (RPC/Trigger), Transport in make.com.
11. **Person = Bewerbung in einer Zeile, Angebote als Spaltenpaare** (Side-Formate: 5 bzw. 32 Spaltenpaare) → `offering` + `application` als eigene Objekte mit Kapazität, Frist, Warteliste, Ranking.
12. **Partner-Klick löst Mails/Kalender direkt aus** (Masterclasses, kein Review-Gate) und **Partner sehen alle Bewerberdaten** (E-Mail, LinkedIn, CV) ohne dokumentierte Einwilligung → Consent-Gate + Datenminimierung + optionales internes Freigabe-Gate.

---

## 8 · Side-Formate: Company Tours (`appwhzibE1E6Gm7bL`) & Masterclasses (`app7znFsinqqv5O0M`)

Beide Bases sind **Ein-Tabellen-Klone** (dieselbe Tabellen-ID `tblWie36P4WFyVhF7`): eine Zeile = eine Person **mit allen Bewerbungen**; jedes Angebot existiert nur als Spaltenpaar `Bewerbung: X` (Checkbox) + `Status: X` (Select). **Keine Angebots-Entität** (kein Titel, Datum, Ort, Gastgeber, Kapazität, Frist), **keine Warteliste**, **kein Consent**, **keine Ticket-/Partner-Verknüpfung**.

| | Company Tours | Masterclasses |
|---|---|---|
| Angebote | 5 (Sales, Engineering, Marketing, Finance, Consulting) | 32 (Partner/Speaker-Masterclasses, Academy 1/2, Bootcamp 2, iF Builder …) |
| Personen / Bewerbungen | 341 / ≈580 (Ø 1,7) | 1.424 / ≈8.700 (Ø 6,1; Median 5; Max **32**) |
| Status-Vokabular | Zusage · Bewerber (0×) · No Interest · **Other (44 %)** · Absage — je Tour eigenes Option-Set | **nur Zusage / Absage** (~25 % Annahme) |
| Mail-Auslösung | intern gated (`SEND EMAIL`-Checkbox) → Gmail + Google Calendar | **direkt durch Partner-Klick** (`recordUpdated` auf Status) → Gmail + Calendar, kein Review |
| Formatspezifische Felder | keine | Deutsch-/Englisch-Level (Pflicht), Wohnsitz/Gründungsinteresse/Live-Gründung (nur Qonto), `CV: Roland Berger` |
| Exportlisten | `Teilnehmerliste – <Tour>`-Views | fehlen |

**Profil- vs. Bewerbungsfelder:** alle 13 Sachfelder sind Profilfelder (Email, Name, Status, Universität, Studiengang, Leistungseinschätzung, Startup-Phase, Unternehmen, Position, Berufserfahrung, LinkedIn, CV) → **100 % redundant** zum Teilnehmer-Profil. Bewerbungsspezifisch: nur die Checkbox (+ Sprachlevel bei MC). Kein Motivationstext, kein Ranking, keine Verfügbarkeit.
**Interfaces:** 1 List-Page pro Partner (CT 6, MC 32), editierbar nur das eigene Status-Feld; **read-only sichtbar: E-Mail, Nachname, Universität, LinkedIn, CV-Download** — ohne erkennbare serverseitige Filterung auf eigene Bewerber, ohne Rating/Kommentar/Export.
**Consent:** kein Feld; das Bewerbungsformular (`pagH1F2PNF7SKhh5y`) ist **gelöscht** → Einwilligungstext nicht rekonstruierbar.
**Datenqualität:** CV-Füllquote 67 % (CT) / 38 % (MC); Universität/Studiengang/Unternehmen Freitext; Interface-Namen ≠ Statusfelder (Speaker-Namen vs. Format); Automation „Bootcamp 1" überwacht `Status: AI Automation` (Copy-Paste?); `Studiengang` trägt falsche AI-Feldbeschreibung.
**Offene Fragen:** Einwilligungstext? Bedeutung „Other"? Kapazitätsquelle? Kollisionsauflösung bei Mehrfachzusagen? Ticketpflicht? Partner-Mapping auf Company-IDs? `followup bootcamp` / `iF Builder Track` / `FR Section 1–3`-Prozess?

---

## 9 · Vivenu API (`docs.vivenu.dev`)

- **REST/JSON**, Prod `vivenu.com/api`, **Sandbox `vivenu.dev/api`** (eigene Dev-Keys, Webhook-`mode: dev|prod`). Auth `Authorization: Bearer <API key>` **pro Seller** (+ Org-Keys). Rate-Limit laut AGB ≈ **1.000 Requests/h** pro Token (vertraglich prüfen). Pagination `top` ≤ 100 + `skip`.

| Objekt | R/W | Notizen |
|---|---|---|
| Event / Ticket Type | R/W | Ticket-Typen im Event verschachtelt; `requiresPersonalizationMode`, `requiresExtraFieldsMode`, `repersonalizationAllowedMode`, `repersonalizationFee` je Typ |
| Ticket | R/W (eingeschränkt) | `barcode`, `secret`, `status` (VALID / **DETAILSREQUIRED** / INVALID …), Inhaber `firstname/lastname/email/company`, `extraFields`, `customerId`, `transactionId`. **`PUT /api/tickets/{id}` akzeptiert nur `barcode`, `extraFields`, `meta` — nicht Name/E-Mail.** |
| Personalisieren | W | **`POST /api/tickets/personalize/{id}/{secret}`** (PUBLIC, braucht Ticket-Secret): `name, firstname, lastname, extraFields` — **`email` nicht im dokumentierten Body** |
| Transaction | R (+complete/cancel) | Käuferdaten, `tickets[]`, Historie; kein Inhaber-Write |
| Checkout | R/W | serverseitig mit Vorbefüllung (Name, E-Mail, Adresse, `extraFields`, `customerId`); **Item-`meta` propagiert auf Tickets** → Join-Key zum Portal-User |
| Customer | R/W | E-Mail, Namen, `extraFields`, `meta`, `tags[]` |
| Coupon | R/W | `fix` / `var` (%) / `fixPerItem` / `waiveFees`, Single-Use, **Serien** (Bulk-Codes), Ticket-Typ-Filter, Gültigkeit, **Undershop-Unlock + Customer-Tagging** → Kontingent-Mechanik |
| Data Fields | R/W | Personalisierungsfragen (Scope customer/ticket/transaction/checkout), Typen text/select/checkbox/date/documentUpload/signature …, `isPersonalData`, `conditions`, `printable` |
| Ticket Transfer | R/W | Accept **erzeugt neue Ticket-IDs** (alte ungültig) — einziger Weg, den Inhaber (E-Mail) zu wechseln |
| Scans | R/W | `POST /api/scans` (portier.vivenu.com), `scan.created`-Webhook → Live-Anwesenheit |

- **Webhooks:** `transaction.complete/.canceled/.partiallyCanceled`, `checkout.completed/.detailsSubmitted`, **`ticket.created`, `ticket.updated`** (Payload mit Inhaber-E-Mail, Name, Barcode, Status), `scan.created`, `ticketTransfer.*`, `customer.*`. **Kein `ticket.personalized`** (→ `ticket.updated`). Signatur `x-vivenu-signature` (HMAC-Key optional), **Retry undokumentiert** → Reconciliation-Sweep nötig.
- **Personalisierungsmodell:** Event-`dataRequestSettings` (requiresPersonalization, requiresExtraFields, repersonalizationAllowed/Deadline/Fee/Limit, `limitOnlyNameChanges`), je Ticket-Typ überschreibbar; Ticket bleibt bis zur Vervollständigung **DETAILSREQUIRED** (kein PDF-Download); Käufer nutzt `{id}/{secret}`; kann komplett DISABLED werden.
- **Embedding:** `Embed.js` öffnet **Modal** (kein steuerbares iframe): Vorbefüllung nur Ticket-Typ, Coupon, Sprache, `meta`; Callbacks `onCheckoutCompleted`, **`onTicketPersonalized`**, `onTicketCancelled`. SSO-Abschnitt existiert (`enforceAuthentication`), Seite nicht ladbar → mit vivenu klären.
- **Integrationen nativ:** HubSpot, ActiveCampaign, Salesforce, Segment … — **kein Swapcard** (nur Zapier) → Swapcard aus unserem Portal befüllen.
- **Implikationen:** (1) Rückschreibpfad = Personalize-Endpoint mit Ticket-Secret (Secret = Credential, sicher speichern; aus `ticket.created` ernten). (2) **Inhaber-E-Mail vermutlich nicht per Personalisierung änderbar** → Transfer (ID-Wechsel) oder E-Mail als Extra-Field — **größtes Machbarkeitsrisiko, mit vivenu validieren**. (3) Portal-Fragen als Vivenu-Data-Fields (Scope ticket) spiegeln, Feld-IDs als kanonische Keys. (4) Vivenu-Personalisierung „herunterdrehen": `DETAILSREQUIRED` als Sperre nutzen, bis Portal geschrieben hat; Re-Personalisierungs-Limits/Fees beachten. (5) Webhooks + nächtlicher Sweep, Feedback-Loop-Schutz bei `ticket.updated`. (6) Kauf **aus dem Portal** starten (serverseitiger Checkout mit `meta` = Portal-User) → sauberster Join. (7) Kontingente = Coupon-Serien + Undershops. Quellen: docs.vivenu.dev (introduction, tickets, webhooks, events, checkout, transactions, customers, coupons, datafields, ticket-transfers, scans, embed), vivenu.com/partners, AGB-PDF. Nicht ladbar: `api-keys`, `sso`, `embed-js`-Slugs; Endkunden-Wiki hinter Dashboard-Login.

---

## 10 · make.com-Szenarien (Org 1001768 / Team 158498, Stand 08.09.2026)

**123 Szenarien, 35 aktiv.** Aktiv ist nur der Finanz-/Academy-Betrieb (sevDesk-Cockpit, FLA/FLC-Rechnungsentwürfe, Circle-/Google-Groups-Einladungen, HubSpot-Kundennummer, FLS27-Warteliste → AC). **Alle 25 Swapcard-/Vivenu-Szenarien des FLS26-Stacks sind inaktiv** (letzte Bearbeitung Dez 2025–Apr 2026). 122/123 Szenarien vom externen Entwickler erstellt; keine Labels/Beschreibungen, 42 ohne Ordner.

### Swapcard (Richtung Airtable → Swapcard, einseitig; ein Event `RXZlbnRfMjczMTM2Mg==`)
- **Teilnehmer** (8217084, Webhook aus `Participants (Unified Profile)`): `importEventPeople.create` mit `clientId = Airtable-Record-ID` (Dedup-Schlüssel), `email`, `firstName/lastName`, `organization` (Arbeitgeber), `address.*` (4 Zeilen), `updateBarcodes {QR_CODE, Barcode}`, `isUser/isVisible = true`. **Alle 9 Ticket-Typen in derselben Gruppe** (`…NjM1ODMy`); Differenzierung nur via Custom Field `Ticket (Type)`. Zweiter Call setzt **13 Custom Fields** (Status, Uni, Erfahrung, Arbeitgeber-Art, Level, Startup-Phase, Startup-/All-Themen, Karrieremöglichkeiten, Leistung, Studienhintergrund, Studiengang). 18 nahezu identische Untermodule für die 8 „Studiengang: X"-Felder. Rate-Limit-Schutz nur per `Sleep(random 1–45 s)`.
- **Speaker** (8518726 Create täglich 22:00 / 8523439 Changes): aus `Speaker (Master)`: email, Name, `Job Title`, Organisation, Bio (Newlines→Leerzeichen, `"` escaped), eigene Speaker-Gruppe `…NjM1ODMz`; Portrait: Removed-BG → Original → sonst Slack-Warnung + Anlage ohne Foto. Rückschreibung `Swapcard ID (Speaker)`, `Status (Swapcard)=Published`.
- **Sessions** (8520713 Create 22:45 / 8529765 Update): aus `Slots & Timetable`: `clientId = Slot (ID)`, Titel/Beschreibung `de_DE`, `beginsAt/endsAt` ISO-UTC, `bannerUrl`, `isRatable`, `isOverlappingAllowed`, `accessControlMode: TRACKING`; Custom Fields Type, Stage, Language, Themen (choices). Rückschreibung `Swapcard ID (Session)`.
- **Verknüpfungen**: 8530426 Speaker↔Session (23:30, `speakersIds` via `eventPerson(filters.clientIds)`), 8537585 Exhibitors↔Session (23:45, `exhibitors {ADD}`).
- **Exhibitors** (7874519, `Customer-Data`): `upsertEventExhibitors` mit `clientId = Company (ID)`, name, description, logoUrl — **rohes HTTP mit Basic-Auth-Header im Klartext** statt Connection.
- **Staff/Partner-Personen** (7879847/8747153): nur Kontakttypen *Primary Contact (Operations)* und *Event-App Member* → Person + `isMemberOnExhibitors {ADD}`.
- Error-Handling: Filter `errors > 0` → Slack-DM (Konrad + Entwickler); kein Retry, keine DLQ.

### Vivenu (Event FLS26 `6880c2c5edb0e5d5e9836369`)
- **Eingehend „Ticket Personalization"** (8188613, Webhook, Filter eventId + `status ≠ INVALID`): Vivenu `extraFields.26_*` → Airtable `Ticket-Holder` und Upsert `Participants (Unified Profile)` per E-Mail-Suche. Felder: `26_email`, `26_birthday` (→ DD/MM/YYYY), `26_cv` (Attachment), `26_name_arbeitgeber`, `26_university`, `26_linkedin`, `26_gender`, `26_aktueller_status`, `26_aktueller_arbeitgeber`, `26_berufserfahrung`, `26_karrierelevel`, `26_karrieremoglichkeiten`, `26_studienhintergrund`, `26_startup_phase`, `26_startup_themen`, `26_themen`, `26_akademische_leistung`, `26_study_course_{business,finance,informatics,engineering,naturwissenschaften,marketing,socialsciences,medicine}`. **`Ticket (Type)` = Split von `ticketName` an „|"** (fragil). Danach AC-Upsert (Liste 40, Tags 189/87). → **Bestätigt: Personalisierungsfelder = Airtable-Felder** (Frage 34.2).
- **Eingehend „Ticket Purchase"** (8151613): Router über 9 `ticketTypeId` (Student `…1389`, Talent `…138a`, Startup `…138c`, Professional `…138d`, Investor `…138e`, Supporter `690cc35f…`, Partner `…138f`, Speaker `690cc37b…`, Crew `6994d8bb…`) → `Transactions (Vivenu)` mit Käuferdaten, `realPrice/regularPrice`, `createdAt`; **Dedup im Szenario** (existiert → `# Tickets +1`, nicht idempotent). AC Liste 40, Tags 190/87.
- **Ausgehend Freitickets** (8567089 Speaker, 8695812 Hackathon, 8797003 VC Breakfast): `POST /api/customers` → `POST /api/tickets/free` (ticketTypeId Speaker) → `POST /api/tickets/{id}/mail`; Rückschreibung Barcode, Customer-ID, Status. Adresse hartcodiert auf ChefTreff-Geschäftsadresse.
- **Coupons** (8591430 u. a., aus `Customer-Data`): `POST /api/coupon` mit `code = Discount Code (Partner)`, `discountType: var, discountValue: 1` (=100 %), `maxUsage/maxTickets = # Tickets Partner`, `allowedEvents`, `allowedTickets` (Partner-Pass; Talent-Zweig: Talent+Student), Tags, `validUntil 2026-04-11`. **Keine Undershops genutzt** — Kontingente rein über Coupons.
- Alle ausgehenden Vivenu-Calls: **rohes HTTP mit hartcodiertem Bearer-Key** (in ~9 Szenarien).

### Übrige Systeme
- **HubSpot** 7384513 (täglich 22:30): `WatchCRMObjects` Deals → Deal/Company/Contact/Quote/**LineItem** → Upsert `Customer-Data`, `Contact-Data`, `Offer-Data`, `Product-Data`; Rückschreibung `updateContact`. 7177050 Deal → sevDesk-Kontakt. 7125951 **aktiv**: Kundennummern (15 min).
- **ActiveCampaign**: immer `upsertContact2024` → Liste → Tags. FLS27-Warteliste **aktiv** (Liste 50, Tag 136 + Status-Tags 203–212). Gipfel: Liste 40, Tags 87/189/190.
- **sevDesk** (lebendigster Teil): Cockpit-Exporte (wöchentlich, CSV → Drive, Slack-Report) und FLA/FLC-**Rechnungsentwürfe** (stündlich): Airtable-Filter → `Contact` → `ContactAddress` → `Invoice` (Status 100 = Entwurf, 7 % USt, 14 Tage) → `InvoicePos` → Kostenstelle → Airtable-Status → Slack → Gmail-Entwurf (kein Autoversand). → **Vorlage für unsere automatisierten Rechnungsentwürfe (Regel 41).**
- **Typeform** (6, inaktiv außer FLS27) → Airtable → AC · **Luma** 8709200/8709188 (inaktiv) · **Placid/Remove.bg** Grafiken (inaktiv) · **WooCommerce** Kunde/Rechnung (inaktiv) · Gmail-Belege → Drive, Info@-Automation (aktiv).

### Muster & Risiken
1. 🔴 **Hartcodierte Zugangsdaten**: Vivenu-Secret-Key im Klartext in ~9 Blueprints, Swapcard-Basic-Auth in 7874519 — lesbar für alle mit Team-Zugriff, in jedem Export enthalten. → **Rotation + Umstellung auf Connections.**
2. 🔴 **~23 verwaiste, aktive Webhooks** ohne Szenario (Gipfel 24/25, Vivenu Personalization, Speaker-Onboarding, Pitch Competition …) nehmen weiter Requests an; Vivenu/Swapcard-Hooks zeigen auf inaktive Szenarien.
3. 🟠 **Personenbezogene Sample-Daten** (Klarnamen, E-Mails, Telefon, CV-Links) dauerhaft in `metadata.designer.samples` der Blueprints.
4. 🟠 Ticket-Typ an vier Stellen unabhängig kodiert (ticketTypeId, Airtable-Literal, `ticketName`-Split, Textvergleich) → Umbenennung bricht Sync still.
5. 🟠 Dedup nur im Szenario (Search → Create|Update), kein Unique-Constraint, Zähler nicht idempotent.
6. 🟡 Error-Handling uneinheitlich; Leerlauf-Läufe (Rechnungsszenarien stündlich ohne Arbeit, 15 leere Stubs); Bus-Faktor 1.

### Konsequenzen für die Plattform
- Sync-Konventionen übernehmen: `clientId` = unsere stabilen IDs (`person.id`, `slot.id`, `organization.id`); Speaker eigene Gruppe; Sessions mit `isOverlappingAllowed`, Tracks als Custom Field.
- Ticket-Typ **ausschließlich** über `ticketTypeId`-Mapping-Tabelle (FLS27-Event neu anlegen → neue IDs).
- Vivenu-Personalisierungsfelder `26_*` = unser Feldkatalog → Portal übernimmt sie (Variante A), Vivenu behält Name/E-Mail.
- Kontingente: Coupons wie bisher (100 %, `allowedTickets`, `maxTickets`) + optional Undershop je Partner (Konrads Secret-Shop-Wunsch; API-Fähigkeit offen → Support-Frage 5).
- Freitickets (Speaker/Crew/Volunteers) über `/tickets/free` + `/mail`.
- Rechnungsentwürfe: sevDesk-Muster (Contact → Invoice Status 100 → Positionen → Kostenstelle) 1:1 als Vorlage.
- AC-Push: `upsertContact` → Liste → Tags; Tag-Konvention aus FLS27-Warteliste fortführen.
