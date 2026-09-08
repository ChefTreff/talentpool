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
