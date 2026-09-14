# F4 · Abgleich Speaker- und Partner-Portal gegen den Altbestand

**Auftrag:** Feedback-Runde 1, Punkt 4 — „zuerst exakt der Umfang der bestehenden Portale, erst danach Neues". Funktion für Funktion: vorhanden / anders / fehlt.

**Stand:** 14.09.2026 · Build-Session · Grundlage sind `docs/legacy-inventar.md` §13 (Walkthrough der Alt-Portale vom 08.09.) und §14 (Wiki/Chatbot) sowie `docs/feedback-fls26.md`.

**Wie geprüft:** Nicht am Quelltext, sondern am Gerenderten. Anmeldung als Konrad über einen Magic-Link, dann alle 17 Seiten beider Portale abgerufen und den sichtbaren Text mit dem Inventar verglichen. Wo die Testdaten eine Funktion nicht auslösen (Konrad hat keine Session, keine Bühne, keine Bewerbungen), steht das ausdrücklich dabei — dann ist die Zeile ein Codebefund, kein Sichtbefund.

**Regel für diese Liste:** Sie benennt Lücken, sie schließt keine. Nichts daraus wird gebaut, bevor Konrad entschieden hat, was davon FLS27 wirklich braucht.

---

## 1 · Speaker-Portal

Alt: `speaker.chef-treff.de` (SoftR, englisch), 7 Seiten. Neu: `/speaker`, 7 Seiten.

