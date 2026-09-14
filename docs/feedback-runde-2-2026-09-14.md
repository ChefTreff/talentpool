# Feedback-Runde 2 (Konrad, 14.09.2026) — Grundstruktur, Partner-Portal, Admin

Querschnitts-Auftrag **F8 ff.**, Fortsetzung der Zählung aus Runde 1 (F1–F7). Konrad gibt das Feedback in mehreren Teilen; dieses Dokument wächst mit. **Teil 1: Grundstruktur und Partner-Portal.**

Aufteilung nach Absprache mit der Architektur-Session: Oberfläche und Verhalten baut die Build-Session, ein PR je Baustein. Alles, was Regeln ändert — wer was sehen darf, Rollen, Datenfelder, Abweichungen, Integrationen — ist unten als **Entscheidung** markiert und geht an die Architektur-Session.

Konrads Leitsatz für diese Runde, er gilt für jede Seite: *„extrem serviceorientiert denken und Fragen antizipieren, damit sie gar nicht erst gestellt werden. Alles simpel und klar, aber auch ausführlich genug."*

---

## A · Grundstruktur

| Nr. | Seite | Ist | Soll |
|---|---|---|---|
| **F8.1** | alle | Die Seitenleiste ist eine abgerundete Karte **innerhalb** eines zentrierten Inhaltsbereichs, darüber eine Topbar. | Echte Seitenleiste: bündig am linken Rand, über die volle Höhe, kein Container darum. Vorbild: Teamportal (Screenshot). |
| **F8.2** | alle | Die Wortmarke steht als Text in der Topbar. | Das **Logo** steht dauerhaft oben in der Seitenleiste, **monochrom**. ⚠️ Die SVGs liegen nicht im Repo — siehe „Was fehlt". |
| **F8.3** | alle | Der Bereichswechsel ist eine Reihe von Links in der Topbar, erst ab zwei Bereichen. | Auswahl **im Menü** (Seitenleiste), als aufklappbare Auswahl des aktuellen Portals. |
| **F8.4** | alle | Mehrere Bereiche starten auf einer Unterseite; nicht jedes Portal hat eine eigene Übersicht. | Jedes Portal ist ein **vollständig eigenständiges Portal** mit eigener Startseite, die als Übersicht dient. |
| **F8.5** | alle | „Mein Profil" hängt als Navigationspunkt in jedem Fachbereich und führt ins Teilnehmer-Portal — aus dem Volunteer-Portal landet man im Speaker-Portal. | **Globales Profilmenü oben rechts**: kleines Profilbild, darunter ein Aufklappmenü (Profil, Einstellungen, Sprache, Abmelden). Unabhängig vom Portal, überall gleich. Vorbild: Screenshot 2. |
| **F8.6** | Admin | Admin steht als gleichrangiges Portal im Umschalter. | Admin ist ein **separater Bereich**, aus jeder App ansteuerbar und klar als solcher erkennbar. Aus dem Speaker-Portal führt „Admin" in den **Speaker-Abschnitt** des Admin-Bereichs. Der Admin-Bereich ist genauso gegliedert wie die Portale: Speaker, Partner, Volunteers, Hackathon, Produktion, System. |
| **F8.7** | alle | Das Teilnehmer-Portal erscheint nur, wenn es der **einzige** Bereich ist (Runde 1, Punkt 2). | **Entscheidung, Umkehrung:** Das Teilnehmer-Portal ist immer sichtbar. Begründung Konrad: es ist das Front-End des Talent-CRM und gilt übergreifend für Teilnehmende des Summits und anderer Formate — also ein eigenes Portal wie die anderen. |
| **F8.8** | alle | — | **UX-Durchgang** über alle Oberflächen: Hierarchien schärfen, Handlungsflächen sichtbar machen, aufräumen. Konrad möchte dafür einen Skill einbinden; Vorschläge unten. |

## B · Partner-Portal

Grundhaltung für alle Partnerseiten: mehr Erklärung, Fragen vorwegnehmen. Das Menü bleibt, wie es ist.

