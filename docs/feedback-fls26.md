# Feedback-Register FLS26 → Anforderungen FLS27-Plattform (Stand 08.09.2026)

Quelle: Konrads Feedback-Sammlung aus dem Live-Betrieb 2026. Jede Zeile: Feedback → Konsequenz → **Prio-Vorschlag** (M = muss bis 14.10./01.11. · S = Härtungsfenster bis 01.11. bzw. Q4 · C = vor Summit, nach Go-live). Prio wird im Masterplan von Konrad bestätigt.

## Ticketshop (Vivenu) & Personalisierung
| # | Feedback | Konsequenz für Plattform | Prio |
|---|---|---|---|
| T1 | Deposit für Free Tickets (20 €, Rückbuchung bei Check-in) | Vivenu-Frage (Support-Anfrage Q9); Check-in-Scan → Rückbuchungs-Trigger | S |
| T2 | Hoteloptionen als Add-on | Hotelkontingente buchen (extern) → Vivenu-Add-ons; Add-on ↔ Ticket ↔ Person im CRM | S |
| T3 | DB-Veranstaltungsticket (59 €) einzeln + Bundle | Vivenu-Produkt/Bundle; Antrag bei DB (Checkliste) | S |
| T4 | Locker als Add-on | Vivenu-Add-on; Zuteilung im Produktionsportal | S |
| T5 | Bundle-Pakete | Vivenu-Produktstruktur | S |
| T6 | OMR-Ticketprozess als Referenz | Slack-Thread ausgewertet (Agent) → Erkenntnisse ins Ticket-Konzept | M (Analyse) |
| T7 | **Personalisierung ins eigene System — mit Vivenu validiert**; Bestätigungsseite wird bei uns nachgebaut; Anleitung folgt | Bestätigt Variante A; Detail-Flow nach Granola-Notiz/Anleitung | **M** |
| T8 | Badge-relevante Daten direkt beim Kauf abfragen, Personalisierung danach | Kauf: nur Badge-Minimum (Name, Unternehmen, ggf. Titel) — bleibt kurz; Rest im Portal | M |
| T9 | **E-Mails aus dem System deutlich reduzieren** | Design-Prinzip: ein Mail-Plan je Journey, Reminder nur bedarfsgesteuert, Digest statt Einzelmails | **M** |
| T10 | **Ticket-Code überall identisch** (Vivenu, Event-App, unser System) | `barcode` aus Vivenu = einziger QR; Swapcard `updateBarcodes` mit demselben Wert; Portal zeigt denselben Code | **M** |
| T11 | Personalisierung mit anderer Mail als Kauf → keine Ticketmail | **Portal sendet finale Ticket-Bestätigung mit Ticket/QR** (Resend) nach Personalisierung | **M** |
| T12 | Shop-Design optimieren | Vivenu-Shop-Styling nach Design-Briefing (Tokens) | S |

## Übergreifend
| # | Feedback | Konsequenz | Prio |
|---|---|---|---|
| Ü1 | Slid@Home — Slides für Teilnehmer downloadbar, nach Speaker-Freigabe beim Upload | Speaker-Upload mit Freigabe-Checkbox → Teilnehmer-Bereich „Slides" (nur Ticketinhaber, nach Summit) | C |
| Ü2 | Masterclasses ins Portal, keine Doppeleingabe | bereits Kern (offering/application) | M |
| Ü3 | Masterclass-Auswahlprozess: Doppelbuchungen + UX Zulassung | Kollisionsprüfung, Bestätigungsfrist, Nachrücken, Freigabe-Gate (bereits entschieden) | M |
| Ü4 | **Portal bilingual DE/EN** (Partner/Speaker oft nur Englisch) | i18n von Tag 1: alle UI-Texte + `vocab_term` DE/EN, Sprache pro Person; Mails zweisprachig | **M** |

