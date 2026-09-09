# Entscheidungslog — TalentCRM / FLS27-Plattform

Format: Datum · Entscheidung · Begründung · Quelle. Änderungen nur ergänzen, nie löschen.

## 2026-09-07 — Plattform-Scope & Integrationen (Konrad, Chat)
- **Scope = Plattform**: ein Supabase-Projekt, eine Identität (`person`) + Rollen, eine Codebasis; Portale: Talent, Speaker, Speaker-Manager (scoped), Partner (+Messeshop, +Hackathon-Variante), Volunteers, Initiativen, Programm-DB, Gesamt-Admin. Ziel: Anfang–Mitte Oktober 2026.
- **Fünf Grundpfeiler bestätigt**: eine Identität · Rechtemodell überall · ein Projekt, sauber getrennte Domänen · dokumentierte Integrationsschicht · eine Codebasis/ein Deploy-Pfad.
- **Doku-Pflicht**: regelmäßige, vollständige Dokumentation; Reproduktion aus Doku muss jederzeit möglich sein. **Sicherheit = Backbone** (DSGVO, keine Angriffsflächen; Ausfall wäre existenzbedrohend).
- **Side-Formate**: Masterclasses/Company Tours sind Programm-Objekte; Bewerbung erfolgt **aus dem Programm im Portal mit einem Klick** (keine Neueingabe). Zielmodell `offering` + `application` (Kapazität, Frist, Warteliste, Ranking, Consent-Gate) bestätigt.
- **Vivenu — Variante A**: Personalisierung wandert ins Portal; Vivenu erhält nur Minimaldaten (Name, E-Mail). Badge-Druck-Datenquelle prüfen (voraussichtlich unsere DB). „Kauf aus dem Portal starten" **offen** — Kaufprozess so kurz wie möglich.
- **Swapcard**: Branded App vorhanden, **kein SSO** (stabile Lösung wie 2026); Daten per API/Webhooks. Swapcard bleibt 2027, Eigenbau 2028.
- **Luma**: nur unterjährige Community-Events; alle Summit-Formate ins Portal.
- **Messeshop — Prämisse korrigiert**: Handover beschreibt einen **fertigen Next.js-16-Neubau auf Airtable** („Messeshop 3.0", Phasen 0–6, 542 Tests; nur Ship offen), *kein* WooCommerce-Rebuild. Integrationsentscheidung offen (Fragenkatalog 16).
- **Dokumentation**: Drive-Ordner „AI Projekt - Talentpool & FLS27 Systeme" = Team-Doku + Inputs; Repo `docs/` = technische Wahrheit (versioniert); Kernedokumente werden gespiegelt.
- **Design**: Briefing v0.1 aus Rebranding-Figma + Partner-Portal-Design v1 + Schriftordner; Portale minimalistisch/clean/UX-first.

## 2026-09-07 (abends) — Antworten Fragenkatalog A + B (Konrad)
- **Termine:** Summit 27 = **Fr 16. + Sa 17.04.2027**; Hackathon 27 = **Do 15. + Fr 16.04.2027** (überlappt am Freitag → gemeinsame Ressourcen: Volunteers, Ticketing, Event-App). Academy/Bootcamp für den Plan irrelevant.
- **Go-live 14.10.2026**; **alle Prozesse starten 01.11.2026** (Partner-Onboarding, Speaker-Akquise, Bewerbungen, Volunteer-Recruiting, Initiativen, Ticketverkauf) → 14.10.–01.11. = Härtungs-/Design-/Security-Fenster. Bau-Reihenfolge bestätigt: Teilnehmer → Partner → Speaker → Speaker-Manager → Volunteering → Hackathon.
- **Team:** vorerst nur Konrad (Admin, Repo, Doku).
- **Tier-Modell:** `contact` heißt **`lead`**; **`talent` = ab Registrierung/Login** (nicht Ticketkauf). Alter (≤35) **kein hartes Kriterium**, nur Flag/View — langfristig neu festlegen.
- **Speaker-Manager-Scope:** Rechte werden nach Feldfestlegung geschärft; Tendenz: **nicht alles editierbar**. Einschränkung auf **Bühne + Tag, ideal pro Slot** → jedem Slot eine verantwortliche Person zuordnen, die ihn bearbeiten darf (`slot`-Scope im Rechtemodell).
- **Partner-Kontaktrollen:** werden neu evaluiert (offen).
- **Interne Rollen: differenziert.** Bereichsleads (z. B. Programm) mit Vollzugriff auf ihren Bereich, ohne Zugriff auf andere (z. B. Partner). Erste Schnittebene = **Portale/Bereiche** (Teilnehmer, Speaker/Programm, Partner, Hackathon, Volunteers, Initiativen).
- **Rollen pro Event-Edition:** ja. Klassifizierung **Team** (dauerhaft) vs. **Volunteers/Leads mit Zugang** (wie Kunden behandelt: Login/Rolle nur für ein Event).

## 2026-09-08 — Antworten Fragenkatalog C, D, E, 25 (Konrad)
### C · Programm & Bewerbungen
- **Bühnen wie 2026:** 6 Hauptbühnen + Partner-„Standbühnen" (nur Inhalte ins Programm). Partner mit Produkt **„Standbühne"** tragen ihre Slots **selbst im Portal** ein → Programm lebt in Supabase; `stage.owner_org_id` + produktbasierte Rolle mit Scope „eigene Bühne".
- **Hierarchie bestätigt:** `slot` = exakte Zeit/Bühne; `session` = Inhalt + Speaker (oft **mehrere Speaker je Session**, `session_speaker` n:m mit Rolle).
- **Zugangsart je Angebot** (Pflichtauswahl beim Eintragen): `open` · `registration` · `application`. Bewerbung für Masterclasses, Company Tours, teils Side-Events. **Speaker Reception**: nur Anmeldung, nur für Speaker mit bestimmtem Status (Statusfeld beim Eintragen) → `eligibility`-Regel; wird umbenannt.
- **Überschneidungen:** Bewerbungen auf zeitgleiche Angebote **erlaubt, aber geflaggt**; bei zwei Zusagen zeitgleicher Slots **Entscheidung erzwingen** (nur eine bestätigbar). **Zusage mit Bestätigungsfrist** (No-Show-Reduktion), **automatisches Nachrücken** von der Warteliste.
- **Zusatzfragen:** Katalog + eigene Fragen je Partner **nur mit unserer Freigabe, max. 2**. **Freigabe-Gate für Mails**; alle Mails werden vom System getriggert und von uns definiert — **Partner versenden nie selbst**.
- **Consent:** Einwilligung zur Datenweitergabe ist Teil der **AGB beim Ticketkauf** (wird 2026/27 überarbeitet); Teilnehmer stimmen ausdrücklich zu. **Partner sieht alle Bewerbungsdaten** seiner Bewerber. (Umsetzung: Consent-Record mit AGB-Version + Zeitstempel; Sicht nur auf eigene Bewerber, zeitlich begrenzt, Zugriffe geloggt.)
- **Ticketpflicht ja; Kapazität setzen wir** (Raumgröße). „Other" aus Company Tours nicht mehr zuordenbar → Migration als „unentschieden".
### D · Partner, Messeshop, Initiativen
- **Messeshop: in die Plattform, sauber neu gebaut** (Patricks V1 auf Airtable war Test; live lief WooCommerce). Code von Patrick als Referenz (GitHub anfragen). „Alles aus einer Hand."
- Fristen/Rollenwerte beim Shop-Bau definieren. **Rechnung immer SevDesk.** Keine Alt-Bestellungen migrieren — Neustart, Historie ab jetzt.
- **HubSpot triggert Onboarding:** Deal → Pipeline-Phase „Onboarding" → Datenübertragung (Org, Kontakte, Produkte/Leistungen). **Deliverable-Checkliste leistungsbezogen/dynamisch** je gekauftem Produkt (Vorlagen je Produkt). **Reminder automatisiert per Resend** zu Fristen.
- **Tickets: ein Code je Partner** bestätigt; Portal verteilt Code (+ ggf. Shop-Embed). Je Partner automatisiert ein **Secret Shop (Vivenu-Undershop)** mit gebuchten Tickets; Code schaltet final frei. Pass-Typen im Onboarding wählen: Standard **Partner Pass** (Team) + **Talent Pass** (junge Teammitglieder als Besucher); Startup-Partner: **Startup Pass + Investor Pass**.
- **Ein Portal, Rollen/Sichtbarkeit produktbasiert** (gilt auch für Hackathon-Partner).
- **Initiativen:** stark reduziert (Logo, Code, Standinfos) — Empfehlung Claude: **Partner-Portal mit Org-Typ „Initiative" + Produkt „Initiativen-Partnerschaft"** (nutzt Onboarding, Checkliste, Reminder, Code-Verteilung mit).
### E · Speaker
- **Speaker-Datensatz:** alles vom Vorjahr rein + Empfehlungsliste fehlender Felder (Claude); on-the-go evaluieren.
- **Keine öffentliche Speaker-Bewerbung.** Pipeline **Akquise → Onboarding**; Akquise läuft über das **Speaker-Lead-Portal** (Leads verantwortlich).
- **Hospitality im Portal:** Shuttle + Hotel buchbar, freigeschaltet über ein **von uns gesetztes Statusfeld**. **Reisekosten:** Speaker lädt Beleg hoch + Bankdaten-Formular → Portal erzeugt **Auslagenrechnung** → Speaker gibt frei → Beleg nach **SevDesk** + Mail an **Qonto-Rechnungseingang** → Konrad gibt Zahlung frei.
### F (Teil)
- **Hackathon-Teilnehmer-App in den Scope** (mit Testpuffer); **Discord bleibt**.

## 2026-09-08 — Antworten Fragenkatalog 26, G, H, I, J (Konrad)
### Volunteers (26)
- Schichten = Position mit **Start, Ende, Soll-Kapazität**. Bewerbung mit **Präferenzen**, **Zuteilung durch uns** (Zeiten stehen bei Bewerbung noch nicht). **QR-Check-in** vor Ort mit eigener **Check-in-Rolle** (Gerät hat ausschließlich Scan-Recht, sonst nichts). T-Shirt-Größe bleibt (jeder bekommt ein Shirt). **Unterkunft als Add-on im Vivenu-Shop** beim Ticket-Einlösen, zusätzlich **Bahnticket** (einzeln + Bundle). **Buddy-System** wichtig.
### G · Talent-Portal & Felder
- Pflichtfelder Talent-Schwelle wie vorgeschlagen (Name, E-Mail, Status, Erfahrung, Level, Consent) — wird später überarbeitet.
- **Status × Level × Erfahrung bleiben.** Studium in **drei Ebenen**: Hintergrund (z. B. Wirtschaft) → Studienrichtung (z. B. BWL) → **Studiengangsbezeichnung als Freitext** (z. B. „International Business & Innovation") → `study_field`, `study_program`, neu `study_program_label` (Text).
- **Founder-Felder konditional.** **Land/Nationalität nach ISO**, **Stadt neu (wichtig für Auswertung)**. Sensible Felder: Klärung durch Claude (Art.-9-Kategorien) → Empfehlung weglassen.
- **Community/FLC nur Talents; WhatsApp vorerst nicht.**
- 29/31/32: Rückfragen von Konrad → Claude formuliert Klartext + Default (siehe Fragenkatalog).
### H · Integrationen
- **make.com-Szenarien (Swapcard, Vivenu) = Referenz für Feldmappings** des Vorjahres (Notion-Briefings ggf. leicht abweichend, Live-Änderungen).
- **Vivenu:** Keys werden bereitgestellt (→ `.env.local`, nie Chat/Drive). Personalisierungsfelder = Airtable-Felder (daraus abgeleitet). Support-Text von Claude. **Badge-Druck-System: Oktober.** **Kauf aus Portal: nein** (verlängert den Kaufprozess).
- **Swapcard:** API-Key vorhanden (→ `.env.local`). **Alle Objekte syncen** (Teilnehmer, Speaker, Sessions, Exhibitors, Sponsor-Tier). **Tracks als Custom Field** mitdenken.
- **HubSpot → Supabase** einseitig; wenn möglich **Rücksync der Unternehmens-Stammdaten**. Trigger = Deal in **FLS27-Pipeline** → Phase **„Onboarding Automation"**.
- **ActiveCampaign:** Segmente final ausarbeiten, dann pushen; **Opt-in-Rückfluss** gewünscht; Export später. **Kampagne: alle AC-Kontakte anschreiben → Registrierung im Portal (Lead → Talent).**
- **Regel: make.com nur Transport, Logik in Supabase** — bestätigt.
- **Regie + Booth wandern in die Plattform.** Regie = erweiterte Programm-Ansicht für Technik/Regie; Booth = Übersicht der Messestände. **Neues Portal: Event-Produktion** — alle Stände + zugebuchte Leistungen, Vor-Ort-Checklisten („hat jeder Kunde alle Leistungen erhalten?").
- **Luma:** wenn genutzt, direkt ans CRM angeschlossen (Webhook).
- **Regel: SevDesk für ALLE Rechnungen.** Auslösen macht Konrad; **Entwurfserstellung automatisiert**; **immer direkt nach dem Summit** (Rechnungsdatum nach Leistungsdatum, vollständige Abrechnung).
### I · Sicherheit, Datenschutz, Betrieb
- **Datenschutz-Ansprechpartner = Konrad.** AVVs werden geschlossen. Aufbewahrung/Löschung gemeinsam erarbeiten. **Pflicht: „Profil löschen"-Button** + Sperrvermerk (E-Mail wird nie wieder angefasst → Suppression-Liste, gehasht).
- **Consent wird komplett neu aufgearbeitet** durch Konrads separaten Consent-Agent → **Abschluss-Checkliste**: Agent mit allen Tools/Verbindungen briefen; Anwaltsprüfung.
- **Mail:** Team-Postfächer Gmail; **automatisierte Mails via Resend**, Domain `@chef-treff.de`. **Staff-2FA Pflicht, bevorzugt Google-SSO.**
- **Ein Portal mit Bereichen** (Rollen-Umschalter) bevorzugt → Empfehlung Claude bestätigt sich.
- **Supabase Pro** vorhanden; **PITR anschaffen** (Checkliste). **Vercel Pro** sicherstellen. **Alarm-Empfänger `alarm@chef-treff.de`** (Alias, eigener Postfach-Abschnitt) — Checkliste.
- **Doku:** Repo + Drive; vorerst nur Konrad liest/schreibt.
### J · Design
- **Figma-Board = Single Point of Truth.** Themes FLC/Education/Media noch zu exportieren; JSON-Export-Anleitung von Claude.
- **Schrift-Lizenzen vorhanden** (werden im Ordner abgelegt). Laica nur Italic. Frage „Textschnitt" durch Claude erklärt.
- **Sub-Brand-Farben nur für Events. Kein Dark Mode** (Übersichtlichkeit).
- **Token-basiertes Komponenten-System ok; Designer steigt am Ende ein** (wenn alle Funktionen stehen).
### Bestätigungen
- **21 Initiativen = Partner-Portal, Org-Typ „Initiative"** ✅ · **22 Speaker-Felder: alle Empfehlungen aufnehmen** (ggf. später löschen) ✅

## 2026-09-08 (nachmittags) — Antworten 29–32, 45, 49, Übergaben, Sicherheit (Konrad)
- **Felder:** alle vorgeschlagenen Matching-/Profilfelder **aufnehmen** (später streichen). **Sensible Felder (Art. 9 / Gehalt etc.) komplett weglassen.** Founder-Felder konditional, ISO-Länder, Stadt.
- **Onboarding-UX = Default:** 3-Schritt-Wizard (Basis → Studium & Beruf → Interessen & Matching) + Fortschritt + Progressive Profiling.
- **Segmentierung kommt vom Marketing:** nach Portal-Bau erhält Marketing eine **Übersicht der Segmentierungsmöglichkeiten** (alle Felder/Kombinationen) → liefert Segmente zurück → wir bauen Views + AC-Tags. (→ Deliverable + Checkliste)
- **Ein Portal** bestätigt. Domain: aktuelles Team-Portal läuft auf `porta(l).chef-treff.de`; Entscheidung Umzug auf `team.` vs. neue Domain (`login.`/`app.`) offen — Empfehlung Claude: Plattform = `portal.chef-treff.de`, Team-Portal → `team.chef-treff.de` (Umzug im Härtungsfenster).
- **Schriften:** Lizenz deckt **Web-Einbettung** ab. Vorhandene Schnitte: Sharp Sans Display No.1 SemiBold/ExtraBold (+ Italic), ABC Laica Regular Italic. **SemiBold = Textschnitt** (Konrad). Claude konvertiert OTF → WOFF2 im UI-Kit; Lesbarkeits-Check von SemiBold als Fließtext im ersten UI-Kit-Review (Alternative: Book/Medium nachlizenzieren).
- **Design-Themes:** nur **Events** (FLC/Education/Media nicht nötig) → Portal-Akzent Indigo `#6D6DEF` / Hover `#5B5BD9` / Soft `#E8E8FC`. **Kein Dark Mode.**
- **Keys:** Quelle der Wahrheit = **Vercel-Env** (Production/Preview/Development); lokal per `vercel env pull .env.local` (Konrad, einmalig nach `vercel login`). Nie im Chat/Drive/Repo.
- **Produktionsportal:** Nutzer = Event-Team + Regie; enthält den **Regieplan auf Basis des Programms** (Vorlage: Google Sheet „Regieplan 2026", Struktur ins Inventar §11) sowie Stand-/Leistungs-Checklisten.
- **Speaker Reception:** neuer Name folgt (Checkliste); technisch ein **Haken „Reception-berechtigt"** beim Eintragen des Speakers (Staff-gesetzt) → steuert Anmeldeberechtigung.
- **Sicherheit make.com (Entscheidung Konrad):** Vivenu-Key rotieren ✅ Liste · Swapcard-Credential ersetzen ✅ Liste · **verwaiste Webhooks jetzt deaktivieren** (Claude, nur `enabled=false`, keine Löschung, Liste dokumentiert) · Sample-Daten bereinigen ✅ Liste.
- **Secret Shop je Partner = neue Funktion 2027** (bestätigt): ein Undershop mit den gebuchten Pass-Typen statt mehrerer Codes; Machbarkeit per API → Vivenu-Support-Frage 5.
- Konrad fasst jetzt das **Live-Feedback** zusammen → fließt in den Masterplan.

## 2026-09-08 (abends) — Domain, Feedback FLS26 (Konrad)
- **Domain: Plattform → `portal.chef-treff.de`**; bestehendes Team-Portal zieht auf `team.chef-treff.de` um (Konrad). `partner.chef-treff.de` → Redirect später.
- **Regieplan-Ableitung bestätigt** („klingt gut").
- **Feedback FLS26** vollständig als Register erfasst: `docs/feedback-fls26.md` (48 Punkte, Prio-Vorschlag M/S/C — Bestätigung im Masterplan).
- Daraus neue **Grundsätze**: (1) **Portal bilingual DE/EN** von Tag 1; (2) **E-Mail-Minimierung** — bedarfsgesteuerte Reminder, Eingangsbestätigungen bei Uploads, Digest statt Einzelmails; (3) **ein QR/Barcode** (Vivenu) in allen Systemen; (4) **Portal sendet die finale Ticket-Bestätigung** nach Personalisierung; (5) **Vivenu-Personalisierung im eigenen System ist mit vivenu validiert** (Bestätigungsseite wird nachgebaut; Anleitung folgt).
- Neue Integration: **Website (Supabase + Vercel + Sanity)** ← Partner-Logos automatisch.
- Neue Rolle: **Assistenz** (Delegation auf Speaker-Datensatz). Neues Feld: **Titel (Dr.)**. Regel: **Masterclass-Speaker = Professional Pass** (Lounge-Zugang als Flag).
- Messeshop-Anpassungen: keine Startseite, keine Rollentrennung (Hinweise auf Produktebene), Merch-Kategorie, Lunch-Paket als Pflicht-Checklistenpunkt.
- HubSpot-Gate: Onboarding startet erst, wenn Basisinfos vollständig; sonst Deal zurücksetzen + Hinweis an Sales.

## 2026-09-08 — Vivenu-Call (Granola) ausgewertet
- **Variante A ist mit vivenu validiert:** Kauf im vivenu-Shop → Redirect mit Transaction-ID auf unsere Confirmation Page → Personalisierung im Portal (verpflichtend) → Rückschreiben von **Vorname, Nachname, Position, Unternehmen** (Badge-Druck) per Ticket-Endpunkt; Parallelbetrieb möglich. vivenu liefert Doku + Endpunktliste.
- **Badge-Druck:** vivenu-Standarddrucker, Badges vorgedruckt + beklebt → Datenquelle Portal (Frage 34.4 damit weitgehend geklärt; Oktober: Details).
- **Identität:** E-Mail + **vivenu-Customer-ID** mitführen. SSO/IdP frühestens 2027 (Auth0/OIDC).
- **Offen (Support-Fragen 10/11):** Ticket-Mail bei abweichender E-Mail; Einlass-Setup und Scan-Rückfluss.

## 2026-09-08 (abends) — Alte Portale & Wiki/Chatbot (Konrad)
- **Walkthrough der alten Portale** (Partner Hub, Speaker Hub, Messeshop) per Chrome, read-only, Konrad loggt selbst ein → Inventar §13. Informationsarchitektur des Partner Hubs wird übernommen, aber produktbasiert und mit DB-Deadlines.
- **Wikis + Chatbots kommen wieder — je einzeln für Speaker, Partner, Teilnehmer, jeweils eigenes Wiki.** Umsetzung als Wissensbasis im Portal (Inventar §14, Masterplan Ergänzung v0.1b); Zielgruppen-Trennung im Retrieval ist Pflicht.
- **Keine privaten Kontaktdaten** von Freelancern/Team in Portalen oder Wissensbasis → Rollen-Postfächer (Checkliste).

## 2026-09-08 (abends) — Master-Programm FLS26 ausgewertet (Konrad)
- **Anforderung Programm-Board:** Speaker-Lead-Portal bekommt eine Ansicht wie der Tab „Master-Programm" (Tag × Bühnen × Zeit) mit Slots per Drag & Drop. Umsetzung als gemeinsame Komponente: Welle 1 im Programm-Editor (Admin), Welle 2 im Speaker-Lead-Portal auf den Scope begrenzt (Masterplan v0.1c, Inventar §15).
- **Befund:** Das Sheet ist eine sortierte Liste je Bühne mit Statusfarben ohne Legende, ohne IDs und ohne Formeln. Im Portal gilt: Zeit, Status, Format und Sprache sind strukturierte Felder, Farbe kommt nur aus dem Status.

## 2026-09-08 (spät) — Antworten 56–77, Freigabe Masterplan (Konrad)
- **Masterplan v0.1c freigegeben** (Prio M/S/C bestätigt, Frage 56). Welle 0 startet am 08.09. Offen bleibt nur 73 (Zeitlogik); bis zur Antwort gilt die Empfehlung (5-Min-Raster, Bühnenparameter, Warnung statt Sperre).
- **Rollen:** Partner-Kontaktrollen = Primary Ops, CC, Event-App-Member, Signing, Accounting **+ Shop**. Assistenz ohne Consent/Bankdaten; Einladung per Mail durch Speaker oder durch Stage Leads im Onboarding. Bühnenpartner pflegen ihre Spalte selbst (Freigabe durch Programm).
- **Programm:** Status-Enum statt Farben. Keine ZEIT-Bühne 2027; **allgemeine Slot-Logik** mit Kontingent/Zähler je Bühne × Tag. Raum/Bühne Pflicht, Moderation optional, **getrennte Felder für Regie (intern) und App (öffentlich)**. Website-Programm über Swapcard-Embed, Sanity nur Logos.
- **Wissensbasis:** eigener Chatbot (kein Chatbase). Sprachen Partner DE+EN, Speaker EN, Teilnehmer DE+EN. Owner Pauli (Speaker), Konrad (Partner, Teilnehmer). Volunteer-Wiki aus bestehender Notion-DB.
- **Verschoben (C):** Strategy-Calls (optional), Slot-Grafik-Generator (neues Figma-Template folgt), Slid@Home nach Empfehlung.
- **Betrieb:** Tokens werden gesammelt über `docs/zugangs-liste.md` erfasst und von Konrad in Vercel gesetzt. Kontingente Hotel/DB/Locker über Laura bis 01.11.
- **Neu:** Item-Liste 2026 (Airtable Working List) ist das Produkt-Inventar → `product`-Stamm im Portal, Spiegel für HubSpot und SevDesk.
- **73 (Nachtrag):** Zeitlogik des Programm-Boards nach Empfehlung (5-Min-Raster, Bühnenparameter, Warnung statt Sperre; Überlappung je Bühne hart). Damit ist der Fragenkatalog vollständig beantwortet; Anpassungen laufen über dieses Log.

## 2026-09-08 (spät) — Welle 0 gestartet: Schema v2 Teil 1–3 live
- **Migrationen angewendet** (Supabase-MCP, Historie vollständig inkl. P0): `20260908141744_v2_identity_roles`, `20260908142441_v2_edition_programme`, `20260908142920_v2_security_hardening`. Repo-Dateien tragen dieselben Versionen.
- **Getestet (Transaktion mit Rollback):** Scope-Rechte (`has_role`, `can_edit_slot/stage`), Überlappungs-Constraint je Bühne (23P01), Warnungen des Boards (vor Öffnung, 5-Min-Raster, Wechselzeit), Pflichtfelder beim Veröffentlichen (23514), Bestätigungspflicht nach Veröffentlichung, History- und Audit-Einträge, Slot-Statistik, `programme_public`.
- **Sicherheits-Härtung:** Views aus P0 auf `security_invoker`, `search_path` in allen Funktionen gepinnt, `anon` darf keine SECURITY-DEFINER-Funktion mehr aufrufen, Default-Privilegien für neue Funktionen entzogen. Bewusst offen gelassen: „RLS enabled, no policy" auf service-role-only-Tabellen (organization, org_membership, staff_user, audit_log, suppression, import.*, Dedup) und „authenticated kann RPCs aufrufen" (die Autorisierung steckt in den RPCs).
- **Bugfix aus dem Test:** plpgsql-Array-Verkettung mit `||` in `move_slot` durch `array_append` ersetzt (Repo und live identisch).

## 2026-09-08 (spät) — Schema v2 Teil A abgeschlossen
- Live: `v2_application_ticket` (Bewerbungs-Pipeline mit Freigabe-Gate, Kollisions-Entscheidungszwang, Ticketpflicht bei Bestätigung; Session-Anmeldung mit Warteliste; Tickets, Kontingente, Check-in, Personalisierung), `v2_integration_comms` (Schema `integration`, `external_ref`, `mail_template`, `mail_log`), `v2_seed_vocab_fls27` (34 Vokabulare, Edition FLS27 mit Summit 27 / Hackathon 27, fünf Bühnen 2027, Fragenkatalog, Mail-Templates).
- **Modell-Entscheidungen dabei:** Bewerber sehen Entscheidungen nur über `my_applications()` (Statusspalte nicht lesbar) · Pass-Typen nutzen das bestehende Vokabular `ticket_type` · `registration` bekommt `session_id` statt einer eigenen Tabelle · Bühnenparameter 2027 vorläufig aus FLS26 (L&G 25 + 5 Wechsel, sonst 30 + 0), Öffnungszeiten je Bühne × Tag noch leer.
- Doku: `docs/datenmodell-v2.md` (Überblick, Status-Maschinen, Fehlercodes), `supabase/tests/README.md`.

## 2026-09-08 (abends) — Review PR #1 „Welle 0 · Teil B" (Architektur-Session)
- **Design (Entscheidungen zu den drei PR-Fragen):** (1) Primär-Buttons und alle Flächen mit weißem Text füllen mit **`#5B5BD9`**; `#6D6DEF` bleibt Akzent für Nicht-Text (Badges, Fokusring, Icons, Linien) und für Text ≥ 24 px. Regel: Kontrast ≥ 4,5:1 schlägt Token-Ästhetik. (2) Neues Token **`--ct-border-strong: #7F8A9C`** nur für Bedienelemente (Feldränder, Checkboxen); `#DCDFE5` bleibt für Trennlinien/Karten. (3) **Rollen-Namen: das Vokabular `role` ist kanonisch.** Neu aufgenommen: `hackathon_participant`, `hackathon_partner`. Bereichsleitungen heißen `area_lead_talent | speaker | partner | volunteers | hackathon | production`; `lib/areas.ts` mappt explizit statt Namen abzuleiten.
- **Architektur-Korrekturen aus dem Review (Blocker für den Merge):** offener Redirect über `next` (Login → Callback) schließen · Proxy = reiner Login-Gate ohne DB-Aufrufe, Cookies auf Redirects übernehmen · jede Admin-Seite/-Action prüft selbst `requireArea("admin")` vor dem service_role-Client (Layouts schützen verschachtelte Routen nicht zuverlässig, Next-Auth-Guide) · Suppression-Prüfung über RPC `is_suppressed()` und **fail-closed** · unterdrückte Mails ohne Klartext-Adresse loggen · Dry-Run ohne Resend-Key nicht als „sent" protokollieren · Admin-Aktionen schreiben `log_audit` · Root-Layout darf ohne Env nicht werfen.
- **Vereinfachungen (im PR):** `session_context()` als ein RPC statt drei · Mail-Vorlagen: **Datenbank ist kanonisch**, TS-Fallback nur `test`, `login_magic_link` entfällt (Supabase Auth verschickt) · `requireStaff` → `requireArea("admin")`, Team-Definition nur in SQL `is_staff()` · Fonts: Italics und Laica ohne Preload · `getI18n()` liest die Session-Sprache selbst.
- **Später (Follow-up-Issues):** Placeholder-Seiten zu einer dynamischen Route, tote CSS-Tokens verdrahten oder löschen, Barrel-Exports bereinigen, `Select` nutzt die `Input`-Klassen, `CardHeader` als Kartentitel, `gen-schema-doc` nur mit Service-Key.
- **Neu (Migration 0014):** service_role darf alle Funktionen aufrufen (Default-Privilegien), `session_context()`, Hackathon-Rollen; Mail-Template-Zeilenumbrüche korrigiert (Migration 0013, Seed 0011 mit `E''`).
- **Event-App:** Konrad möchte die Event-App-Option vor Welle 3 noch einmal prüfen; **Conferras** (conferras.com) als Idee neben Swapcard → Frage 86, Checkliste. Der Swapcard-Sync (Welle 3) bleibt bis zur Entscheidung geplant, die Schnittstelle wird als austauschbarer Adapter gebaut.
- **08.09. spät, Welle 1 A4 vorgezogen:** Programm-Editor-Backend live (`v2_programme_editor`: `programme_board`, `programme_backlog`, Session-RPCs mit Scope-Rechten, Veröffentlichen nur Programm-Team). Conferras-Erstsichtung im Fragenkatalog (86): stark im Networking, offen bei API/Lead-Scanning/Embed → Demo mit Kriterienliste, Entscheidung bis 24.09.

## 2026-09-08 (Nacht) — PR #1 gemergt: Welle 0 Teil B live auf main
- **Zweiter Review-Durchgang bestanden** (Commit 793b1d3, Merge b44c7e4): alle neun Blocker umgesetzt und nachgelesen (safeNextPath an Login-Seite, Formular und Callback; Proxy nur Login-Gate mit Cookie-Übernahme; `requireArea("admin", pfad)` in allen zehn Admin-Dateien; Suppression über `is_suppressed()` fail-closed; unterdrückte Adressen nur als Hash im Mail-Log; Dry-Run nur in development; `session_context()` als ein RPC; `NEXT_PUBLIC_SITE_URL` Pflicht außerhalb development).
- **Akzeptierte Abweichung:** Audit-Einträge aus Server Actions schreibt `lib/audit.ts` per direktem Insert (service_role) mit Urheber aus der Session, nicht über `log_audit()` — unter service_role wären `auth.uid()`/`current_person_id()` leer. `log_audit()` bleibt für SQL-interne Aufrufe (RPCs).
- **Kursivschnitte** als eigene Font-Familie ohne Preload (next/font kennt `preload` nur je Aufruf).
- **Welle 0 damit fachlich abgeschlossen.** Offen: Konrads 80-%-Feedback zu UI-Kit und Bereichs-Umschalter (läuft in mehreren Runden), Doku-Spiegelung um Runbooks und generierte Schema-Doku ergänzt.
- **Nächster Schritt Build-Session:** Welle 1 Teil B auf Branch `welle-1/talent-programm`, Start mit B5 (Programm-Board auf `programme_board`/`move_slot`), B2 (Programm-Ansicht) und B1 (Onboarding-Wizard); Backend dafür ist live. A1/A2 (vivenu) warten auf den Sandbox-Key.
- **08.09. Nacht — Vercel↔Supabase-Integration aktiviert (Konrad):** Supabase-Variablen kommen in Vercel jetzt aus der Integration. Die App liest URL/Key über `lib/supabase/env.ts` und akzeptiert klassische (`ANON_KEY`, `SERVICE_ROLE_KEY`) wie neue Namen (`PUBLISHABLE_KEY`, `SECRET_KEY`). `NEXT_PUBLIC_SITE_URL` in Production gesetzt.

## 2026-09-08 (Nacht) — Datenstandort: Einordnung und Maßnahmen (Nachfrage Konrad)
- **Rechtlich:** Dublin (eu-west-1) und Frankfurt (eu-central-1) sind beide EU; kein Drittlandtransfer, gleiche AWS-Sicherheitskontrollen. Zuständige Aufsicht bleibt die Hamburger (Sitz des Verantwortlichen), unabhängig vom Serverstandort.
- **Restrisiko liegt beim Anbieter, nicht bei der Region:** Supabase, Vercel, Resend und Anthropic sind US-Unternehmen (CLOUD Act, Support-Zugriffe). Gegenmaßnahmen: AVV mit SCC, Datenminimierung, Verschlüsselung sensibler Felder, kurze Aufbewahrung, Zugriff nur über Rollen. Der Regionswechsel ändert daran nichts.
- **Trotzdem Frankfurt:** konservative Wahl, vereinfacht Partner-Fragebögen („Server in Deutschland?") und kostet jetzt eine Stunde. Entscheidung: Umzug vor Welle 1 (Reproduktionstest inklusive).
- **Wichtiger Fund:** Vercel führt Server-Code standardmäßig in der US-Region (iad1) aus. Ab jetzt `vercel.json` mit `regions: ["fra1"]`, damit Rendering, Server Actions und Route Handler in Frankfurt laufen. Statische Auslieferung über das CDN bleibt global (keine Personendaten).
- **Offen (Checkliste):** Resend EU-Verarbeitung, AVV-Sammlung, Standort von Supabase-Logs/Backups.

## 2026-09-08 (Nacht) — Review PR #2 „Welle 1 Teil B" (erster Durchgang)
- **Board-Realtime:** Datenbank sendet (Trigger → `realtime.send`, privater Kanal `programme-board:<event_id>`); Programm-Leser dürfen empfangen und als Fallback senden (Policies auf `realtime.messages`, Migrationen `20260908194632`, `20260908194933`). Keine Postgres-Changes-Publikation für `slot` (interne Spalten). Befund: ohne verbundenen Realtime-Client fehlen die Partitionen von `realtime.messages`, `realtime.send` schlägt dann stumm fehl — daher der Client-Fallback.
- **Fragen je Session** nur noch per RPC (`set_session_questions`, `approve_session_questions`); service_role-Pfad im PR wird ersetzt.
- **Merge-Bedingungen PR #2:** privater Kanal je Event, Fragen-RPC, Tests für Zeitzone/Geometrie im Repo, Consent-Schritt ohne Duplikate. Rest (Speaker-Suche einschränken, Board unter `/speaker-leads`) → Welle 2.
- **Demo-Programm** für Summit 27 Freitag auf der Dev-Datenbank (Tag `demo`), Programmzeiten Summit 27 als Vorschlag gesetzt.

## 2026-09-09 — Supabase-Umzug nach Frankfurt (Reproduktionstest bestanden)
- Neues Projekt **`jqmqvgaiyjudkvtncijw`** („FLS27 System & CRM", eu-central-1) ersetzt `fsjexlrapilzftwibocu` (eu-west-1). Grund: konservative Wahl beim Datenstandort (Einordnung 08.09.), jetzt ohne Nutzerdaten billig.
- **Vorgehen:** Alle 17 Migrationen aus `supabase/migrations/` in fünf Paketen per Supabase-MCP `execute_sql` in Dateireihenfolge eingespielt (Kommentare entfernt, Inhalt identisch), danach `supabase_migrations.schema_migrations` mit den Repo-Versionen befüllt. Damit bleiben Dateinamen und Historie identisch; `supabase db push` erkennt den Stand.
- **Reproduktionstest:** Tabellen, Views, Funktionen, Policies, Trigger und Vokabular stimmen zwischen altem und neuem Projekt überein (Zahlen im Runbook `supabase-umzug.md`, Historie). Das bestätigt: Das System lässt sich vollständig aus dem Repo neu aufsetzen.
- Alle Verweise auf die alte Projekt-Ref in AGENTS.md, README, Runbooks und Zugangs-Liste ersetzt. Altes Projekt bleibt eine Woche pausiert als Rückfallebene, dann Löschung (Checkliste).
