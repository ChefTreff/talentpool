# Bestandsaufnahme der Admin-Navigation (08.10.2026)

> **Kein Vorschlag und keine Bewertung.** Dieses Dokument zählt und benennt, was die Admin-Leiste und die Wege darunter heute enthalten — als Grundlage für Konrads Feedbackrunde zur Zusammenlegung (Plan, 08.10.2026). Was daraus folgt, entscheidet die Runde, nicht dieses Papier.

| | |
|---|---|
| Stand | `main` 0488a1ae, 08.10.2026 — aus dem Code gezogen, nicht aus dem Live-System |
| Quellen | `lib/admin-navigation.ts` (die Leiste), `lib/admin-sections.ts` (Rollen je Abschnitt), `lib/freigaben.ts` (Unterpunkte und Zähler), `components/layout/SidebarNav.tsx` (wie gezeichnet wird), `app/(admin)/admin/einstiege.ts` (Startseite), die Seitenquellen unter `app/(admin)/admin/` (Reiter), Wörterbuch `admin.nav` (deutsche Beschriftungen) |
| Nicht enthalten | **Nutzung** (im Code gibt es keine Messung, welche Punkte geöffnet werden) · **Einzel-Ausnahmen je Person** aus `/admin/rollen` (liegen in der Datenbank, nicht im Repository) · die englischen Beschriftungen |
| Rollen lesen | Die Spalte „Rollen außer Admin“ nennt die Rollen, die den Abschnitt öffnen **zusätzlich zu Admin** (Admin öffnet alles). „Nur Admin“ ist Konrads Verwaltungsbereich. Die 13 internen Rollen: sechs Bereichsleitungen (Lead Talent, Speaker, Partner, Volunteers, Hackathon, Produktion) und sieben Teams (Talent, Programm, Partner, Volunteers, Hackathon, Produktion, Marketing). Speaker und Programm sind ein Bereich: Lead Speaker und Team Programm. |

## 1 Auf einen Blick

| Was | Zahl |
|---|---|
| Menüpunkte in der Seitenleiste (für Admin) | **53** in 9 Gruppen (8 mit Überschrift, die Übersicht steht ohne) |
| Punkte je Gruppe | Übersicht (ohne Überschrift) 1 · Teilnehmende 7 · Speaker & Programm 14 · Partner 6 · Volunteers 2 · Produktion 5 · Übergreifend 1 · Verwaltung 9 · System 8 |
| Punkte, die eine Rolle in der Leiste sieht | Admin 53; die 13 internen Rollen zwischen **6** und **23** (Tabelle in Abschnitt 3) |
| Punkte, die nur Admin öffnet | 11 (Verwaltung 9, Vokabular, Mail) |
| Punkte, die jede interne Rolle öffnet | 5 (Übersicht, Fristen, Ansprechpartner & Zeiten, Wiki, UI-Kit) |
| Abschnitte mit zwei Menüpunkten | 2 (`speakers`: Speaker und Speaker-Aufgaben; `initiatives`: Initiativen und Initiativen-Award) |
| Unterpunkte in der Leiste | nur bei **Freigaben**: bis zu 5, je Art einer |
| Zähler in der Leiste | nur bei **Freigaben**: Summe am Punkt, je Art am Unterpunkt |
| Seiten (`page.tsx`) unter `/admin` | **79**: 53 mit Menüpunkt, 5 Detailseiten, 21 weitere (Reiter, Unterseiten, Weiterleitungen) |
| Seiten mit Reitern oder Auswahlknöpfen | 10 (Abschnitt 4.1) |
| Seiten mit „Auf dieser Seite“ (Abschnitte erscheinen unter dem aktiven Punkt) | 5 (Abschnitt 4.4) |
| Einstiege auf der Startseite `/admin` | drei Karten je Person, aus 17 Kandidaten (Abschnitt 4.5) |

## 2 Die Seitenleiste, Punkt für Punkt

Reihenfolge und Gruppen wie in der Leiste für Admin. Pfade sind die Adressen der Menüpunkte; „Reiter in der Seite“ sind die Reiter, die die Seite selbst zeigt (Abschnitt 4.1).

### (ohne Überschrift) — 1 Punkt

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 1 | Übersicht | `/admin` | alle 13 internen Rollen | – | – | – |

