# Konzepte TAL-009 · TAL-010 · TAL-011 — Vorschlag an Konrad

Stand: 25.09.2026 · Talent-Chat · Runde 26.09. · **Vorschlag vor dem Bau** — Konrad 25.09.: alle drei vor dem 01.11.
Bitte je Frage (§4) kurz antworten; danach ein PR je Punkt, Migrationen als Vorschlag mit Test.

Leitbild (TAL, 24.09.): Portal = Front-End des Talent-CRM, **ein Profil**, Tool-Wildwuchs beenden, Datenbank als Marketing-Grundlage.

---

## TAL-009 · „Worüber möchtest du informiert werden?“ (`/benachrichtigungen`)

**Heute:** eine einzige Werbe-Einwilligung `newsletter` (versioniert, im Profil änderbar seit TAL-013). ActiveCampaign (AC) ist im Masterplan vorgesehen (Segmente/Tags aus, Opt-in/Abmeldung ein, täglich), aber **noch nicht angebunden**.

**Vorschlag**
- Seite im Home-Bereich mit **Themen-Kacheln zum An- und Abwählen**, Vorschlag: *Summit*, *Community-Events*, *Masterclasses & Company Tours*, *Bootcamp & Academy*, *Jobs & Karriere bei Partnern*, *Hackathon*. Die Liste ist ein Vokabular (`notification_topic`), das Team pflegt sie im Admin (Vokabularpflege) — kein Code je neuem Thema.
- **Rechtsgrundlage bleibt `newsletter`:** Themen sind eine *Einschränkung* der Einwilligung, keine eigene. Ohne `newsletter` sind alle Themen aus und die Seite sagt, dass man zuerst zustimmen muss (ein Klick, versioniert). Abwählen aller Themen = Widerruf von `newsletter` (das ist ehrlicher als „angemeldet, aber nichts gewählt“).
- Kanal und Frequenz (C5 aus TAL-013) **nur E-Mail**, Frequenz nicht einzeln — erst wenn AC es tatsächlich steuert. WhatsApp bleibt aus (C4 nein).
- Speicherung: `person_interest` mit Vokabular `notification_topic` (Fremdschlüssel und Löschen beim Profil-Löschen gibt es schon).
- **Weg nach AC:** je Thema ein AC-Tag bzw. eine Liste; Übertragung im täglichen AC-Sync (Masterplan) — **dieser Sync ist ein eigener Baustein** (AC-Adapter, Schlüssel `ACTIVECAMPAIGN_API_KEY`, Abmeldungen zurück in `consent_record`). Bis dahin: Admin-Export (CSV über `lib/csv.ts`) je Thema mit nur anschreibbaren Personen.

**Admin-Weg:** `/admin/…` Abschnitt „Benachrichtigungen“: Zähler je Thema (gesamt / anschreibbar), CSV-Export; Themen über die Vokabularpflege.

**Aufwand:** M (Seite, Vokabular, Export) · AC-Sync: M–L separat.

---

## TAL-010 · Event-Fotos (`/fotos`)

**Heute:** Fotos liegen in Drive. Für Speaker gibt es das Muster schon: `session_asset` Art `stage_photo`, `my_session_photos()`, signierte Ansicht/Download (`/speaker/media`).

**Vorschlag**
- **Galerie je Event**, sichtbar für Personen, die **teilgenommen** haben: Summit = Ticket der Edition mit Status `checked_in` (oder `valid`, falls der Check-in-Status fehlt — Frage 5); Community-Event = `registration` mit Status `attended` (kommt aus dem Luma-Abgleich) bzw. `confirmed`.
- **Kein Drive-Zugriff aus dem Portal.** Das Team lädt eine **Auswahl** (nicht alle Rohbilder) in einen privaten Bucket `event-photos` hoch — Admin-Upload mehrerer Dateien je Event mit Credit. Grund: Drive-Freigaben an Hunderte Teilnehmende sind nicht steuerbar, und das Dienstkonto (D13) hat bewusst nur Schreibrecht auf den Technik-Ordner.
- Tabelle `event_photo` (event_id, storage_path, credit, sort, published); Lesen über eine Definer-Funktion mit der Teilnahme-Prüfung, Ausliefern über signierte Adressen (wie TAL-001).
- Datenschutz: nur Fotos, für die die Einwilligung `photo_video` bzw. die Hausordnung der Veranstaltung gilt; **Entfernen auf Wunsch** (Knopf „Ich möchte ein Foto entfernen lassen“ → Meldung ans Team, kein Selbstlöschen).

**Admin-Weg:** `/admin/fotos` (Marketing, Talent-Leitung): Event wählen, Dateien hochladen, veröffentlichen/zurückziehen, Löschwünsche sehen.

**Aufwand:** M.

---

## TAL-011 · Feedback-Fenster (`/feedback`)

**Vorschlag**
- Ein Formular: **Format** (Vokabular: Summit, Community-Event, Masterclass, Company Tour, Bootcamp, Portal, Sonstiges), **Art** (Idee / Lob / Kritik), **Text** (Pflicht, max. 2000 Zeichen), Schalter **„anonym senden“**.
- **Anonym heißt wirklich anonym:** keine `person_id`, kein Zeitstempel genauer als der Tag, keine IP — sonst ist es nur „pseudonym“ und das Versprechen falsch. Missbrauchsschutz über ein Tageslimit je Konto, das **getrennt** vom Feedback gezählt wird (nur Zähler, kein Bezug zum Text).
- Mit Klarnamen: `person_id` gesetzt, das Team kann antworten (Mail aus dem Admin; Vorlage `feedback_reply`).
- **Clustering:** das Format ist die erste Ordnung; dazu Freitext-Schlagworte durch das Team im Admin. Eine automatische Einordnung per KI (Anthropic-Schlüssel liegt für den Assistenten) ist möglich, **Vorschlag: später**, weil anonyme Texte sonst an einen Dritten gehen.

**Admin-Weg:** `/admin/feedback` (Talent-Leitung, Marketing): Liste nach Format/Art/Status, Schlagworte, Status offen/gesichtet/umgesetzt, Antwort bei Klarnamen, CSV-Export.

**Aufwand:** S–M.

---

## Reihenfolge (Vorschlag)
TAL-011 (klein, sofort nützlich für die Kampagne) → TAL-009 (Seite + Export; AC-Sync danach) → TAL-010 (braucht die Fotoauswahl vom Team).

## 4 · Fragen an dich
1. **TAL-009 Themenliste:** passen die sechs Themen, oder welche fehlen/fallen weg?
2. **TAL-009 Rechtsgrundlage:** einverstanden, dass Themen die `newsletter`-Einwilligung nur einschränken (keine eigene Einwilligung je Thema)?
3. **TAL-009 ActiveCampaign:** Sync als eigener Baustein vor dem 01.11. — und wer legt den AC-Schlüssel an (`sh scripts/env-set.sh ACTIVECAMPAIGN_API_KEY`)?
4. **TAL-010 Quelle:** lädt das Team eine Auswahl hoch (Empfehlung), oder soll das Portal einen Drive-Ordner je Event spiegeln?
5. **TAL-010 Teilnahme:** gilt beim Summit `checked_in` (Empfehlung) oder jedes gültige Ticket?
6. **TAL-011 anonym:** einverstanden mit „wirklich anonym“ (kein Rückschluss, keine Antwortmöglichkeit)?
7. **TAL-011 KI-Clustering:** später (Empfehlung) oder gleich?
