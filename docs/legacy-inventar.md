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

---

## 11 · Regieplan 2026 (Google Sheet) → Anforderungen Produktionsportal / Regie-Ansicht

**Struktur:** 16 Tabellenblöcke; **12 = Run-of-Show FLS26, je ein Block pro Bühne × Tag** (10./11.04.2026 × Main Stage, ZEIT:Future Forum, Leadership & Growth, Startup/Impossible Founders, Industry, Impact & Tech); 4 Legacy-Blöcke ChefTreff 2023 (anderes Schema). Block-Kopf: Stage · Tag · `Anforderungen:` · `Lichteinstellung:` (beide überall leer) → zweizeiliger Header → Zeitzeilen → `Ende`.

**Spalten (in Reihenfolge):** `Start` · `Dauer` · `End` (= nächster Start) · `Aktion` (Cue-Text) · `Slot ID` (SL###, Programm-Schlüssel) · `Format` · `Title` · `Moderation` (alle Personen auf der Bühne **mit Headset-Nummer im Text**, z. B. „Name (Headset 3)", „(Handmic 1)") · `Regie` (Slides/Video/Audio/Fonts/Clicker/Publikumsmikro, teils Slide-für-Slide-Skripte) · `Backstage` (Verkabeln/Entkabeln, Slides laden, Wasser) · `Mobiliar` · `Sonstige Notizen, Watchouts`.

**Zeilenmuster:** strikte **3er-Sequenz** „Aufgang Speaker (1 min) → Session (Slot ID/Format/Title, ~28 min) → Abgang + Übergangsmoderation (1 min)". Weitere Cue-Typen: Technik-/Team-Besprechung, Soundcheck, Crew-Briefing, DOORS OPEN/Einlass, Set-Up, Countdown-/Intro-Video, Welcome/Closing, `Break 15/20/25`, `Puffer` (50×), Umbau (5 min), Pitch, Podcast-Aufnahme, Award. Granularität **1 Minute** (Main Stage 30 s); Zeitleisten **lückenlos, ohne Überlappung** je Bühne; **parallele Bühnen nicht nebeneinander** → bühnenübergreifende Konflikte unsichtbar.

**Herkunft der Felder:** *aus dem Programm* — Bühne, Tag, Start/Dauer/End, Slot ID, Format, Titel, Speaker/Moderation. *Produktionsspezifisch* — Cue-Label, Headset-Kanäle, Regie-Medienstatus + Skripte, Backstage-Aktionen, Mobiliar, Notizen, (leere) Bühnenanforderungen/Licht-Preset.

**Fehlt heute:** keine Status-/Checkbox-Spalte; Änderungen als Freitext („VERSCHOBEN! NEUE ZEIT!!", doppelte Slot-ID); Verantwortliche nur als Spaltensemantik (Regie/Backstage/Technik), nie als Person; Headsets als Freitext → Doppelbelegung nicht prüfbar.
**Datenqualität:** verbundene Zellen; 132 Slot-Zeilen / 131 eindeutige IDs (SL133 doppelt), Varianten `SL71`, `SL052-2`; Format-Spalte auf 229 Cue-Zeilen leer, Tippfehler (`Pannel`, `Key`); ~20 Schreibweisen für „keine Slides/nur Backdrop"; Namen mit Leerzeichen-Fehlern; Zeilenumbrüche in Titeln.

**Ableitung für die Plattform (Regie-Ansicht = Programm + Produktionsschicht):**
- `regie_cue` je Bühne×Tag: `sort_index`, `slot_id` (nullable — Cue-Zeilen ohne Slot), `cue_type` (setup · briefing · doors · walk_in · speaker_on · session · handover · transition_mc · break · buffer · umbau · video_roll · opening · closing · award · pitch · recording), `label`, `start_time`, `duration_s` (+ berechnetes Ende, **Lückenlosigkeits-Constraint**), `notes`, `watchouts`, `status` (draft · confirmed · changed · moved · cancelled), `supersedes_cue_id`, `responsible_role` (regie · stage_manager · backstage · runner · technik), `responsible_person_id`.
- `mic_assignment` (Kanaltyp headset/handheld/lavalier/boom, Kanalnummer, Person) → **Konfliktprüfung** statt Freitext.
- `regie_media` (slides_state none_backdrop/slides_only/slides_plus_video, has_video, has_audio, custom_fonts, asset_url, clicker_needed, audience_mic_needed, cue_script) — **gespeist aus dem Tech-Rider des Speaker-Portals**.
- `backstage_action[]`, `furniture[]`; Bühnen-Tag-Kopf: `stage_requirements`, `lighting_preset`, `version_status_date`.
- Ansichten: Timeline je Bühne×Tag (druck-/tabletfähig für vor Ort), **Mehrbühnen-Ansicht** (bühnenübergreifende Kollisionen), Änderungs-Log statt „VERSCHOBEN"-Freitext; Regie-Zeilen entstehen automatisch aus Slots (Aufgang/Session/Abgang-Sandwich als Vorlage) und werden nur ergänzt.

---

## 12 · Referenzen: Vivenu-Call (Granola), OMR-Ticketflow (Slack), Hear-Me-Speak (im-attending)

### 12.1 Vivenu × FLS27 — Call 08.09.2026 (Granola-Notiz)
- **Kein Headless-Shop.** Kauf bleibt im vivenu-Shop (inkl. Account-Anlage); **am Ende des Checkouts Redirect auf eine externe Confirmation Page bei ChefTreff**, die die vivenu-Bestätigungsseite 1:1 nachbaut. vivenu übergibt die **Transaction-ID**; darüber sind Tickets und Rechnungen per API abrufbar.
- **Personalisierung danach in der ChefTreff-Umgebung, verpflichtend** (Matchmaking ist der Kern). Rückweg per Webhooks + Ticket-Endpunkten; zurückgespielt wird nur das Minimum **Vorname, Nachname, Position, Unternehmen** (Badge-Druck). Alles Weitere bleibt in Supabase. Beide Wege können **parallel** laufen (vivenu-Maske bleibt, schrittweise Umzug); vivenu meldet per Webhook, wenn personalisiert wurde.
- **QR/Ticket:** bisher wurde aus dem vivenu-Ticketcode der QR nachgeneriert und in die Event-App gepusht → Scan-Code = Ticket-Code. Ticketausgabe bleibt bei vivenu.
- **Identität:** E-Mail als Unique Identifier **plus vivenu-Customer-ID mitführen** (stabil bei E-Mail-Wechsel). SSO/IdP auf 2027 verschoben; falls später: **Auth0 / OpenID Connect** (nativ in vivenu, Einstellungen → Accounts).
- **Segment-Feature** (Secret-Shop-Zugang per E-Mail-Domain, z. B. Uni-Kontingente) bleibt zentral; Zuordnung dauert **bis zu 1 h**.
- **Badge Printing:** vivenu-Standarddrucker, kein Full-Color-Live-Print; Badges werden vorgedruckt und vor Ort beklebt.
- **Nächste Schritte vivenu:** Doku „Transaktionsbestätigungsseite austauschen" + Liste nutzbarer API-Endpunkte. Aufwand ChefTreff ~2–2,5 Monate bis Shop-Go-live; bei Problemen pragmatisch verwerfen.
- **Nicht geklärt:** personalisierende E-Mail ≠ Käufer-E-Mail (Ticket-Zustellung an Dritte, Mailflow), wer die Bestätigungs-/Ticket-Mail sendet, Rechnungsdarstellung auf eigener Seite, **Einlass-Setup** (CoreGo vs. vivenu vs. Fastlane, Throughput 10.000), Pfand/Cashless (braucht POS-Terminals).

### 12.2 OMR-Ticketflow (Slack C02NT90T9QT, 29.04.2026)
1. **Login zuerst** (Google-/LinkedIn-SSO oder E-Mail, Captcha) → Identität steht vor dem Checkout. 2. **Checkout** mit Sticky-Summary; auch beim 0,00-€-Freiticket werden Kontakt + Rechnungsdaten abgefragt (Begründung: Cashless-Freischaltung). 3. **Personalisierung direkt danach** (`/order/<id>/edit`): pro Ticket eine Karte, Toggle „Für mich / andere Person", Sprache, E-Mail*, Telefon*, Titel, Anrede*, Name*, Geburtsdatum*, Land*, **Job Level*** (Badge-/Matchmaking-Daten beim Kauf), Job-Opt-in; Statusliste „noch nicht personalisiert"; **„Vorerst überspringen"** (Pflicht mit Aufschub). 4. **Confirmation Page** „Buchung erfolgreich": Next-Best-Actions (Tickets/Rechnungen, Programm entdecken, **Interessen anlegen → Matching**, LinkedIn teilen) + Add-on-Kacheln (**Hotel Deals, DB Event Ticket**, Bundle-Rabatt). Team-Take: Hotel + Bahn direkt danach ist smart; Codes für andere Formate abschauen. Kein Beleg für Check-in-Scan oder echtes Pfand-Deposit.

### 12.3 Hear-Me-Speak (im-attending.com, Fremd-SaaS)
Input für FLS: **nur Foto** (Engine kann konfigurierbare Textfelder); Adjust: Zoom 0,5–3,0×, Drag, Canvas-Masking; Output: SVG-Template + Foto → **PNG 1104 × 1104 (nur 1:1)**, reiner Download (kein Share-Intent); rollenbasierte Template-Varianten möglich; „Powered by I'm Attending"-Badge nicht abschaltbar; Download-Tracking. **Rebuild im Speaker-Portal:** SVG-Template + Canvas-Composite, Zoom/Drag, PNG-Export — plus Vorbefüllung Name/Titel/Slot aus dem Profil und Formate 1:1 / 4:5 / 9:16.

## 13 · Alte Portale (Walkthrough per Chrome, 08.09.2026, read-only)

Drei getrennte Logins heute: **Partner Hub** (SoftR), **Speaker Hub** (SoftR), **Messeshop** (WordPress/WooCommerce). Alle drei werden durch Bereiche des einen Portals ersetzt (Entscheidung „ein Portal", Antwort 45).

### 13.1 Partner Hub — `partnerhub.chef-treff.de` (SoftR, FLS26, Deutsch)
- **Login:** SoftR E-Mail-Login; Nutzer-E-Mail unten links; „Made with softr"-Badge. **Navigation:** Home `/`, Onboarding `/onboarding-kontakte`, Tickets `/tickets`, Event App `/eventapp`, Messestand `/messestand`, Messeshop `/messeshop`, Hackathon `/hackathon`, Media Kit `/media`, Alle Dateien `/filehub`, FAQ and Wiki `/faq`.
- **Seitenmuster (überall gleich):** Hero (Titel, Intro, Bild) → „Auf dieser Seite"-Karten (Anker) → Abschnitte mit SoftR-Blöcken (Listen/Formulare/Countdowns). Viele Datenblöcke laden verzögert („Loading…") oder sind nutzerbezogen — Struktur, die sich im Portal 1:1 als **Bereich + Aufgaben-Checkliste** abbilden lässt.
- **Home:** Begrüßung, Hinweis auf Chatbot „Chefi", Event-Info CCH; Kacheln: Onboarding-Formular, Alle Dateien, Eure Tickets, Event-App, Wiki & Chatbot, Partner-Shop, Kommunikation.
- **Onboarding & Kontakte:** Unternehmensinfos (Logo, Beschreibung, Aktivierungsdetails) + Tabelle **„Eure Ansprechpartner"** (Vorname, Nachname, E-Mail, Art des Kontakts; bearbeitbar). Hinweis: Event-App-Mitglieder werden separat im Bereich Event-App ergänzt → im Portal **eine** Personenliste mit Rollen (Kontaktart + App-Zugang) statt zwei Listen (P-Feedback).
- **Tickets:** exklusiver Partner-Ticketshop-Zugang mit Codes + Anleitung; **Countdown-Deadline 31.03.2026**; Text „mehr Tickets → Konrad" (manueller Pfad).
- **Event App:** Formular „Team-Mitglieder hinzufügen" (Vorname, Nachname, Position, E-Mail); Checkliste Aussteller-Profil, Lead-Scanning, offene Stellen (→ Swapcard-Ingest, Inventar §6).
- **Messestand:** Tabelle **Standardausstattung** = Produktkatalog: Start Up/Initiativen 1,5 qm (1 Tresen, 2 Barhocker) · Basic 4 qm (2 m Rückwand inkl. Druck, 1 Stehtisch + 2 Barhocker, Teppich, Strom 230 V, Beleuchtung, Reinigung) · All In 9 qm (4 m Rückwand, 2 Stehtische + 4 Barhocker, …) · Premium 18 qm (6 m Rückwand, 2 Stehtische + 4 Barhocker + 1 Tresen, …). **Rückwand-Upload** („Wiki" + „Jetzt hochladen"), Countdown **13.03.2026 23:59**, danach „Updates per Mail an Konrad" (manueller Fallback → Portal: Upload mit Versionierung + Sperre nach Deadline, Prüfstatus). Hallenplan als vorläufiger technischer Plan; visualisierter Plan später.
- **Messeshop / Hackathon / Media:** Linkseiten (WooCommerce; Hackathon 09./10.04., Factory Hammerbrooklyn, Discord; Partnergrafik + Media Kit).
- **Alle Dateien (`/filehub`):** „Angebot, Rechnungen, weitere Dateien hochladen" — Inhaltsblock beim Lesen leer/nicht geladen (nutzerbezogene Liste). Portal: Dokumente aus SevDesk + eigene Uploads pro Organisation.
- **FAQ & Wiki (`/faq`):** Chatbot **„Chefi"** (Chatbase-Embed) + **Notion-Wiki-Embed** mit Kategorie-Filter (Allgemein, Company Tours, Hackathon, Masterclasses, Partner & Messe, Speaker, Volunteers) und 26 Artikeln (identisch mit Notion-DB, §14). Speaker-Artikel sind für Partner sichtbar (keine Zielgruppen-Trennung).
- **Ableitungen:** Informationsarchitektur ist bewährt und wird übernommen (Home/Onboarding/Tickets/Event-App/Stand/Shop/Hackathon/Media/Dateien/Wiki) — aber produktbasiert gesteuert (nur gebuchte Leistungen sichtbar), Deadlines aus der DB (`deadline` je Edition) statt fester Countdown-Blöcke, keine Mail-Fallbacks, Fortschrittsanzeige pro Aufgabe.

### 13.2 Speaker Hub — `speaker.chef-treff.de` (SoftR, FLS26, Englisch)
- **Login:** SoftR E-Mail („Welcome back"); Begrüßung personalisiert („Hi {Vorname}"). **Navigation:** Welcome `/`, Onboarding `/onboarding`, Travel & Accommodation `/travel`, Tickets, Access & Getting there `/tickets`, Your Session: Slot, Program & Presentation `/your-session`, Media Kit & Stage Photos `/media-kit`, Help & Support `/help`.
- **Welcome:** Support-Team (General Contact = Konrad; **Speaker Buddy = Freelancerin mit privater Gmail-Adresse und privater Mobilnummer im Portal** → im neuen Portal Rollen-Postfächer/Portal-Nachrichten statt privater Kontaktdaten), Event Info (CCH-Adresse; Fr Doors 12:00/Programm 13:00, Sa 11:00/12:00), Link zum öffentlichen Programm, Navigationskarten.
- **Weitere Seiten:** siehe 13.4 (Fortsetzung des Walkthroughs).

### 13.3 Messeshop — `partner.chef-treff.de` (WordPress + WooCommerce, Deutsch)
- **Login** „FLS ANMELDEN" (WooCommerce-Konto). **Mein Konto** ist auf **„Bestellungen" + „Abmelden"** reduziert (Adressen/Downloads ausgeblendet). Landing: 3-Schritte-Erklärung (Kategorien entdecken → Warenkorb → Bestellung absenden, **2 Deadlines**, Video), CTAs „Zum Wiki" / „Zum Shop", Datenschutzhinweis im Footer.
- **Technik (aus Admin-Bar sichtbar):** Admin-Pfad umbenannt (`/pct-admin/`), Plugins u. a. Query Monitor, Internal Link Juicer; WooCommerce-Sichtbarkeit „Live". Bis zur Abschaltung weiter patchen (Checkliste).
- **Bestellungen/Katalog:** siehe 13.4.


### 13.4 Speaker Hub — Unterseiten, Messeshop — Bestellungen & Katalog (Fortsetzung 08.09.)
**Speaker Hub (SoftR, EN):**
- **Onboarding `/onboarding`:** Detailansicht des eigenen Datensatzes mit „Edit": First Name, Last Name, Email, Job Title, Organization, Preferred Language, LinkedIn Profile, Personal Description. Hinweis „if someone else is completing this form on your behalf" (→ Assistenz-Rolle, Frage 58). **Additional Contact** (Contact First/Last Name, Email, Phone, Contact Type z. B. Agency). **Speaker Reception** (Fr 10.04.) mit Anmeldung über eingebettetes Fenster (Luma-Embed) → im Portal eine Session mit `access_mode = registration` (Antwort C).
- **Travel & Accommodation `/travel`:** Travel FAQ (Toggles: Arriving by Car / Public Transport), **VIP Hotel Booking**, **Shuttle Service Booking** (status-gated, vgl. Hospitality-Regel Antwort E).
- **Tickets, Access & Getting In `/tickets`:** Your Speaker Ticket (persönlich), **Additional Ticket Request** (ein kostenloses Begleitticket per E-Mail-Eingabe), Speaker Counter & Area (Badge-Ausgabe, Backstage).
- **Your Session `/your-session`:** **Session Content** (Title, Description, Topics, Language; ChefTreff darf Wording anpassen, finale Version wird angezeigt → zwei Versionen „eingereicht/final" sichtbar), **Your Time & Location** (finaler Slot + Bühne + Hallenplan), **Upload Your Presentation** (PDF/PPTX empfohlen, Dateiname `LastName_FirstName`, Videos separat, **Deadline 10.04. 12:00**, Überschreiben erlaubt, Vorschau), FAQ-Toggles (Formate, Upload, Videos, Setup vor Ort, Content-Kontakt).
- **Media Kit & Stage Photos `/media-kit`:** Bühnenfotos ~48 h nach dem Talk („Download my Photos"), **Personal Speaker Graphic** (Vorschau + PNG-Download je Speaker, vgl. §12.3), Media Kit.
- **Help & Support `/help`:** Chatbot (Chatbase) + Speaker-Wiki-Embed (gleiche Notion-DB wie Partner, §14).
- **Ableitungen (ergänzend zu R1–R12):** Begleitticket als strukturierter Request in `ticket` statt Freitext-Mail; Präsentations-Upload mit Deadline-Sperre, Versionen und **Technik-Check-Status** (Regie sieht „geprüft"); Session-Content mit Diff „eingereicht vs. final"; Slot/Bühne aus `slot`/`stage` (keine Doppelpflege); Speaker-Grafik-Generator als C-Feature; keine privaten Buddy-Kontakte.

**Messeshop (WooCommerce):**
- **Bestellungen `/my-account/orders/`:** Tabelle Nr./Datum/Status/Gesamtsumme/Aktionen; Hinweis „E-Mail-Adresse bestätigen, um frühere Bestellungen zu verknüpfen"; nur Testbestellungen sichtbar (Konto Konrad).
- **Katalog `/shop/`:** Kategorien **Essentials, Pflanzen, Mobiliar, Personal, Specials, Standgastronomie, Technik**; ~80 Produkte auf 7 Seiten (12/Seite). Je Produkt: Name, Beschreibung, **Bestand** („x Vorrätig"), Preis (z. B. 6-fach-Steckdose 18,00 · iPad 68,80 · MacBook Air 91,30 · Airhockey 300 · Billardtisch 360 · Aftermovie 3.900 · 100 Cocktailgläser 43,20). **„Auf Anfrage"-Produkte** stehen mit 0,00 € im Katalog und verweisen auf Mail an Konrad (z. B. Aperitifbar inkl. Personal).
- **Ableitungen (ergänzend zu S1–S5, Antwort D):** Produktkatalog mit Bestand/Einheiten in `product`, Bestellung je Organisation mit **zwei Phasen/Deadlines** aus `deadline`, Anfrage-Produkte als **Anfrage-Flow** (kein 0-€-Kauf), Rechnung über SevDesk, Netto/Brutto-Anzeige klären (Handover-Doku). Produktdaten bei der Migration per WooCommerce-CSV-Export; Handover-Doku liegt in Drive `00 Messeshop Handover` (HANDOVER.md, PLAN.md, system-overview-langdock.md, CLAUDE.md).

## 14 · Wiki & Chatbot (Notion „Wiki - FUTURE LEADER SUMMIT 2026", Chatbase „Chefi") — Stand 08.09.2026

**Anforderung (Konrad):** Wikis + Chatbots gibt es wieder — **je einzeln für Speaker, Partner und Teilnehmer**, jeweils mit eigenem Wiki.

- **Quelle heute:** Notion-Wiki-DB `12717aa69eee81589e2cddf668eb3eab` (Data-Source `collection://12717aa6-9eee-8133-85ac-000bd9c9693e`), **26 Einträge**. Properties: Page (title), **Kategorie (multi_select:** Allgemein, Partner & Messe, Speaker, Hackathon, Company Tours, Masterclasses, Volunteers), Messeshop (url, 1×), Files & media (Cover, 23/26), Ansprechpartner (person, überall leer). **Keine** Properties für Zielgruppe, Status, Sprache, Gültigkeit. Verteilung: Partner & Messe 16, Speaker 8, Allgemein 6, Masterclasses 2, Hackathon 1, Company Tours 1, Volunteers 0. Zusätzlich Navigationsseite `12717aa69eee81988b19e7c2f2558492` (3 Spalten: Allgemeines / Messe & Standplanung / Speaking; Zuordnung ≠ Kategorie-Tags).
- **Artikel:** Allgemein — Über ChefTreff · Öffnungszeiten & Ablauf · CCH: Location & Anfahrt · Tickets & Akkreditierung · Media Kit 2026 · Hotelpartnerschaft & Unterkunft · Company Tours. Partner & Messe — Anlieferung (PKW)/Pakete/Aufbau · Anlieferung (LKW) · Stand-Catering & Crew-Verpflegung · Messeshop · Hallenplan & Standübersicht · Rückwand & Druckdaten · On-Site: Help Desk & Aussteller-Kiosk · Recruiting: Best Practices · Eigenbau-Stand: Genehmigung · Event-App · Pfand · Sponsored Talk. Speaker — FAQ: Speaking @ ChefTreff · Präsentationen · Masterclasses · Talk Guidelines & Titel · Speaker Briefing FLS2026. Hackathon — AI Hackathon 2026: Wiki (+ Unterseite „Zeitlicher Ablauf für Teilnehmende").
- **Artikel-Muster (sehr konsistent):** Cover + Emoji (🟢 als informeller Status) → Callout „Worum geht es hier?" → Inhaltsverzeichnis → **H2 als Frage** („Wer muss eine Datei einsenden?") → Bullets/Tabellen/Schritte. 250–900 Wörter (Hackathon-Hub ~3.000). **Durchgängig Deutsch**, keine EN-Version (Speaker Hub ist englisch!). Medien: Loom-Videos, **Airtable-Share-Embed** (Standmaße), PDF (Druckdatenblatt), Bilder. Harte Deadlines im Fließtext (Druckdaten 13.03., Shop 13.03./27.03., Tickets 31.03., Slides 08.04. 18:00, Hackathon-Slides 05.04., Bewerbung 02.04.). Verlinkt auf SoftR-Hubs, vivenu, Luma, Swapcard, Programm.
- **Weitere Wikis:** Wiki-Netzwerkpartner erweitert `28b17aa69eee80bc8e29f4ecd83e8fdd` (20 Einträge, hat Status + E-Mail; Unis/Initiativen) · Container „Wikis" `2f717aa69eee805cb6d6cf707b7d194b` · FLS26 Stage Lead Wiki `f9917aa69eee82c9965b0111b377d74b` (~1.400 Wörter, viele „[wird noch definiert]") · Partner Wiki Hackathon FLS27 `92617aa69eee82709b070121268f3956` (Fragment) · AI-Hackathon-Wikis FLS27/FLS26 `43917aa69eee823287e001e0a5236442` / `19f17aa69eee80c59eedc20ac04c6c17` · Volunteer Handbook `2b517aa69eee815f91cfebdf900d93a5` (~61.000 Zeichen, **Kopie des Slush-Handbooks** = Benchmark) · Archiv Partnerwiki 2024/2025, Sales-, Marketing-, Ambassador-Wiki. **Ein Teilnehmer-FAQ existiert nicht** (Inhalte verstreut in Ablauf/Company Tours/Pfand).
- **Risiken/Veraltetes:** alle FLS26-Daten stale; Emoji-Status nicht auswertbar; Platzhalter `[TBA]`/`[wird noch definiert]` dürfen nicht in den Index; Challenge-Texte 2025 als Beispiele markiert (Bot würde sie als aktuell zitieren); Embeds (Airtable/Loom/PDF) für Bots unlesbar; **mehrere Seiten enthalten private Mobilnummern** → vor Indexierung durch Rollen-Postfächer ersetzen (Checkliste).
- **Zielbild Wissensbasis (Masterplan):** Tabellen `kb_article` (title, body_md, audience[] partner|speaker|talent|volunteer|hackathon, language de|en, edition, status draft|review|live|archived, valid_until, owner, canonical_url), `kb_chunk` (pgvector; **ein Chunk pro H2-Frageblock**), `deadline` (strukturiert je Edition, aus dem Fließtext gelöst). Gemeinsames Modul „Basis" (Location, Öffnungszeiten, App, Über ChefTreff) wird in alle drei Wikis eingehängt; **Retrieval strikt nach Zielgruppe** (Speaker-Bot sieht keine Partner-Logistik). Chatbot-Antworten nur aus `status = live` und `valid_until >= today`.

## 15 · Master-Programm FLS26 (Google Sheet, Drive-ID `1YZHR-GH-FcwMh7FcpsphxGJgGwMsxx5fLQiCkZQCVRc`) — Stand 08.09.2026

**Anforderung (Konrad):** Der Tab „Master-Programm" war 2026 der Programm-Master, mit dem die Übergabe in die Slot-Logik vorbereitet wurde. Das Speaker-Lead-Portal soll eine vergleichbare Ansicht bekommen, in der Slots per **Drag & Drop** verschoben werden (→ Masterplan Ergänzung v0.1c „Programm-Board").

- **Tabs (13, 4 ausgeblendet):** Master-Übersicht (Do–Sa Locations, Öffnungszeiten je Bühnenklasse, Side Events) · **Master-Programm** (Raster Fr/Sa × 6 Bühnen, 33 × 18) · Speaker Zusagen (66 × 9: Stage, Stage Lead, Tag, Status) · ZEIT:Future Forum „ZEIT" (Partner-Raster 45 Min, Moderation, To-Dos) und „Intern" (Pipeline) · Partnerslots Sold (31 verkaufte Slots mit Übergabestatus) · Masterclasses (32; Prozessliste + Raumraster 15 Min, 5 Räume × 2 Tage) · Speaker Reception (Einladungsliste) · Programm 2025 (mit Farblegende, Raum/Etage/Moderation) · hidden: Master-Plan, Moderation (Master), Rahmenprogramm, Samstag (Stände 2025 mit Raumnamen/Kapazitäten).
- **Aufbau „Master-Programm":** Raster ohne Kopfzeile. Z. 2 Tagesblöcke (verbunden), Z. 4 Bühnen je Tag: Main Stage · Leadership & Growth Stage · Industry Stage ‖ Startup Stage · ZEIT:Future Forum · Impact & Tech Stage; Z. 5–7 Meta (Partner: Startup = Impossible Founders, ZEIT = ZEIT, Impact & Tech = 1KOMMA5°; Moderation/Stage Leads leer); Z. 8–33 Zeitraster **30 Min** 10:30–20:30 (danach unsauber bis 01:00). Zelle = mehrzeiliger Freitext, **Muster je Bühne verschieden** (Main „13:30 - 13:40 - 10 min Keynote ⏎ Speaker ⏎ Titel"; Industry „Zeit ⏎ Firma ⏎ Format ⏎ Speaker ⏎ Titel: ⏎ Beschreibung:" = reichstes Muster; Startup Einzeiler; ZEIT nur Platzhalter „Gebuchter Slot n/8"; Impact & Tech Sa 7 von 10 ohne Zeit).
- **Zentraler Befund:** Rasterzeile ≠ Slotzeit. Maßgeblich ist die Zeit im Zelltext; nur 42 von 97 Zellen stehen in der passenden Zeile. Das Raster ist faktisch eine **sortierte Liste je Bühne**. 0 Formeln, keine Datenvalidierung, keine bedingte Formatierung; verbundene Zellen nur für Einlass/Ende.
- **Farbe = Status, ohne Legende auf dem Tab:** `00FF00` final besetzt (62) · `D9EAD3` bestätigt, Titel in Klärung (32) · `B6D7A8` angefragt/inoffiziell (5) · `93C47D` Impact & Tech Fr (7, Bedeutung unklar) · `FFD966` Besetzung offen (2) · Orange Sonderfälle · `CCCCCC` nicht bespielt (56) · `FFCD40` Einlass/Ende (8) · `5454C5` ChefTreff-Fixblöcke Opening/Closing (5). 2025 zusätzlich „ist in Swapcard", „In Gespräch", „Open Slot (möglich – sonst streichen)".
- **Vokabular (Listen-Tabs):** Stage `01 Main Stage · 02 Industry Stage · 03 ZEIT:Future Forum · 04 Impact & Tech Stage · 05 Startup Stage · 06 Leadership & Growth Stage` (+ `00 Masterclass`, `99 Other`) · Tag Freitag / Samstag / Beide Tage möglich · Stage Lead je Bühne (Team) · Status Programm Eingetragen / Nicht Eingetragen · Status (Konrad) Offen / Übergeben / Konrad Lead · Kommerz Gebucht (Bezahlt) / In Absprache (Bezahlt) / Wunsch (Kostenlos) / Zugesagt (kostenlos) · Masterclasses: Status Offen / Eingeplant / Slot bestätigt, Raum I–V, Priorität 1–4, Sprache DE 22 / EN 10, Bewerbung FCFS/Ja. **Format nur im Freitext** (110 Inhalts-Slots): Keynote 45, Panel 17, Fireside Chat 7, Podcast 3, Interview 2, Impuls/Talk/Pitch Battle/Award je 1, Opening 2, Closing 3, ohne Angabe 24. **Sprache nur als Suffix** (DE 16, EN 5).
- **Statistik:** Fr 56 Slots (Main 14, L&G 9, Industry 11, Startup 11, ZEIT 1 + 10 Platzhalter, Impact 10) · Sa 54 (Main 14, L&G 12, Industry 9, Startup 9, ZEIT 0, Impact 10). Dauer min 10 / Median 30 / max 60 Min (25 Min × 20, 30 × 59, 45 × 4), **bühnenspezifisch** (L&G Sa 25 + 5 Wechsel, Industry 30 / Panels 45, ZEIT 40 + 5, Main Fr 10–35 unregelmäßig). Fenster: Fr Einlass 12:00, Main 13:00 Opening – 20:05 Closing, Side Stages 13:30 – 18:30/19:15; Sa Einlass 11:00, Main 12:00 – 19:30, Side 12:00/12:30 – 17:45/18:00. Keine Überlappungen je Bühne; mehrere Lücken (fehlende Zeiten). Platzhalter „Slot #3 TBD", „Blocker Space 2", „Titel Pending", „Offen ggf. …". Umbau/Pausen fehlen. Widerspruch: ZEIT-Platzhalter stehen am Freitag, die ZEIT-Pipeline führt 44 von 47 Speakern für Samstag.
- **Übergabe-Vorbereitung:** keine Slot-IDs (nur Zählmuster „Slot 1/27", „Gebuchter Slot n/8"), keine Lookups zwischen Tabs. Übergabe manuell über Statusspalten: „Status Programm" (= ins Raster übertragen), „Status (Konrad)" (= an Stage Lead übergeben), Freitext „Übergabe ins Hub offen". Strukturierte Quellen nur Masterclass-Liste (Titel, Speaker, Sprache, Beschreibung, Zulassungskriterien) und das Industry-Textmuster. Räume/Kapazitäten nur in 2025-Tabs (Börsensaal, Commerzsaal, Forum, Merkur 50, Alster 50, Hanse 24, Plenar 64, Albert 270).
- **Ableitungen:** Slot braucht mindestens id, event_day, stage, start/end in Minuten mit **5-Min-Snap**, `slot_type` (content / fixed_block / placeholder / partner_block / frame), Status-Enum (Farbe nur daraus), Format-Enum, Sprache, Titel/Beschreibung, Speaker n:m, Partner + Kommerz-Status, Owner (Stage Lead), Moderation, sort_order, source_ref. Constraints: Öffnungszeiten je Bühne × Tag, Fixblöcke unverschiebbar, keine Überlappung je Bühne, Wechselzeit und Standarddauer als Bühnenparameter, Partner-Kontingent je Bühne (ZEIT 8), Bearbeitungsrecht für Bühnenpartner. Backlog aus „Speaker Zusagen" / „Partnerslots Sold" zum Hineinziehen.
- **Referenzdaten:** geparste FLS26-Slots (139 Zeilen: Tag, Bühne, Start/Ende/Dauer, Format, Sprache, Status-Heuristik, Text) in `docs/referenz/fls26-master-programm-slots.csv` als Test-/Seed-Daten für den Programm-Editor; nicht als Produktivdaten.