### Teilnehmende — 7 Punkte

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 2 | Bewerbungen | `/admin/bewerbungen` | Lead Talent, Talent, Programm | – | – | Bewerbungen · Je Session |
| 3 | Next Up | `/admin/next-up` | Marketing, Lead Talent | – | – | – |
| 4 | Community-Events | `/admin/community-events` | Lead Talent, Talent, Marketing | – | – | – |
| 5 | Feedback | `/admin/feedback` | Lead Talent, Talent, Marketing | – | – | – |
| 6 | Benachrichtigungen | `/admin/benachrichtigungen` | Lead Talent, Talent, Marketing | – | – | – |
| 7 | Event-Fotos | `/admin/fotos` | Lead Talent, Talent, Marketing | – | – | ein Auswahlknopf je Event |
| 8 | Hackathon | `/admin/hackathon` | Lead Hackathon, Hackathon | – | – | – |

### Speaker & Programm — 14 Punkte

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 9 | Speaker | `/admin/speaker` | Lead Speaker, Programm | – | – | – |
| 10 | Speaker-Aufgaben | `/admin/speaker/aufgaben` | Lead Speaker, Programm | – | – | – |
| 11 | Speaker-Leads | `/admin/speaker-leads` | Lead Speaker, Programm | – | – | – |
| 12 | Programm | `/admin/programm` | Programm, Lead Speaker, Lead Produktion | – | – | Kalender · Tabelle · Freigabe (führt zu Freigaben, Slots) |
| 13 | Edition & Bühnen | `/admin/edition` | Programm, Lead Produktion | – | – | – |
| 14 | Freigaben | `/admin/einreichungen` | Lead Speaker, Programm | bis zu 5: Titel & Beschreibungen · Slots · Reisekosten · Hotel · Shuttle — nur die Arten, die die Person entscheiden darf | Summe am Punkt, je Art am Unterpunkt; nur sichtbar, wenn größer als 0 | Titel & Beschreibungen · Slots · Reisekosten · Hotel · Shuttle |
| 15 | Regieplan (Programm) | `/admin/regie` | Lead Produktion, Produktion, Programm | – | – | – |
| 16 | Technik | `/admin/technik` | Lead Produktion, Produktion, Lead Speaker | – | – | – |
| 17 | Grafiken & Fotos | `/admin/grafiken` | Marketing, Lead Speaker, Programm | – | – | – |
| 18 | Speaker-Tickets | `/admin/speaker-tickets` | Lead Speaker, Programm | – | – | Tickets · Kontingente |
| 19 | Reisekosten | `/admin/reisekosten` | Lead Speaker | – | – | – |
| 20 | Hotels | `/admin/hospitality` | Lead Speaker, Programm | – | – | – |
| 21 | Side Events | `/admin/side-events` | Lead Speaker, Programm | – | – | – |
| 22 | An- & Abreise | `/admin/anreise` | Lead Speaker, Programm, Lead Produktion, Produktion | – | – | – |

### Partner — 6 Punkte

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 23 | Betreuung & Messeshop | `/admin/partner` | Lead Partner, Partner | – | – | Übersicht · Prüfen · Kontingente · Stände · Bestellungen · Vorlagen · Produkte · Integrationen |
| 24 | Initiativen | `/admin/initiativen` | Lead Partner, Partner | – | – | – |
| 25 | Initiativen-Award | `/admin/initiativen/award` | Lead Partner, Partner | – | – | – |
| 26 | Logo-Wand | `/admin/partner/logos` | Lead Partner, Partner, Lead Produktion, Produktion, Marketing | – | – | – |
| 27 | Company Tours | `/admin/company-tours` | Lead Partner, Partner, Programm, Lead Produktion, Produktion | – | – | – |
| 28 | Tour-Zuordnung | `/admin/company-tours/zuordnung` | Lead Partner, Partner, Programm, Lead Produktion, Produktion | – | – | – |

### Volunteers — 2 Punkte

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 29 | Bewerbungen & Schichten | `/admin/volunteers` | Lead Volunteers, Volunteers | – | – | Bewerbungen · Schichtplan · Vorlagen · Tickets |
| 30 | Check-in | `/admin/checkin` | Lead Volunteers, Volunteers, Lead Produktion, Produktion | – | – | – |

### Produktion — 5 Punkte

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 31 | Regie & Ablauf | `/admin/produktion` | Produktion, Lead Produktion | – | – | – |
| 32 | Stände | `/admin/produktion/staende` | Produktion, Lead Produktion | – | – | – |
| 33 | Bestellungen | `/admin/produktion/bestellungen` | Produktion, Lead Produktion | – | – | – |
| 34 | Dateien | `/admin/produktion/dateien` | Produktion, Lead Produktion | – | – | – |
| 35 | Produktstamm | `/admin/produktion/produkte` | Produktion, Lead Produktion, Lead Partner, Partner | – | – | – |