| Alte Funktion | Neu | Status |
|---|---|---|
| Welcome: Begrüßung, Event-Info, Navigationskarten | `/speaker` mit „Das ist als Nächstes dran" | **anders** — statt Kacheln eine Aufgabenliste mit Fortschritt. Fachlich mehr. |
| Welcome: Support-Team mit Namen, **privater Gmail-Adresse und Handynummer** der Speaker-Buddy | Rollen-Postfach | **anders, mit Absicht** — private Kontaktdaten von Freelancern gehören nicht ins Portal (AGENTS, Datenschutz). |
| Onboarding: eigener Datensatz bearbeiten (Name, Mail, Job-Titel, Organisation, Sprache, LinkedIn, Beschreibung) | `/speaker/profil` | **vorhanden**, mit mehr Feldern (Pronomen, Titel, Telefon, Kurz-/Langbio je Sprache, Tech-Rider). |
| Onboarding: „falls jemand das Formular für dich ausfüllt" | Assistenz-Rolle (`assistant_person_id`, `is_assistant`) | **vorhanden**, strukturiert statt als Hinweistext. |
| Onboarding: **Additional Contact** (Vor-/Nachname, Mail, Telefon, Kontaktart z. B. Agentur) | Assistenz (eine Person, ohne Kontaktart und Telefon) | **anders** — wer eine Agentur **und** eine Assistenz hat, kann heute nur eine von beiden hinterlegen. |
| Onboarding: **Speaker Reception, Anmeldung** (Luma-Einbettung) | `reception_eligible` als Kennzeichen, das die Speaker-Leitung setzt | **fehlt** — die Speakerin sieht die Reception nicht und kann sich nicht anmelden. |
| Travel: FAQ Anreise (Auto / ÖPNV) | `/speaker/travel`, fester Text | **vorhanden**, ohne Aufklapper. |
| Travel: VIP-Hotelbuchung | `/speaker/travel`, Angebote mit Kontingent („Frei: 39 von 40") | **vorhanden**, besser — Kontingent und Einwilligung statt Formular. |
| Travel: Shuttle-Buchung, statusabhängig | dito über `hospitality_options` | **vorhanden**. |
| Tickets: eigenes Speaker-Ticket | `/speaker/tickets` | **vorhanden**. |
| Tickets: **Begleitticket** (eine kostenlose Begleitung per Mail-Eingabe) | Formular mit Vor-/Nachname und Mail | **vorhanden**, strukturiert statt Freitext-Mail. |
| Tickets: Speaker Counter & Area | Text auf `/speaker/travel` | **vorhanden**, an anderer Stelle. |
| Your Session: Inhalte einreichen (Titel, Beschreibung, Themen, Sprache) | `/speaker/session` | **vorhanden** (Codebefund: `approve_session_content` / `reject_session_content`; am Testkonto nicht sichtbar, weil Konrad keiner Session zugeordnet ist). |
| Your Session: zwei Fassungen sichtbar, „eingereicht" und „final" | Freigabe-Lauf mit Überschreibungen | **vorhanden** (Codebefund, s. o.) — ob beide Fassungen **nebeneinander** stehen, konnte ich nicht sehen. |
| Your Session: Slot, Bühne, Hallenplan | Slot und Bühne aus `slot`/`stage` | **teilweise** — der **Hallenplan fehlt** (auch partnerseitig, s. u.). |
| Your Session: Präsentation hochladen, Frist, Überschreiben, Vorschau | `my_speaker_assets` + `presentation_window` | **vorhanden**. |
| **Media Kit & Stage Photos** | — | **fehlt ganz.** Keine Seite, keine Tabelle, kein Feld: weder Bühnenfotos (~48 h nach dem Talk), noch die persönliche Speaker-Grafik als PNG, noch das Media Kit. |
| Help & Support: Wiki | `/speaker/wiki` | **vorhanden**, mit Zielgruppen und Editions-Overlay — deutlich mehr als das Notion-Embed. |
| Help & Support: **Chatbot „Chefi"** | — | **fehlt** (siehe Abschnitt 3). |
| — | Profilfoto hochladen | **offene Baustelle**, im Portal selbst benannt: „Der Upload wird gerade gebaut. Bis dahin schick uns dein Foto ans Speaker-Postfach." Ein Mail-Rückfall, den wir eigentlich abschaffen wollten. |
| — | `/speaker/reisekosten` | **neu** — gab es im Alt-Portal nicht. |

## 2 · Partner-Portal

Alt: `partnerhub.chef-treff.de` (SoftR, deutsch), 10 Seiten, plus `partner.chef-treff.de` (WooCommerce-Shop). Neu: `/partner`, 10 Seiten mit Messeshop darin.

| Alte Funktion | Neu | Status |
|---|---|---|
| Home: Begrüßung, Event-Info, Kacheln | `/partner` mit Fortschritt, Fristen, gebuchten Leistungen | **anders**, fachlich mehr — die Fristen kommen aus `deadline` statt aus festen Countdown-Blöcken. |
| Onboarding: Unternehmensinfos (Logo, Beschreibung, Aktivierung) | `/partner/onboarding`, vierstufig | **vorhanden**. |
| Onboarding: Tabelle „Eure Ansprechpartner" | `/partner/kontakte` mit Rollen und Zugang | **vorhanden**, und genau die Zusammenlegung, die das Feedback verlangt hat: **eine** Personenliste statt zwei (Kontakte hier, Event-App-Leute dort). |
| Tickets: Shop-Zugang mit Codes, Anleitung, Frist | `/partner/tickets` mit Kontingent je Pass-Typ, Codes, Einlöse-Stand, Frist | **vorhanden**, deutlich mehr. |
| Tickets: „mehr Tickets → Mail an Konrad" | — | **fehlt** — bewusst kein Mail-Rückfall, aber es gibt auch keinen Anfrage-Weg im Portal. Heute bleibt nur: Partner schreibt irgendwem. |
| **Event App**: Formular „Team-Mitglieder hinzufügen" | — | **fehlt.** Der Swapcard-Abgleich existiert (`event_app_exhibitors`, Admin-Seite „Integrationen"), aber **nur als Team-Werkzeug**. Der Partner kann seine App-Leute nicht selbst pflegen. |
| **Event App**: Checkliste Aussteller-Profil, Lead-Scanning, offene Stellen | — | **fehlt.** |
| Messestand: Tabelle **Standardausstattung** je Paket (was im gebuchten Paket enthalten ist) | „Gebuchte Leistungen" zeigt *was* gebucht wurde, nicht *was drin ist* | **teilweise** — der Partner sieht „Standbühne (18 qm) × 5", aber nicht „4 m Rückwand, 2 Stehtische, 4 Barhocker, Teppich, Strom, Licht, Reinigung". |
| Messestand: **Rückwand-Upload** mit Frist und Sperre | Pflicht `backdrop_print` in `/partner/checkliste`, an das Produkt gebunden, mit Frist und Versionen | **vorhanden**, besser. |
| Messestand: **Hallenplan** | — | **fehlt** (auch speakerseitig). |
| Messeshop (WooCommerce, eigener Login) | `/partner/shop` mit Kategorien, Phasen, Fristen | **vorhanden**, im selben Login — die sieben Kategorien stimmen mit dem Altkatalog überein. |
| Messeshop: **„Auf Anfrage"-Produkte** (0,00 € im Katalog, Mail an Konrad) | — | **noch offen** — im Inventar als Anfrage-Flow vorgesehen (S1–S5), im Portal nicht gesehen. |
| Messeshop: eigene Bestellhistorie | Bestellungen im Shop-Bereich | **vorhanden** (am Testkonto nur teilweise auslösbar). |
| Hackathon: Linkseite | eigener Bereich `/hackathon` + Pflicht `hackathon_challenge` | **anders**, mehr. Kein Link aus dem Partner-Menü — wer beides hat, wechselt über den Umschalter. |
| Media Kit / Partnergrafik | — | **fehlt** (wie speakerseitig). |
| Alle Dateien (`/filehub`): „Angebot, Rechnungen, weitere Dateien" | `/partner/dateien` zeigt **eigene Uploads** | **teilweise** — Angebote und Rechnungen aus SevDesk stehen dem Partner nicht zur Verfügung. Die SevDesk-Anbindung gibt es, aber nur Richtung Rechnungsentwurf. |
| FAQ & Wiki: Notion-Embed mit Kategorie-Filter | `/partner/wiki` | **vorhanden**, besser (Zielgruppen, Overlay je Edition). |
| FAQ & Wiki: **Chatbot „Chefi"** | — | **fehlt** (Abschnitt 3). |
| — | `/partner/bewerber`, `/partner/buehne` | **neu** — gab es im Alt-Portal nicht. |