## Messeshop
| # | Feedback | Konsequenz | Prio |
|---|---|---|---|
| S1 | Startseite löschen (kein Mehrwert) | Shop startet direkt im Katalog | M |
| S2 | Rollentrennung aufheben; Hinweise auf Produktebene („nur für große Stände") | ein Katalog, Produkt-Hinweise/Eignung statt Rollen | M |
| S3 | Bilder aktualisieren (Qualität, Ausschnitte) | Asset-Pipeline mit festen Formaten; Bilder neu | S |
| S4 | Merch für Partner (Flaschen, Shirts im Auftrag) | Produktkategorie „Merch" mit Konfigurations-Feldern (Logo, Menge) | S |
| S5 | Lunch-Paket sichtbarer; als Checklisten-Punkt für alle | Produkt hervorheben + Deliverable „Lunch-Paket bestellen" in jeder Checkliste | M |

## Swapcard
| # | Feedback | Konsequenz | Prio |
|---|---|---|---|
| W1 | Bessere Aussteller-Kategorisierung mit Rechten (z. B. Startup) | Exhibitor-Kategorien aus Produkt/Org-Typ; Sync setzt Kategorie + Sponsor-Tier | M |
| W2 | Processing-Fehler von Participants prüfen | Sync-Report mit Fehlerliste + Retry; Ursachen aus FLS26 analysieren (Checkliste) | M |

## Partner
| # | Feedback | Konsequenz | Prio |
|---|---|---|---|
| P1 | Bestätigungsmail bei Einsendung (Branding, Rückwand …) | jeder Upload → automatische Eingangsbestätigung (Resend) | M |
| P2 | Logos nur SVG/EPS | Upload-Validierung nach Deliverable-Typ (MIME + Endung) | M |
| P3 | Partner pflegen Kontakte selbst (inkl. Primary-Status) | Kontaktverwaltung im Partner-Portal, Rollen setzbar | M |
| P4 | Reminder automatisieren, nur wenn nötig, leistungsbezogen | Reminder-Engine: Deliverable-Fälligkeit × Status → Mail (Resend); Digest | **M** |
| P5 | Logo-Listen → Website automatisch (Website = Supabase + Vercel + **Sanity**) | Integration: freigegebenes Logo → Sanity-Dokument (Partner-Logo-Liste) | S |
| P6 | Strategy-Calls 6 Wochen vor Summit für Partner ab Premium | Deliverable-Typ „Strategy-Call" mit Termin, Verantwortlichem, Notiz; Reminder | S |
| P7 | **PRIO: E-Mail-Versand aus Dashboard mit Kontaktübersicht** (kein Copy-Paste) | Admin: Empfängerauswahl (Org/Rolle/Filter) → Template → Versand via Resend, protokolliert | **M/S** |
| P8 | Onboarding-Form: alle Kontakte abfragen (Mails + Hub-Zugang) | Onboarding erfasst n Kontakte mit Rollen → jeder erhält Login | M |
| P9 | Nur ein Ticket-Code für alle Tickets → Secret Shop | Undershop je Partner (entschieden) | M |
| P10 | Startup-Tickets statt Talent für Startup-Partner | Pass-Typ-Auswahl im Onboarding nach Org-Kategorie | M |
| P11 | Softr & Messeshop Passwort/Account vereinheitlichen | erledigt durch ein Portal | M |
| P12 | Partner-Tabelle: Offer-Daten und Produktionsliste trennen; eigenes Produktions-Frontend | Produktionsportal (entschieden) | M/S |
| P13 | Richtige produktabhängige, klickbare Checkliste | Deliverable-Templates je Produkt (entschieden) | M |
| P14 | Login für alle Kontakte eines Unternehmens | Mehrere Personen je Org mit Rollen (Kern) | M |
| P15 | HubSpot: Deal zurückschieben, wenn Basisinfos fehlen | Ingest validiert Pflichtfelder → bei Lücke Deal-Stage zurücksetzen + Slack/Mail an Sales | M |

## Speaker
| # | Feedback | Konsequenz | Prio |
|---|---|---|---|
| R1 | Talk- & Description-Generator bei Eingabe (gut gepromptet) | LLM-Assistent (Claude API) im Speaker-Formular: Vorschlag aus Stichpunkten, Speaker editiert | C |
| R2 | Hear-Me-Speak-Generator in der App (statt Zusendung) | Rebuild des im-attending-Generators im Speaker-Portal (Bild-Templates) | C |
| R3 | Slot-Grafik automatisch (Bild, Titel, Name, Position, Unternehmen) → Figma-Entwurf, Freelancerin prüft/exportiert | Template-Rendering (Figma-API oder serverseitig) + Review-Queue | C |
| R4 | Login für Speaker **und** Assistenz | Delegations-Rolle „Assistenz" mit Zugriff auf Speaker-Datensatz | M |
| R5 | Masterclass-Speaker bekommen nur Professional Pass (Lounge-Zugang begrenzen) | Ticket-Regel nach Speaker-Typ; Lounge-Berechtigung als Flag | M |
| R6 | Speaker-Bilder automatisch vereinheitlichen (Belichtung, Ausschnitt, Filter) | Bild-Pipeline (Zuschnitt, Normalisierung, Farbfilter) beim Upload | S |
| R7 | Calendar-Blocker Präsentationsabgabe 48 h vor Slot, automatisiert | ICS-Mail aus Slot-Zeit (Resend) | S |
| R8 | Feld Titel (Dr.) | `title` auf person/speaker | M |
| R9 | Besserer Zugang zu abhängigen Seiten (Shuttle etc.) | klare Navigation, Bereiche sichtbar nach Status | M |
| R10 | Shuttle-Buchung neu aufbauen | UX-Redesign Shuttle (Slots, Kapazität) | S |
| R11 | Speaker Reception umbenennen | Name folgt; Flag „Reception-berechtigt" | M |
| R12 | „Create your own Timetable" → Social-Bild (OMR) | Teilnehmer wählen Sessions → Bild-Export für LinkedIn | C |

## Nachträge 08.09. (aus den Referenzen, Inventar §12)
- **T6 (OMR):** Vorbild für unsere **Confirmation Page**: Tickets + „Für wen?" + Sprache + Badge-Minimum, **„Vorerst überspringen"** statt Blocker, Next-Best-Actions (Programm, Interessen → Matching, LinkedIn), Add-on-Kacheln Hotel/DB. Login-first wie OMR machen wir **nicht** (Entscheidung 34.5), aber der Redirect nach dem Kauf ersetzt das.
- **T7 (Vivenu validiert):** Redirect mit Transaction-ID → Tickets/Rechnungen per API → Personalisierung im Portal → Rückschreiben **Vorname/Nachname/Position/Unternehmen** für Badge-Druck; parallel zur vivenu-Maske möglich. **Neu:** `vivenu_customer_id` je Person mitführen; Segment-Feature (E-Mail-Domain → Secret Shop) für Uni-/Initiativen-Kontingente prüfen (Latenz ≤ 1 h).
- **T8 (Badge-Daten):** genau die vier Rückschreibe-Felder; Badges vorgedruckt + beklebt → Datenquelle = Portal-Personalisierung.
- **T11 (Mail bei fremder E-Mail):** im Call **nicht geklärt** → Support-Frage 10; Arbeitsannahme: Portal sendet die finale Ticket-Mail (Resend) an die personalisierende Person.
- **T1 (Deposit):** OMR belegt kein echtes Pfand, nur Cashless-Freischaltung; vivenu: Rückbuchung braucht POS → Support-Frage 9 bleibt.
- **R2 (Hear-Me-Speak):** Rebuild-Spec: SVG-Template + Canvas, Zoom/Drag, PNG 1:1/4:5/9:16, Vorbefüllung aus Speaker-Profil, kein Vendor-Badge.
- **Einlass (neu):** Setup CoreGo vs. vivenu vs. Fastlane und Throughput für 10.000 Personen sind offen → Checkliste.