### Übergreifend — 1 Punkt

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 36 | Catering | `/admin/catering` | Lead Produktion, Produktion, Lead Volunteers, Volunteers, Lead Speaker, Programm | – | – | – |

### Verwaltung — 9 Punkte

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 37 | Personen | `/admin/personen` | nur Admin | – | – | – |
| 38 | Team | `/admin/team` | nur Admin | – | – | – |
| 39 | Rollen | `/admin/rollen` | nur Admin | – | – | – |
| 40 | Dubletten | `/admin/dubletten` | nur Admin | – | – | Offen · Dublette bestätigt · Keine Dublette |
| 41 | Löschanträge | `/admin/loeschantraege` | nur Admin | – | – | – |
| 42 | Zugänge | `/admin/verwaltung/zugaenge` | nur Admin | – | – | – |
| 43 | Protokoll | `/admin/verwaltung/protokoll` | nur Admin | – | – | – |
| 44 | Einwilligungen | `/admin/verwaltung/einwilligungen` | nur Admin | – | – | – |
| 45 | Sperrliste | `/admin/verwaltung/sperrliste` | nur Admin | – | – | – |

### System — 8 Punkte

| Nr. | Menüpunkt | Pfad | Rollen außer Admin | Unterpunkte in der Leiste | Zähler | Reiter in der Seite |
|---|---|---|---|---|---|---|
| 46 | Fristen | `/admin/fristen` | alle 13 internen Rollen | – | – | – |
| 47 | Ansprechpartner & Zeiten | `/admin/ansprechpartner` | alle 13 internen Rollen | – | – | – |
| 48 | Vokabular | `/admin/vokabular` | nur Admin | – | – | – |
| 49 | Fragenkatalog | `/admin/fragenkatalog` | Lead Talent, Talent, Programm, Lead Partner, Partner | – | – | – |
| 50 | Mail | `/admin/mail` | nur Admin | – | – | Protokoll · Vorlagen |
| 51 | Wiki | `/admin/wiki` | alle 13 internen Rollen | – | – | – |
| 52 | Medien | `/admin/medien` | Marketing, Lead Speaker, Programm | – | – | Videos · Links · Dateien · Bilder |
| 53 | UI-Kit | `/admin/ui` | alle 13 internen Rollen | – | – | – |

Zwei Abschnitte tragen je zwei Menüpunkte (gleiche Rollen): `speakers` — Speaker und Speaker-Aufgaben; `initiatives` — Initiativen und Initiativen-Award.

## 3 Was jede Rolle in der Leiste sieht

Nach `lib/admin-sections.ts`, ohne Einzel-Ausnahmen. Die Rollenverwaltung `/admin/rollen` zeigt mit derselben Liste, was eine Rolle sähe.

| Rolle | Punkte | Gruppen | Punkte je Gruppe |
|---|---|---|---|
| Admin (Konrad) | 53 | 9 | Übersicht 1 · Teilnehmende 7 · Speaker & Programm 14 · Partner 6 · Volunteers 2 · Produktion 5 · Übergreifend 1 · Verwaltung 9 · System 8 |
| Lead Talent | 12 | 3 | Übersicht 1 · Teilnehmende 6 · System 5 |
| Lead Speaker | 19 | 4 | Übersicht 1 · Speaker & Programm 12 · Übergreifend 1 · System 5 |
| Lead Partner | 13 | 4 | Übersicht 1 · Partner 6 · Produktion 1 · System 5 |
| Lead Volunteers | 8 | 4 | Übersicht 1 · Volunteers 2 · Übergreifend 1 · System 4 |
| Lead Hackathon | 6 | 3 | Übersicht 1 · Teilnehmende 1 · System 4 |
| Lead Produktion | 20 | 7 | Übersicht 1 · Speaker & Programm 5 · Partner 3 · Volunteers 1 · Produktion 5 · Übergreifend 1 · System 4 |
| Talent | 11 | 3 | Übersicht 1 · Teilnehmende 5 · System 5 |
| Programm | 23 | 6 | Übersicht 1 · Teilnehmende 1 · Speaker & Programm 12 · Partner 2 · Übergreifend 1 · System 6 |
| Partner | 13 | 4 | Übersicht 1 · Partner 6 · Produktion 1 · System 5 |
| Volunteers | 8 | 4 | Übersicht 1 · Volunteers 2 · Übergreifend 1 · System 4 |
| Hackathon | 6 | 3 | Übersicht 1 · Teilnehmende 1 · System 4 |
| Produktion | 18 | 7 | Übersicht 1 · Speaker & Programm 3 · Partner 3 · Volunteers 1 · Produktion 5 · Übergreifend 1 · System 4 |
| Marketing | 13 | 5 | Übersicht 1 · Teilnehmende 5 · Speaker & Programm 1 · Partner 1 · System 5 |

