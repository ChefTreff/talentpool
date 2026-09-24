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
