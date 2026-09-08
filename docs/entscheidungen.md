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