## 4 Weitere Wege zu den Seiten

### 4.1 Reiter und Auswahlknöpfe in Seiten

| Seite | Pfad | Reiter | Bemerkung |
|---|---|---|---|
| Programm | `/admin/programm` | Kalender · Tabelle · Freigabe (führt zu Freigaben, Slots) (3) | auch auf /admin/programm/tabelle |
| Freigaben | `/admin/einreichungen` | Titel & Beschreibungen · Slots · Reisekosten · Hotel · Shuttle (5) | nur die Arten, die die Person entscheiden darf; je Reiter die Zahl offener Einträge |
| Betreuung & Messeshop | `/admin/partner` | Übersicht · Prüfen · Kontingente · Stände · Bestellungen · Vorlagen · Produkte · Integrationen (8) | gilt für alle Unterseiten unter /admin/partner (ohne Logo-Wand) |
| Bewerbungen & Schichten | `/admin/volunteers` | Bewerbungen · Schichtplan · Vorlagen · Tickets (4) | – |
| Mail | `/admin/mail` | Protokoll · Vorlagen (2) | – |
| Bewerbungen | `/admin/bewerbungen` | Bewerbungen · Je Session (2) | – |
| Medien | `/admin/medien` | Videos · Links · Dateien · Bilder (4) | nur die Bereiche, für die die Person Recht hat |
| Dubletten | `/admin/dubletten` | Offen · Dublette bestätigt · Keine Dublette (3) | – |
| Speaker-Tickets | `/admin/speaker-tickets` | Tickets · Kontingente (2) | – |
| Event-Fotos | `/admin/fotos` | ein Auswahlknopf je Event (1) | Zahl und Namen hängen an den Events in der Datenbank |

### 4.2 Unterseiten über Schaltflächen und Weiterleitungen

| Seite | Wie man hinkommt |
|---|---|
| `/admin/speaker/verlauf` | Schaltfläche auf `/admin/speaker` („Verlauf aller Speaker“) |
| `/admin/speaker/website` | Schaltfläche auf `/admin/speaker` („Website (Sanity)“) |
| `/admin/technik/praesentationen` | Schaltfläche auf `/admin/technik` („Nach Slots“) |
| `/admin/grafiken/meet-us-at` | Schaltfläche je Partner auf `/admin/grafiken` |
| `/admin/dubletten/zusammenfuehren` | Schaltfläche je Paar auf `/admin/dubletten` |
| `/admin/ui/fehlerprobe` | Schaltfläche auf `/admin/ui` |
| `/admin/programm/freigabe` | Weiterleitung auf `/admin/einreichungen?art=slots` |
| `/admin/videos` | Weiterleitung auf `/admin/medien?bereich=videos` |
| `/admin/bewerbungen/sessions`, `/admin/mail/vorlagen`, `/admin/programm/tabelle`, `/admin/volunteers/schichten`, `/admin/volunteers/tickets`, `/admin/volunteers/vorlagen`, `/admin/partner/review`, `/admin/partner/kontingente`, `/admin/partner/staende`, `/admin/partner/bestellungen`, `/admin/partner/vorlagen`, `/admin/partner/produkte`, `/admin/partner/integrationen` | Reiter (Abschnitt 4.1) |

### 4.3 Detailseiten

`/admin/bewerbungen/[id]` · `/admin/community-events/[id]` · `/admin/partner/[org]` · `/admin/personen/[id]` · `/admin/speaker/[id]` — 5 Seiten, erreicht aus den Listen der jeweiligen Menüpunkte.

### 4.4 „Auf dieser Seite“ unter dem aktiven Punkt

Solange man auf einer Seite ist, die eine Übersicht ihrer Abschnitte zeigt (`AbschnittsNavigation`), erscheinen diese Abschnitte als eingerückte Unterpunkte unter dem aktiven Menüpunkt (QS-026). Fünf Seiten im Admin tun das: Edition & Bühnen (`/admin/edition`), Grafiken & Fotos (`/admin/grafiken`), die Organisation (`/admin/partner/[org]`), die Person (`/admin/personen/[id]`) und der Speaker (`/admin/speaker/[id]`).