| Nr. | Seite | Ist | Soll |
|---|---|---|---|
| **F9.1** | `/partner` | Fortschritt, Fristen, gebuchte Leistungen. | Dazu feste Inhalte: **Ansprechpartner mit Bild** (Speaker-Buddy, Partner-Buddy, allgemeiner Kontakt), **allgemeine Zeiten** (nur Öffnungszeiten, Einlass, Aufbau — Details im Wiki, mit Verweis), **Google-Maps-Karte** der Location (CCH, Congressplatz 1, 20355 Hamburg) mit Hinweis aufs Wiki für die Anfahrt. |
| **F9.2** | `/partner/tickets` | Frist als Textzeile. | Frist **deutlich größer und als Countdown**. |
| **F9.3** | `/partner/tickets` | Der Ticketshop liegt hinter einem Link. | Shop **als iFrame eingebettet**, damit niemand das Portal verlässt. Geht das nicht, ein klarer Knopf. |
| **F9.4** | `/partner/tickets` | Keine Anleitung. | **Loom-Video** einbetten (`532a8072a5eb49f8ba8c35b0e2a29044`). Dazu im Admin eine **zentrale Liste aller eingebetteten Videos**, in der die Links austauschbar sind. |
| **F9.5** | `/partner/tickets` | Kein Verweis aufs Wiki. | Wiki verlinken. |
| **F9.6** | `/partner/wiki` | Leer. | Alle Artikel aus dem bestehenden Notion-Wiki anlegen. |
| **F9.7** | Admin | Artikel nur über Felder pflegbar. | **Redaktionsoberfläche** für Wiki-Artikel, vergleichbar mit dem Notion-Editor (übliche Formatierungen). |
| **F9.8** | `/partner/event-app` | **Seite fehlt vollständig.** | Neue Seite: erklärend, führt zu Swapcard, mit Checkliste. Inhalt steht unten. |

### F9.8 · Inhalt der Event-App-Checkliste (von Konrad)

1. **Füllt euer Profil aus:** Bitte geht in den Exhibitor-Bereich der App und füllt euer Profil vollständig aus. Ergänzt Links zu eurer Karriere-Seite und Social-Kanälen, ein Header-Bild und weitere Informationen.
2. **Fügt euer Team hinzu:** Bestenfalls über das Partner-Hub. Alternativ könnt ihr auch direkt in der App Team-Mitglieder hinzufügen. Das geht allerdings erst, wenn sie bereits ein Ticket auf ihre Mailadresse personalisiert haben.
3. **Füllt die Profile der Mitarbeitenden aus:** Bestenfalls sind auch die Profile aller Teammitglieder richtig ausgefüllt, sodass man als Teilnehmer direkt sieht, mit wem man spricht.

---

## C · Entscheidungen für die Architektur-Session

Diese Punkte ändern Regeln, Datenfelder oder Integrationen. Sie sind weitergeleitet; gebaut wird erst nach der Antwort.

1. **F8.7 — Teilnehmer-Portal immer sichtbar.** Kehrt Runde 1, Punkt 2 um. Betrifft `areasFor()` und `canEnterArea()` und damit jeden Bereich. Rückfrage: Gilt die Umkehrung auch für das Kiosk-Konto? Dort war die Trennung ausdrücklich gewollt (E8, `isKioskOnly`), und ein Gerätekonto am Eingang sollte kein Teilnehmerprofil öffnen.
2. **F9.1 — Ansprechpartner als Datenfeld.** Speaker-Buddy, Partner-Buddy und allgemeiner Kontakt je Edition, mit Bild. Runde 1 hat private Kontaktdaten von Freelancern ausdrücklich aus dem Portal genommen; ein Buddy braucht also ein Rollen-Postfach und ein Bild, keine private Nummer.
3. **F9.1 — Allgemeine Zeiten als Editionsdaten.** Öffnungszeiten, Einlass, Aufbau je Edition, sichtbar in Partner- **und** Speaker-Portal und im Wiki. Braucht Felder und eine Pflegestelle.
4. **F9.1 — Google Maps.** Externe Einbettung: CSP `frame-src`, Datenschutz (Maps setzt Cookies und überträgt die IP), ggf. Zwei-Klick-Lösung.
5. **F9.3 — Ticketshop im iFrame.** CSP `frame-src` für vivenu; ob vivenu das Framing erlaubt (`X-Frame-Options`/`frame-ancestors`), ist zu prüfen. Ohne Freigabe bleibt der Knopf.
6. **F9.4 — Loom-Einbettung und Videoliste.** CSP `frame-src` für Loom; die zentrale Liste braucht eine Ablage (Tabelle oder Vokabular) plus Admin-Oberfläche.
7. **F8.6 — Admin ist kein Portal im Umschalter.** Ändert die Bedeutung von `AREAS`; Rechte bleiben, wie sie sind (`is_staff()`).

## D · Was noch fehlt, damit gebaut werden kann

