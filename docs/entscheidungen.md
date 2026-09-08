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
