# Konrads offene Entscheidungen und Aufgaben — Stand 24.09.2026 (abends)

Gesammelt von der Architektur-Session aus Arbeitsauftrag, Entscheidungslog, Security-Check, Datenschutz-Checkliste und Abschluss-Checkliste. Antworten bitte gesammelt mit der Kennung (z. B. „K-01: Seitengruppe“). Erledigtes streiche ich nach deiner Antwort hier und im jeweiligen Dokument.

**Bereits entschieden heute:** Close kommt nicht, HubSpot bleibt (Konrad, 24.09.) → die HubSpot-Einbindungen laufen weiter (Produktabgleich INV0, Deal-Ingest scharf schalten, Sales-Labels).

## A · Entscheidungen zum Bau (blockieren Bausteine der Chats)

| Nr. | Frage | Empfehlung | Quelle |
|---|---|---|---|
| K-01 | **D11 Struktur Teilnehmer-Portal:** „Home“ allgemein und darunter eine Seitengruppe „Summit 2027“ — oder ein eigenes Unterportal für den Summit? | Seitengruppe (ein Login, ein Profil, Umschalter bleibt für Rollen) | Arbeitsauftrag Welle 6, „Runde 24.09.“ → D11; TAL-005/006 |
| K-02 | **D12 Community-Events:** Eigenbau, Luma per iFrame oder Hybrid über die Luma-API? | Hybrid (Events-Seite im Portal, Anmeldung mit Profildaten, Reichweite und Erinnerungen bleiben bei Luma, Teilnahmen zurück ins Profil); Tarif Luma Plus prüfen | D12; TAL-007/008 |
| K-03 | **D13 Drive-Zugang** für die Folien-Spiegelung in den Technik-Ordner: Service-Konto anlegen oder freigeben (Schreibrecht nur auf diesen Ordner) | Service-Konto der Workspace, Schlüssel nur in Vercel | D13; SPK-023, LEAD-023 |
| K-04 | **Feldvorschlag Teilnehmer-Profil:** welche Felder ergänzen, welche weglassen? | Vorschlag des Talent-Chats lesen und je Feld ja/nein | `docs/talent-felder-vorschlag.md` (TAL-013) |
| K-05 | **INV0 SKU-Liste** für den HubSpot-Produktabgleich bestätigen (Hauptartikel nur aktualisieren, 38 Altartikel ohne Nummer archivieren) | Trockenlauf-Liste aus Admin → Partner → Integrationen durchgehen, dann Echtlauf freigeben | Entscheidungslog 21.09.; `docs/hubspot-einbindungen.md` E4/E5 |
| K-06 | **Rollen je Admin-Abschnitt** bestätigen oder anders schneiden (wer sieht was im Admin) | Vorschlag des Admin-Chats übernehmen, Verwaltung bleibt bei dir | `docs/runbooks/admin-abschnitte.md` (#144) |
| K-07 | **Externe Stage Leads:** eigene Rolle vor dem ersten externen Zugang (heute öffnet `speaker_manager` den Admin) — einverstanden, dass bis dahin keine externen Zugänge vergeben werden? | ja; Rollentrennung mit PORT3 beim Speaker-Chat | Arbeitsauftrag PORT3 (Auflage 24.09.) |
| K-08 | **Mail-Routing Zusatztickets:** Rolle `area_lead_partner` vergeben (dann gehen die Anfragen dorthin, nicht mehr an dich) oder bewusst leer lassen? | leer lassen, bis das Partner-Team steht | #146, PART-070 |
| K-09 | **Ansprechperson „Programmleitung“:** Paulina bekommt für die Freigabe (`/admin/programm/freigabe`) die Rolle `programme_team` — Zugang anlegen? | ja, sobald sie Feedback geben soll | #152, LEAD-022 |

## B · Deine Prüfrunden

| Nr. | Aufgabe | Quelle |
|---|---|---|
| K-10 | **Sichtprüfung QS-037** in allen vier Portalen (Speaker, Speaker-Leads, Admin, Partner) mit deinem Login; Design hat ohne Login geprüft | #143, #148, #150, #151 |
| K-11 | **Admin-Runde** (dein erstes Feedback zum Admin, jetzt mit Produktion unter `/admin/produktion`) und Live-Test, dass `portal.chef-treff.de/produktion` weiterleitet | #144, QS-040 |
| K-12 | **Gesamt-Durchklick** nach dieser Feedbackrunde — erst wenn die Listen der Chats abgearbeitet sind (Stand in `docs/feedback/*.md`) | deine Ansage 24.09. |

## C · Security (aus `docs/security-check-2026-09.md`)

| Nr. | Aufgabe | Empfehlung |
|---|---|---|
| K-13 | **F3 CSP scharf schalten** (`CSP_ENFORCE=true` in Vercel) nach Prüfung der Reports (`[csp]` in den Vercel-Logs) | vor dem Go-live 14.10. |
| K-14 | **F5 Supabase-Auth-Rate-Limits** im Dashboard kontrollieren (E-Mail-OTP je Stunde, Abstand je Adresse) | Standardwerte reichen, einmal ansehen |
| K-15 | **F6 `ip_hash`** in `audit_log`/`consent_record`: befüllen (Nachweis) oder streichen (Datenminimierung) | streichen |
| K-16 | **Schlüsselrotation Supabase Secret Key** (offen seit 18.09.) und HubSpot-Service-Schlüssel (7 Tage Karenz) | Runbook `key-rotation.md`, Termin setzen |
| K-17 | **Supabase Auth „Leaked Password Protection“** aktivieren | Dashboard → Authentication → Settings |

## D · Datenschutz (aus `docs/datenschutz-verarbeitungen.md` §4 und Abschluss-Checkliste)

| Nr. | Aufgabe | Vorschlag |
|---|---|---|
| K-18 | **Aufbewahrungsfristen** je Verarbeitung | Bewerbungen 12 Monate nach der Edition, Tickets und Spesen 10 Jahre (HGB/AO), Mail-Protokoll 6 Monate |
| K-19 | **Einwilligungstext `event_app`** (Weitergabe an die Event-App) DE/EN freigeben — für Bewerbung, Ticketkauf und Speaker-Onboarding | Entwurf liefert die Architektur-Session nach deiner Freigabe der Fristen |
| K-20 | **Art.-9-Daten** (Ernährung, Unverträglichkeiten): ausdrückliche Einwilligung mit Zweck, Löschung nach der Edition — Text freigeben | wie K-19 |
| K-21 | **AVVs** abschließen und ablegen: HubSpot (bleibt), Swapcard, Anthropic (Assistenten), Resend, Supabase, Vercel, vivenu, SevDesk, Google Workspace | Status je Anbieter eintragen |
| K-22 | **Löschkonzept extern:** Zuständigkeit und Frist (30 Tage) für die Löschung in vivenu, HubSpot, Swapcard nach einer Profillöschung | Runbook, Zuständigkeit benennen |
| K-23 | **Informationspflicht** gegenüber Dritten, die ein Speaker einträgt (Agentur, Office) | Hinweis-Mail an die eingetragene Person — ja/nein |

## E · Betrieb (Konrad-Aufgaben aus `docs/abschluss-checkliste.md`)

| Nr. | Aufgabe |
|---|---|
| K-24 | HubSpot: **Zuordnungs-Labels** für Kontaktrollen anlegen (Hauptkontakt, Unterschrift, Buchhaltung, Event-App, Weiterer Kontakt) und **Deal-Ingest scharf schalten** (`set_edition_hubspot` im Admin → Integrationen) — wann? |
| K-25 | Zugangs-Liste: alle Werte in Vercel (Production und Preview), `NEXT_PUBLIC_SITE_URL` prüfen |
| K-26 | Kontingente Hotel, DB-Ticket, Locker über Laura bis 01.11.; Add-ons in vivenu |
| K-27 | Chatbase kündigen nach Go-live des eigenen Assistenten; PII im Wiki bereinigen; Notion-Wikis nach Import einfrieren; Volunteer-Wiki exportieren |
| K-28 | Domain-Umzug Teil A Anfang Oktober (Runbook `domain-umzug.md`); PITR-Add-on im Härtungsfenster vor dem Go-live |
| K-29 | Katalogpreise (Oktober) und Moods der Halle für die Shop-Bilder (PART-077) — nur Erinnerung |

## Antworten Konrad (24.09.2026, abends) und was daraus folgt

Datenschutz und Sicherheit macht Konrad in den nächsten Tagen; vorab entschieden:

| Nr. | Antwort | Folge |
|---|---|---|
| K-01 | Seitengruppe | D11 entschieden → TAL-005/006 frei (Talent-Chat) |
| K-02 | Luma-API-Hybrid, Luma Plus ist aktiv | D12 entschieden → TAL-007/008 frei; Konrad legt später den Luma-API-Schlüssel per `sh scripts/env-set.sh LUMA_API_KEY --no-local` ab (Anleitung folgt mit dem Baustein) |
| K-03 | Dienstkonto, bitte Anleitung | Runbook `docs/runbooks/drive-service-konto.md` |
| K-04 | A1–A10 ja, B1 nein, B2–B5 ja, C1 abgespeckt, C2 ja, C3 nur Hack, C4 nein, C5 → TAL-009; Fragen 1–5 beantwortet | `docs/talent-felder-vorschlag.md` §5; TAL-013 bauen; Pflichtfeld-Prüfung auf der finalen Checkliste |
| K-05 | INV0 als Letztes, wenn das Sales-Team eingeladen ist | Status „zurückgestellt bis Sales-Einladung“ |
| K-06/K-07/K-09 | Rollenmodell: je Bereich Lead und Team; Partner-Team-Rolle; Speaker und Programm ein Bereich (Lead Paulina, Team `programme_team`); externe Stage Leads (`speaker_manager`) **ohne** Admin-Zugang; Rollen per Mehrfachauswahl, Abschnitte je Rolle und je Person schaltbar | **ADM-053** (P1, Admin-Chat mit Speaker-Chat für PORT3) |
| K-08 | Empfehlung folgen: leer lassen | erledigt |
| K-10 | Sichtprüfung Speaker: 20 Punkte | SPK-048…067; global QS-042…044; Speaker-Leads-Übersicht LEAD-024 bestätigt; Talent/Partner/Stage Leads später |
| K-11 | Weiterleitung funktioniert, darf bleiben; Admin-Feedback | ADM-054 (Unterseiten Produktion), QS-045 (Menü-Ebenen, Portalauswahl unten), QS-046 (Admin-Farbe Lila) |
| K-13 | `CSP_ENFORCE` in Vercel gesetzt, nichts geprüft | **Stand 24.09. abends: der Header läuft weiter Report-Only** — die Variable greift erst mit einem Redeploy und nur, wenn sie in *Production* exakt `true` heißt. Nichts zu löschen. Vor dem Scharfschalten prüft die Architektur-Session die `[csp]`-Meldungen in den Vercel-Logs; steht auf der finalen Checkliste |
| K-14 | Screenshot Rate Limits (E-Mails 30/h; Verifikationen, Anmeldungen 30 je 5 Min je IP) | **Empfehlung:** vor dem Go-live E-Mails ≥ 200/h, Anmeldungen und Verifikationen ≥ 100 je 5 Min — am Summit teilen sich hunderte Geräte eine IP; steht auf der finalen Checkliste |
| K-15 | streichen, sofern kein Sicherheitsrisiko | kein Risiko (Spalten leer, Nachweis über Zeitpunkt, Fassung, User-Agent) → Migration durch die Architektur-Session nach der Pause |
| K-17 | erledigt | — |
| neu | Emilio-Feedback zum Hackathon (Granola-Notiz) | HACK-006, wird beim Start der Hackathon-Arbeiten ausgelesen |
| offen | K-12, K-16, K-18…K-29 | in den nächsten Tagen (Konrad) |
| K-30 | **Luma-Zugang** anlegen (TAL-007, D12): `sh scripts/env-set.sh LUMA_API_KEY` (Wert aus Luma → Kalender → Einstellungen → API, Luma Plus) und `sh scripts/env-set.sh LUMA_CALENDAR_ID --config` (Kalender-ID, vermutlich `cal-B49jJXx8bsvPDo0`). Danach prüft der Talent-Chat mit `node --env-file=.env.local scripts/luma-probe.mjs` (nur lesend). | neu 24.09. (Talent-Chat, #170) |
| K-30b | **Luma, zweiter Schalter:** `sh scripts/env-set.sh LUMA_WRITE_ENABLED --config` erst auf `true` setzen, wenn die Lese-Probe grün war — vorher schreibt das Portal nichts nach Luma (TAL-007 Stufe 2, #175). | neu 24.09. (Talent-Chat) |
| K-30c | **Luma-Probe rot (24.09. Nacht, Talent-Chat):** `403 /v1/users/get-self — Your calendar must have an active Luma Plus plan to make API requests`. Der Schlüssel wird erkannt, aber sein Kalender hat kein aktives Plus — oder der Schlüssel stammt aus einem anderen Kalender (persönlicher statt `cal-B49jJXx8bsvPDo0`). **Bitte in Luma prüfen:** Plus aktiv auf genau diesem Kalender? Dann den API-Schlüssel dort neu erzeugen (Kalender → Einstellungen → API) und ersetzen: `sh /Users/konradgruner/Developer/talentpool/scripts/env-set.sh LUMA_API_KEY`. Danach wiederholt der Talent-Chat die Probe; `LUMA_WRITE_ENABLED` bleibt bis dahin aus. **Erledigt 24.09. Nacht:** Abo reaktiviert (war ausgestellt, Schlüssel war richtig), Probe grün — Schlüssel ok, Kalender `cal-B49jJXx8bsvPDo0`, zwei kommende Events. | erledigt 24.09. Nacht |
| K-31 | **Company Tour ↔ Session verknüpfen (TAL-003, #179):** Teilnehmende bewerben sich auf eine Session; die Tour braucht dazu die Zuordnung (`company_tour.session_id`, 0172). Wer pflegt sie? **Empfehlung:** das Team im Admin bei der Tourpflege (Admin-Chat, zusammen mit ADM-052). Bitte bestätigen oder anders entscheiden. | neu 24.09. Nacht |
| K-32 | **PART-081 Standbühnen-Speaker als Gäste — vier Fragen aus dem Vorschlag des Partner-Chats** (`docs/vorschlag-part081-standbuehnen-gaeste.md`, #182). Empfehlung der Architektur-Session in Klammern: (1) Einlass: Gäste brauchen ein Ticket aus dem Partner-Kontingent (ja — „kein separates Ticket“ heißt kein Speaker-Freiticket); (2) Swapcard: nur als Name am Programmpunkt, keine App-Einladung (Datenminimierung, „nur am Slot“); (3) Porträt optional (Swapcard zeigt sonst den Platzhalter); (4) Löschen: Gastprofil weg, Person bleibt wie bei den Kontakten. **Zusätzliche Auflage der Architektur-Session:** der Partner bestätigt beim Anlegen, dass die Person informiert und einverstanden ist (Haken mit Zeitstempel wie `consent_at` bei den Kontakten) — Name, Position und Porträt gehen in die Event-App. Bitte die vier Punkte bestätigen oder anders entscheiden; dann baut der Partner-Chat. | neu 24.09. Nacht |

## Antworten Konrad (24.09., Nacht)
- **ADM-057 / #164:** Kundennummer = HubSpot-Eigenschaft `company_id` („Übergreifende Kundennummer (Company ID)“) → Übernahme in den Ingest beim Admin-Chat.
- **SPK-068 vorziehen (P1 sofort):** Speaker-Ticket ausstellen — Konrad will es testen; Kette vivenu → Portal → Swapcard muss funktionieren.
- **K-30 Befehle** (Repo-Ordner, Werte werden unsichtbar abgefragt): `sh scripts/env-set.sh LUMA_API_KEY` (sensibel, geht nach Vercel und lokal in `.env.local`) · `sh scripts/env-set.sh LUMA_CALENDAR_ID --config` · später `sh scripts/env-set.sh LUMA_WRITE_ENABLED --config` mit `true`, erst nach grüner Lese-Probe.
- **K-30 erledigt (24.09. Nacht):** `LUMA_API_KEY` und `LUMA_CALENDAR_ID` sind gesetzt (Vercel und lokal). K-30b (`LUMA_WRITE_ENABLED`) wartet auf die grüne Lese-Probe des Talent-Chats — die Architektur-Session sagt Konrad Bescheid.
- **K-30c (24.09. Nacht):** Lese-Probe rot mit 403 (kein aktives Luma Plus auf dem Kalender des Schlüssels). Konrad prüft Plus auf `cal-B49jJXx8bsvPDo0`, erzeugt den Schlüssel dort neu und setzt ihn mit demselben Befehl wie bei K-30 erneut; K-30b wartet weiter.
- **K-30c erledigt, K-30b jetzt (24.09. Nacht):** Probe grün nach Reaktivierung des Abos. Befehl für K-30b (Wert `true`): `sh /Users/konradgruner/Developer/talentpool/scripts/env-set.sh LUMA_WRITE_ENABLED --config` — danach Redeploy nicht nötig für den Cron (liest Vercel-Env beim nächsten Lauf), die Events-Seite schreibt ab dem nächsten Deployment.