### 4.5 Die Startseite `/admin`

Unter dem Band zeigt die Startseite **drei Einstiege**: die ersten drei der folgenden 17 Kandidaten, die die Rolle öffnen darf (Konrads Ausnahmen mitgerechnet): Programm · Speaker · Betreuung & Messeshop · Produktion · Bewerbungen · Bewerbungen & Schichten · Regieplan (Programm) · Technik · An- & Abreise · Hotels · Grafiken & Fotos · Catering · Wiki · Medien · Fristen · Ansprechpartner & Zeiten · Personen.

## 5 Gleiche Beschriftungen an mehreren Stellen (nur gezählt)

Wörtlich gleiche Beschriftungen unter den 53 Menüpunkten und den Reitern aus Abschnitt 4.1. Keine Gewichtung, keine Verwandtschaft ähnlicher Wörter.

| Beschriftung | Vorkommen | Wo |
|---|---|---|
| Bewerbungen | 3 | Menü Teilnehmende (`/admin/bewerbungen`); Reiter auf Bewerbungen & Schichten (`/admin/volunteers`); Reiter auf Bewerbungen (`/admin/bewerbungen`) |
| Vorlagen | 3 | Reiter auf Betreuung & Messeshop (`/admin/partner`); Reiter auf Bewerbungen & Schichten (`/admin/volunteers`); Reiter auf Mail (`/admin/mail`) |
| Bestellungen | 2 | Menü Produktion (`/admin/produktion/bestellungen`); Reiter auf Betreuung & Messeshop (`/admin/partner`) |
| Dateien | 2 | Menü Produktion (`/admin/produktion/dateien`); Reiter auf Medien (`/admin/medien`) |
| Kontingente | 2 | Reiter auf Betreuung & Messeshop (`/admin/partner`); Reiter auf Speaker-Tickets (`/admin/speaker-tickets`) |
| Protokoll | 2 | Menü Verwaltung (`/admin/verwaltung/protokoll`); Reiter auf Mail (`/admin/mail`) |
| Reisekosten | 2 | Menü Speaker & Programm (`/admin/reisekosten`); Reiter auf Freigaben (`/admin/einreichungen`) |
| Stände | 2 | Menü Produktion (`/admin/produktion/staende`); Reiter auf Betreuung & Messeshop (`/admin/partner`) |
| Tickets | 2 | Reiter auf Bewerbungen & Schichten (`/admin/volunteers`); Reiter auf Speaker-Tickets (`/admin/speaker-tickets`) |
| Übersicht | 2 | Menü Übersicht (`/admin`); Reiter auf Betreuung & Messeshop (`/admin/partner`) |

## 6 Schon eingeplant (offen in anderen Chats, Stand 08.10.)

In den Backlogs unter `docs/feedback/` stehen bei den offenen Punkten drei, die die Leiste verändern würden (gesucht nach „Menüpunkt“, „Unterpunkt“, „Zähler im Menü“, „Reiter unter“). Sie sind **noch nicht gebaut**; Plan hat am 08.10. entschieden, vor Konrads Navigations-Feedback nichts an der Admin-Shell umzubauen (ADM-070 minimal).

| Punkt | Inhalt | Status |
|---|---|---|
| ADM-067 | eigener Menüpunkt „Speakerportal“ (Aufgaben der Speaker-Checkliste, Checklisten-Vorlagen) | offen — Speaker-Chat |
| ADM-070 | Kalender, Tabelle und Freigabe als drei Unterpunkte unter Programm | offen — Speaker-Chat (minimal) |
| ADM-084 | Liste „Neue Speaker“ unter Speaker, Zähler im Menü wie bei Freigaben | offen — Speaker-Chat (nach Side Events) |

## 7 Wie das Dokument entstanden ist

- Die Tabellen der Abschnitte 1 bis 3 und 5 sind mit einem Wegwerf-Skript aus `ADMIN_NAVIGATION`, `ADMIN_SECTIONS` und dem Wörterbuch gezogen; die Reiter (4.1) und die Wege (4.2 bis 4.4) stammen aus den genannten Seitenquellen und sind von Hand gelesen.
- Gegengerechnet: 53 Menü-Adressen = 53 Seiten mit Menüpunkt; 79 Seiten = 53 + 5 + 21.
- Nicht nachgeprüft: wie die Leiste im Live-Betrieb für einzelne Personen aussieht (Ausnahmen, Rollen-Kombinationen). Das zeigt `/admin/rollen`.

