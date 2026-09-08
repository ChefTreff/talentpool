# Fragenkatalog Masterplan — Stand 07.09.2026

⭐ = blockiert den Masterplan · alle anderen können während des Baus beantwortet werden.
Antwortformat: Nummer + Stichwort reicht („5: Login+Ticket, 35 hart").

## A · Zeitplan & Scope
1. ⭐ Termine: Summit 27 = 13.–17.04.2027 (12.500 TN) korrekt? Hackathon 27? Academy/Bootcamp 26/27?
2. ⭐ Go-live 7.10. oder 14.10.? Was muss zwingend dann live sein? Bau-Reihenfolge „Teilnehmer → Partner → Speaker → Leads → Volunteering → Hackathon" (Lastenheft) noch gültig?
3. ⭐ Prozessstarts: Partner-Onboarding, Speaker-Akquise, Masterclass-/Company-Tour-Bewerbung, Volunteer-Recruiting, Initiativen-Outreach, Ticketverkauf — wann öffnet was?
4. Team: wer arbeitet außer dir im Admin (Namen/Rollen)? Wer bekommt Repo-/Doku-Zugriff?

## B · Identität, Rollen & Rechte
5. ⭐ Tier-Modell: `contact` vs `talent`; Talent-Schwelle = Login + Ticketkauf (oder Datenschwelle)? ≤35-Regel hart (Ausschluss) oder nur Flag?
6. ⭐ Speaker-Manager-Scope: Bühne × Tag? Mehrere Bühnen? Welche Speaker-Felder dürfen sie editieren (heute alles inkl. E-Mail/Telefon/Hospitality)?
7. Partner-Kontaktrollen: die 5 (Primary Ops, CC, Event-App-Member, Signing, Accounting) behalten? Wer darf was (Uploads, Rechnungen, Shop, Kontakte)?
8. Interne Rollen: nur „Admin" oder differenziert (Partner-Team, Speaker-Team, Volunteer-Koordination, Programm, Finance)?
9. Rollen pro Event-Edition: Speaker-/Partner-Rolle endet nach Summit 27 (Neu-Einladung 28)? Staff dauerhaft?

## C · Programm & Bewerbungen (Side-Formate)
10. ⭐ Programm-Hierarchie Event → Tag → Bühne → Slot → Session (n Speaker mit Rolle)? Bühnen 27 wie 26 (6 Stages + Masterclass-Tracks + Builder Track)? Slot/Regie weiter in Airtable (Lastenheft) oder ins Portal (E1 „alles in Supabase")?
11. ⭐ Bewerbbare Formate: Masterclass, Company Tour — dazu Side Events, Meet the Fund, Startup Pitch, Speaker Reception? Offene Formate (Keynote/Panel) nur anzeigen?
12. Bewerbungsregeln: max. aktive Bewerbungen je Person? Präferenz-Ranking? Frist je Angebot oder global? Warteliste automatisch nachrücken oder manuell bestätigen? Kollision zweier Zusagen: blocken/warnen/auto-Warteliste?
13. Zusatzfragen je Angebot (Sprachlevel, Gründerfragen, Sonder-CV): Gastgeber definiert selbst oder ihr aus Katalog? Internes Freigabe-Gate vor Zu-/Absage-Mails ja/nein?
14. ⭐ Partner-Sicht auf Bewerber: welche Felder (Name, Studium, Status, Erfahrung, LinkedIn — E-Mail? CV?), Export erlaubt? Einwilligungstext vom letzten Jahr noch vorhanden?
15. Ticketpflicht für Bewerbung/Teilnahme? Kapazität setzt Gastgeber oder ihr? Bedeutung von „Other" (44 %) in Company Tours?

## D · Partner-Portal, Messeshop, Initiativen
16. ⭐ Messeshop-Prämisse: Handover = fertiger Next.js-16-Neubau auf **Airtable** („Messeshop 3.0", Phasen 0–6 fertig, nur Ship offen), kein WooCommerce-Rebuild. Wer hat ihn gebaut, liegt der Code in GitHub, und: in die Plattform portieren (Supabase, ein Login) oder erst standalone shippen?
17. Messeshop-Details: echte Fristen Phase 1/2 (13.03./27.03.?), Rollenwerte + Kategorie-Mapping, Rechnung aus completed-Bestellungen (SevDesk? wer?), Volumen, Alt-Bestellungen migrieren?
18. Pakete/Leistungen: HubSpot bleibt Quelle für „gebucht" (Deals → Portal-Sichtbarkeit)? Sync-Richtung/Trigger? Deliverable-Checkliste je Paket mit Fristen vom letzten Jahr vorhanden? Reminder-Engine gewünscht?
19. Tickets/Kontingente: ein Code je Partner (Undershop-Unlock) bestätigt? Verteilt der Partner Pässe im Portal an Mitarbeitende (→ Personen) oder nur via Code? Talent-Tickets?
20. Hackathon-Partner: gleiches Portal, Sichtbarkeit per Rolle/Produkt „Hackathon" (Challenge, Preise, Mentoren, Speed-Dating)? Ein Login für Firmen, die beides sind?
21. Initiativen: Lastenheft „eigene Domäne, nicht Partner-Portal" vs. Inventar „Partner-light". Eigenes Mini-Portal oder Partner-Portal mit Typ „Initiative"?

## E · Speaker-Portal
22. Speaker-Datensatz: Profil, Talk, Logistik (Hotel/Shuttle/Reisekosten), Technik/Slides, Consent (Foto/Recording/Veröffentlichung — fehlte!), Ticket + Begleitticket — was raus, was neu?
23. Pipeline-Status behalten (Lead → Kontakt → bestätigt → onboarded → ready → published → attended)? Wer bewegt sie? Öffentliche Speaker-Bewerbung weiter anbieten?
24. Hospitality: Hotel/Shuttle-Buchung im Portal mit Kontingenten weiter? Reisekosten-Upload → SevDesk/Asana?

## F · Hackathon & Volunteers
25. ⭐ Hackathon-Teilnehmer-App bis Oktober (Bewerbung, Teams, Challenges, Einreichung, Judging, Zeitplan) oder jetzt nur Partner-Teil? Discord bleibt?
26. Volunteers: Schichtmodell = Positionen mit Start/Ende/Soll-Kapazität; Selbstbuchung oder Zuteilung? Check-in vor Ort? T-Shirt/Unterkunft/Buddy/Briefing behalten?

## G · Talent-Portal & Felder (= Arbeitsdokument Teil 1–3, dort unbeantwortet)
27. ⭐ Pflichtfelder Talent-Schwelle: Name, E-Mail, Status, Berufserfahrung, Karrierelevel, Consent — ok?
28. Status × Level × Erfahrung behalten (Doku: bewusst „dreidimensional")? Studiengang: 53 kuratierte Werte oder Feld + Freitext?
29. Neue Felder — je ja/nein: Funktionsbereich (Pflicht?), Skills (Liste trimmen), Job-Matching (Opportunity, Verfügbarkeit, Standort, Work-Mode, Sprachen), Foto, Kurz-Bio, Goals-for-Summit, Referral-Code, Karrieremöglichkeiten (Lücke).
30. Sensible Felder (Gehalt, DEI, Barrierefreiheit) weglassen bis Partner-Bedarf? Founder-Felder nur bei Founder? Land/Nationalität ISO-Dropdown, Stadt ergänzen?
31. Onboarding-UX: Wizard in Schritten + Fortschritt vs. eine Seite? Progressive Profiling — welche Felder erst später?
32. Segmentierung: die ersten 3 konkreten Zielsegmente (Kickoff-Beispiel „Academy HH: First Leader + Hamburg + kein Alumni")?
33. Community/FLC: nur Talents oder auch Kontakte? WhatsApp-Community (DSGVO/Meta) im Scope?

## H · Integrationen
34. ⭐ Vivenu: Sandbox-Keys vorhanden? Heutige Personalisierungsfelder im Event? Support-Anfrage (E-Mail im Personalize-Body, Server-Key ohne Secret, Webhook-Retry) — Text von mir? Badge-Druck: welches System? „Kauf aus Portal" als Option B im Plan ok?
35. Swapcard: API-Key fürs 27er-Event? Sync-Objekte Teilnehmer/Speaker/Sessions/Exhibitors + Sponsor-Tier — alle? Tracks als Custom Field?
36. HubSpot: Quelle für Partner-Orgs/Deals → Sync nach Supabase (Richtung/Trigger)? Rücksync (Onboarding-Status)?
37. ActiveCampaign: nur lesend (21.07.) → wir pushen Segmente/Tags; Opt-in/Abmeldung zurück? AC-Export für Migration wann?
38. make.com vs. direkt: Lastenheft „Make/n8n", CLAUDE.md „direkt per API" — Regel „make nur Webhook-Transport, Logik in Supabase" ok?
39. Airtable-Rest: Regie/Booth/Produktion bleiben (One-Field-One-DB) oder alles wandert? (mit 10)
40. Luma: Rückfluss der Community-Teilnahmen ins CRM (Webhook) gewünscht?
41. Rechnung: SevDesk per API — auch Messeshop + Partner-Rechnungen? Wer löst aus?

## I · Sicherheit, Datenschutz, Betrieb, Doku
42. ⭐ Datenschutz: Ansprechpartner/externer DSB? AVV mit Supabase/Vercel? Aufbewahrungsfristen (Bewerbungen, CVs, Speaker)? Löschkonzept?
43. Consent-Set vollständig: Datenverarbeitung · Newsletter · Weitergabe an Partner · Foto/Recording · Swapcard-Übertragung · WhatsApp?
44. Staff-Login 2FA Pflicht? Transaktions-Mails (Auth, Zu-/Absagen, Reminder): Anbieter (Resend/Postmark/SMTP)? Absender-Domain?
45. Domains: portal.chef-treff.de (ein Portal, Rollen) vs. Subdomains je Portal? partner.chef-treff.de (WooCommerce) ablösen/weiterleiten?
46. Betrieb: Supabase Pro + PITR? Vercel Pro? Lastspitzen (Event-Tage)? Wer bekommt Alarme?
47. Doku: Repo `docs/` (technisch) + Drive-Ordner (Team) — Struktur ok? Wer liest/schreibt (Team, Freelancer, Security-Experte)?

## J · Design
48. ⭐ Figma-Export „GENERAL"-Frames (A1 Farben, Typografie, A6 Layout, Buttons, Gradients) als PDF (+ Variablen-JSON) in den Design-Ordner. Ist das Rebranding-Board die Single Source of Truth?
49. Schrift-Lizenzen: Sharp Sans Display nur OTF — Web-Lizenz/WOFF? ABC Laica nur Regular Italic lizenziert? Textschnitt für Fließtext vorhanden oder Systemschrift?
50. Sub-Brand-Farbwelten (FLC/Events/Education/Media) im Portal nutzen oder neutral (Navy/Indigo/Off-White)? Dark Mode?
51. Design-Loop: wann steigt der Designer ein? Komponenten-System, das er über Tokens themed — ok?

---
## Antworten — Stand 07.09.2026 abends
**A** · 1 ✅ Summit 16.–17.04.27 (Fr/Sa), Hackathon 15.–16.04.27; Academy/Bootcamp egal · 2 ✅ Go-live 14.10., Reihenfolge bestätigt · 3 ✅ alle Prozessstarts 01.11. · 4 ✅ nur Konrad
**B** · 5 ✅ `lead`/`talent`, Schwelle = Login; Alter nicht hart · 6 ✅ Scope Bühne+Tag, ideal pro Slot (verantwortliche Person je Slot); Feld-Editierbarkeit nach Feldfestlegung · 7 ⏳ Kontaktrollen neu evaluieren · 8 ✅ differenziert, Bereichsleads je Portal/Bereich · 9 ✅ Rollen pro Edition; Team dauerhaft, Volunteers/Leads eventgebunden
**C–J** · offen (folgen 08.09. morgens)
## Antworten — Stand 08.09.2026 morgens
**C** · 10 ✅ Bühnen wie 2026 + Standbühnen (Partner tragen Slots selbst ein; Programm in Supabase); Slot=Zeit, Session=Inhalt+n Speaker · 11 ✅ Zugangsart je Angebot (open/registration/application); Reception nur Anmeldung + Speaker-Status, wird umbenannt · 12 ✅ Überschneidung erlaubt+geflaggt, Entscheidung erzwingen, Bestätigungsfrist, Auto-Nachrücken · 13 ✅ Katalog + max. 2 eigene Fragen mit Freigabe; Mail-Freigabe-Gate; Partner senden nie · 14 ✅ Consent via AGB (Überarbeitung), Partner sieht alle Bewerbungsdaten · 15 ✅ Ticketpflicht, Kapazität durch uns; „Other" unbekannt
**D** · 16 ✅ in Plattform, sauber neu; Patrick-Code als Referenz · 17 ✅ Fristen/Rollen beim Shop-Bau; SevDesk; keine Alt-Historie · 18 ✅ HubSpot Deal→Onboarding triggert; Checkliste produktbasiert; Reminder via Resend · 19 ✅ ein Code je Partner, Secret Shop je Partner, Pass-Typen im Onboarding · 20 ✅ ein Portal, produktbasiert · 21 ✅ Empfehlung Claude: Partner-Portal mit Typ „Initiative"
**E** · 22 ✅ alles rein + Empfehlungsliste · 23 ✅ keine öffentliche Bewerbung; Pipeline Akquise→Onboarding via Lead-Portal · 24 ✅ Hotel/Shuttle statusgesteuert; Reisekosten → Auslagenrechnung → SevDesk + Qonto-Inbox
**F** · 25 ✅ Teilnehmer-App in Scope, Discord bleibt · 26 ⏳
**Noch offen:** 7 · 26 · 27–33 (G) · 34–40 (H; 41 ✅ SevDesk) · 42–47 (I; 44 teilw. ✅ Resend) · 48–51 (J)
## Antworten — Stand 08.09.2026 mittags
**F** · 26 ✅ Start/Ende/Soll; Präferenzen → Zuteilung durch uns; QR-Check-in mit reiner Check-in-Rolle; Shirt; Unterkunft + Bahn als Shop-Add-on/Bundle; Buddy
**G** · 27 ✅ · 28 ✅ behalten; Studium 3 Ebenen (Feld → Richtung → Freitext-Bezeichnung) · 29 ❓ Klartext nötig · 30 ✅ Founder konditional, ISO, Stadt rein; sensible Felder: Klärung · 31 ❓ · 32 ❓ · 33 ✅ nur Talents, kein WhatsApp
**H** · 34 ✅ Keys kommen (env), Felder = Airtable, Support-Text Claude, Badge Oktober, kein Kauf aus Portal · 35 ✅ Key vorhanden (env), alle Objekte, Tracks Custom Field · 36 ✅ HubSpot→Supabase (+ Rücksync Stammdaten), Trigger FLS27-Pipeline „Onboarding Automation" · 37 ✅ Segmente final → push, Opt-in zurück, Reaktivierungs-Kampagne · 38 ✅ · 39 ✅ Regie+Booth rüber, **neu: Produktionsportal** · 40 ✅ Luma via Webhook · 41 ✅ SevDesk immer, Entwürfe automatisch nach Summit
**I** · 42 ✅ Konrad DSB-Kontakt, AVVs, Löschkonzept gemeinsam, „Profil löschen" + Sperrvermerk · 43 ✅ Consent-Agent → Abschluss-Checkliste · 44 ✅ Gmail + Resend, @chef-treff.de, Staff-2FA via Google-SSO · 45 ✅ ein Portal mit Bereichen (Empfehlung bestätigt) · 46 ✅ Supabase Pro, PITR/Vercel Pro/alarm@ → Checkliste · 47 ✅
**J** · 48 ✅ exportiert, SSOT; FLC/Education/Media fehlen; JSON-Anleitung · 49 ✅ Lizenzen kommen; Laica nur Italic; „Textschnitt" erklären · 50 ✅ Sub-Brand nur Events, kein Dark Mode · 51 ✅ Token-basiert, Designer am Ende
**Bestätigt:** 21 ✅ · 22 ✅
**Noch offen:** 7 · 29 · 30 (sensibel) · 31 · 32 · 34.4 (Oktober) · 42 (Löschkonzept-Workshop) · 48 (3 Theme-Frames) · 49 (Medium/Regular?) · neu: Produktionsportal-Details · Credentials-Übergabe (env) · Feedback Live-Betrieb · Patrick-Code

## Neue Fragen aus dem make.com-Inventar (08.09.)
52. ⭐ **Sicherheit:** Vivenu-Key rotieren + Swapcard-Credential ersetzen — okay, und wer ist Key-Owner (Zweitsysteme)? Verwaiste Webhooks abschalten — sendet noch etwas (Softr, Airtable-Automationen, lu.ma) darauf?
53. **Swapcard-Gruppen:** bisher alle 9 Ticket-Typen in *einer* Gruppe — für FLS27 getrennte Gruppen je Pass-Typ (Rechte/Sichtbarkeit in der App)?
54. **FLS26-Stack:** archivieren oder als Vorlage sichern? (Neubau kommt ohnehin aus Supabase.)
55. **Sample-Daten** mit Personenbezug in Blueprints bereinigen — ja?
## Antworten — Stand 08.09.2026 nachmittags
29 ✅ alle rein · 30 ✅ sensible Felder weglassen · 31 ✅ Default (Wizard + Progressive Profiling) · 32 ✅ Marketing liefert Segmente nach Portal-Bau (Übersicht senden) · 45 ✅ ein Portal; **Domain offen** (Empfehlung: `portal.` für Plattform, Team-Portal → `team.`) · 48 ✅ nur Events-Theme nötig · 49 ✅ Web-Lizenz ja, SemiBold = Textschnitt, Claude konvertiert WOFF2 · 52 ✅ Rotation auf Liste; Webhooks werden deaktiviert · 55 ✅ Bereinigung auf Liste · Secret Shop bestätigt
**Noch offen:** 7 · 45 (Domain-Wahl) · 53 (Swapcard-Gruppen je Pass-Typ?) · 54 (FLS26-Stack archivieren?) · Reception-Name · Produktionsportal-Checkliste (Leistungen) · Live-Feedback · Patrick-Code
## Antworten — Stand 08.09.2026 abends
45 ✅ `portal.chef-treff.de`; Team-Portal → `team.` (Konrad) · Regieplan-Ableitung ✅ · **Feedback FLS26 eingegangen** → `docs/feedback-fls26.md`
## Neue Fragen aus dem Feedback (08.09.)
56. **Prio-Vorschlag M/S/C** im Feedback-Register — bestätigen oder verschieben? (Besonders: P7 Mail-Versand aus Dashboard = M?; C-Features Slid@Home, Generatoren, Timetable-Bild erst nach Go-live?)
57. **Sanity** (Website): Zugang (Projekt/Dataset/Token) und Ziel-Dokumenttyp für Partner-Logos?
58. **Assistenz-Rolle**: darf sie alles außer Consent/Bankdaten? Einladung durch Speaker selbst?
59. **Strategy-Calls**: welche Partner-Tiers („ab Premium") — Produktnamen aus HubSpot?
60. **Mail-Versand aus Dashboard**: wer darf senden (Bereichsleads?), Templates DE/EN, Antwortadresse?
61. **Slot-Grafik**: existiert ein Figma-Template? Wer ist die Freelancerin (Zugang zur Review-Queue)?
62. **Slid@Home**: nur für Ticketinhaber des jeweiligen Summits? Zeitraum der Verfügbarkeit?
63. **Hotelkontingente/DB-Ticket/Locker**: wer beschafft die Kontingente (extern) und bis wann? (Checkliste)