## 3 · Beide Portale: der Chatbot

`docs/legacy-inventar.md` §14 hält als Anforderung fest: *„Wikis + Chatbots gibt es wieder — je einzeln für Speaker, Partner und Teilnehmer, jeweils mit eigenem Wiki."* Die Wikis stehen (Migration 0083, Zielgruppen und Overlay je Edition). **Die Chatbots gibt es nicht**, und es gibt auch keinen Platz dafür im Plan.

Das ist die größte einzelne Lücke gegenüber dem Altbestand, und sie ist keine Kleinigkeit: „Chefi" war im Alt-Portal auf beiden Hubs der erste Anlaufpunkt. Zugleich ist es die Lücke, die am wenigsten nach „nachbauen" ruft — das Wiki ist jetzt sauber strukturiert und wäre eine gute Grundlage, aber ob ein Bot daraus entsteht, ist eine Produkt- und Kostenentscheidung, keine Bauaufgabe.

## 4 · Wo der Altbestand bewusst nicht nachgebaut wurde

Diese Punkte sind **keine** Lücken, sondern Entscheidungen — hier nur, damit niemand sie später für Versehen hält:

- **Drei Logins → einer.** Partner Hub, Speaker Hub und Messeshop waren getrennte Konten; jetzt ein Login mit Bereichen (Antwort 45).
- **Feste Countdown-Blöcke → `deadline` je Edition.** Kein Datum mehr im Fließtext.
- **Mail-Rückfälle** („Updates per Mail an Konrad", „mehr Tickets → Konrad") wurden absichtlich nicht übernommen. Bei den Tickets fehlt dadurch aber ein Weg (siehe Tabelle).
- **Private Kontaktdaten** von Freelancern im Portal: entfällt.
- **Speaker-Artikel für Partner sichtbar** (alt: keine Zielgruppentrennung): jetzt getrennt.

## 5 · Lückenliste, nach Gewicht

Vorschlag zur Reihenfolge; **nichts davon wird ohne Konrads Entscheidung gebaut.**

1. **Media Kit / Bühnenfotos / Speaker-Grafik** (beide Portale). Fehlt vollständig. Speakerseitig war das im Alt-Portal ein Grund, überhaupt hineinzugehen — die Bühnenfotos nach dem Talk sind das, was Speaker weitererzählen.
2. **Event-App-Selbstpflege für Partner.** Ohne sie macht das Team die Team-Mitglieder von Hand, obwohl der Swapcard-Weg schon steht. Das ist Arbeit, die wir uns sonst zurückholen.
3. **Leistungsumfang je Paket** („was ist in meinen 18 qm drin"). Kleine Anzeige, spart erfahrungsgemäß viele Rückfragen.
4. **Hallenplan** (Partner und Speaker). Braucht eine Datei vom Standbau, keine Logik.
5. **Anfrage-Weg für mehr Tickets** und **Anfrage-Produkte im Shop**. Beides ersetzt heute eine Mail, die niemand mehr schreiben soll.
6. **Angebote und Rechnungen im Partner-Dateibereich** (SevDesk). Anbindung existiert, Leserichtung fehlt.
7. **Speaker-Reception: Anmeldung.** Heute nur ein Kennzeichen im Backend.
8. **Profilfoto-Upload für Speaker.** Steht als Baustelle im Portal und zeigt dort selbst auf ein Postfach.
9. **Agentur als eigener Kontakt** neben der Assistenz.
10. **Chatbots.** Eigene Entscheidung, siehe Abschnitt 3.

## 6 · Was dieser Abgleich nicht leisten konnte

- **Die Alt-Portale laufen noch, ich habe sie aber nicht erneut aufgerufen.** Grundlage ist der dokumentierte Walkthrough vom 08.09. Wenn dort etwas fehlt, fehlt es auch hier — vor allem bei den Seiten, die im Inventar als „Inhaltsblock beim Lesen leer/nicht geladen" vermerkt sind (`/filehub`, nutzerbezogene Listen).
- **Drei Funktionen waren mit Konrads Testdaten nicht auslösbar:** Session-Inhalte (keine Session zugeordnet), Standbühne (keine Bühne), Bewerber (keine Formate). Die betreffenden Zeilen sind Codebefunde und mit „am Testkonto nicht sichtbar" gekennzeichnet.
- **Der Messeshop-Katalog wurde nicht Produkt für Produkt verglichen.** Die sieben Kategorien stimmen; ob alle ~80 Artikel übernommen sind, entscheidet die Migration, nicht dieser Abgleich.