- **Logo-SVGs (F8.2).** Im Repo liegt kein Logo; die Marke steht heute als Text. Der Design-Skill hält fest: „Endgültige Wahl klärt Konrad, sobald die SVGs im Repo liegen." Gebraucht wird die monochrome Variante (hell auf Navy), am besten als SVG. Bis dahin bleibt die Wortmarke als Platzhalter an der richtigen Stelle stehen.
- **Bilder der Ansprechpartner (F9.1).**
- **Zugriff auf die Notion-Wiki-Inhalte (F9.6)** — die Seite ist öffentlich geteilt, der Abruf ist geplant.

## E · Skill-Vorschläge für den UX-Durchgang (F8.8)

Recherche vom 14.09.2026. **Keiner davon ist installiert** — das ist Konrads Entscheidung, weil es fremder Code im Repo ist.

| Kandidat | Was er tut | Einschätzung |
|---|---|---|
| `vercel-labs/agent-skills` → **web-design-guidelines** | Prüft bestehenden UI-Code gegen 100+ Regeln zu Zugänglichkeit und UX. | Passt am besten: ein **Prüfwerkzeug**, kein Generator — genau das, was ein Durchgang braucht. |
| **AccessLint** | Vier Skills, ein Review-Agent, MCP-Server für Kontrastmessung. | Stark bei Zugänglichkeit; überschneidet sich mit unserer `kontrast.mjs`. |
| **UI/UX Pro Max** | Durchsuchbare Wissensbasis (Design-Datenbank, Schriftpaarungen, Paletten, Anti-Muster). | Generator-lastig. Riskant neben unserem Brandbook — er würde eigene Paletten und Schriften vorschlagen. |

**Wichtig in jedem Fall:** Der Projekt-Skill `/portal-design` bleibt die Autorität für Aussehen, Tokens und Formensprache. Ein externer Skill liefert die **Checkliste** für den Durchgang, nicht den Geschmack. Bei Widerspruch gewinnt das Brandbook.

Quellen: [Snyk — Top Claude Skills for UI/UX Engineers](https://snyk.io/articles/top-claude-skills-ui-ux-engineers/) · [Superdesign — Design Skills Reviewed](https://superdesign.dev/blog/design-skills-reviewed) · [Claude Code Marketplaces — Design & UI/UX](https://claudemarketplaces.com/skills/category/design-ui)

---

# Teil 3 (Konrad, 14.09.2026) — Seite „Eure Daten" (vormals Stammdaten)

Umgesetzt in **F12**. Konrads Leitsatz dazu, er gilt über diese Seite hinaus: *„Denke bitte immer so, wie ein Kunde, der draufschaut."*

| Nr. | Ist | Soll | Stand |
|---|---|---|---|
| **F12.1** | „Stammdaten" | „Eure Daten" | gebaut |
| **F12.2** | Schritte nur über „Weiter" erreichbar; Beschreibung und Logo nicht anklickbar | Schritte **anklickbar**; Formular erscheint beim ersten Einloggen | gebaut |
| **F12.3** | „Aus HubSpot vorbelegt" — ein internes System im Kundentext | „Das haben wir für euch eingetragen. Stimmt etwas nicht, ändert es einfach hier." | gebaut |
| **F12.4** | Logo-Upload als nacktes Dateifeld, man erkennt nicht, wo hochgeladen wird | Upload als klar gekennzeichneter Knopf | gebaut |
| **F12.5** | Schritt „Rechnung"; darin die Wahl des Pass-Typs | „Rechnungsdaten"; Pass-Typ raus — das ist ein **interner** Status je Partner | gebaut |
| **F12.6** | Kontakte stehen doppelt: unter „Eure Daten" und als eigener Menüpunkt | nur unter „Kontakte" | gebaut |

## Offene Punkte aus Teil 3

1. **Pass-Typ je Partner festlegen (F12.5).** Er ist aus der Partneransicht entfernt, aber noch **nirgends** im Admin pflegbar — das Feld `org_edition.pass_type_choice` existiert weiter und wird jetzt von niemandem mehr gesetzt. Konrads Vorschlag: „bestenfalls sogar schon in HubSpot". Braucht eine Entscheidung: Feld im Partner-Admin, Zuordnung über HubSpot beim Abgleich, oder beides. **Bis dahin ist die Funktion tot.**
2. **„Verpflichtend" (F12.2), Umfang.** Umgesetzt ist: wer die Startseite des Partner-Portals öffnet und noch im Status `invited` steht, landet im Formular. Die übrigen Seiten bleiben erreichbar — eine Sperre, aus der man nicht herauskommt, wäre keine Führung, sondern eine Falle. Falls Konrad wirklich alles sperren will, ist das eine eigene Entscheidung.
