# Runbook · Luma-Anbindung für Community-Events (TAL-007/008)

Stand: 24.09.2026 · Talent-Chat · Entscheidung **D12: Hybrid über die Luma-API** (Luma Plus aktiv)

## Zielbild (D12)
- Die Seite **Events** im Teilnehmer-Portal liest den Luma-Kalender (kommende, nicht private Events).
- **Anmeldung aus dem Portal** per API mit den Profildaten (Name, E-Mail) — kein zweites Formular.
- Der **öffentlich teilbare Link** bleibt die Luma-Event-Seite (Reichweite, Lead-Kanal).
- **Gäste und Teilnahmen** laufen per API zurück ins Profil (Historie, Segmentierung).
- **Bestätigung und Erinnerung am Vortag** verschickt Luma selbst.
- Eigene Event-Verwaltung erst nach dem Summit.

## Baustufen
1. **Adapter mit Trockenlauf und Fixtures** (dieser Stand): `lib/luma/` — `core.ts` (Client, testbar), `client.ts` (Server-Einstieg mit Schlüssel), `mapping.ts` (reine Abbildung), `types.ts`. Tests: `tests/luma.test.ts` mit `tests/fixtures/luma/*.json`. Probe gegen den echten Kalender: `scripts/luma-probe.mjs` (nur lesend).
2. **Events-Seite und Anmeldung** (TAL-007): `/events` (Liste) und `/events/[id]` (Event-Seite), Knopf „Mit meinem Profil anmelden" → `addGuests({ live: true })`, danach `luma_sync_event` + `luma_sync_registration` (Migrationsvorschlag `v6_luma_events`: `event` mit `format_tag = community`, `external_ref` system `luma`, `registration` mit `source = luma`). Schreibt erst mit `LUMA_WRITE_ENABLED=true`; nur Events aus `LUMA_CALENDAR_ID`.
3. **Rücklauf und Admin-Sicht** (TAL-007/008): Cron `/api/cron/luma-sync` (stündlich, `vercel.json`) gleicht Events der letzten 60 Tage und alle kommenden ab, je Event die Gäste → `luma_sync_event` / `luma_sync_registration` (`lib/luma/sync.ts`, idempotent, nur `LUMA_CALENDAR_ID`). **Schreibt erst mit `LUMA_WRITE_ENABLED=true`**, vorher Trockenlauf mit Zählern. Protokoll in `integration.sync_job` (system `luma`, job_type `luma.guests`). Admin `/admin/community-events` (Abschnitt `communityEvents`: Talent-Leitung, Talent-Team, Marketing): Events mit Zählern, je Event die Teilnehmenden mit Name und Status — keine Kontaktdaten (Migrationsvorschlag `v6_community_events_admin`).

## API (gelesen am 24.09.2026 aus `https://public-api.luma.com/openapi.json`)
| Zweck | Aufruf |
|---|---|
| Schlüssel prüfen | `GET /v1/users/get-self` |
| Kalender | `GET /v1/calendars/get` |
| Kommende Events | `GET /v1/calendars/events/list?after=…&sort_column=start_at` (Blättern: `pagination_cursor`, `pagination_limit`; Antwort `entries`, `has_more`, `next_cursor`) |
| Ein Event | `GET /v1/events/get?event_id=evt-…` |
| Gäste | `GET /v1/events/guests/list?event_id=…`; einzeln `GET /v1/events/guests/get?event_id=…&id=<gst-…|E-Mail>` |
| Anmelden | `POST /v1/events/guests/add` `{ event_id, guests: [{ email, name }], send_email }` — läuft im Hintergrund; `skipped` nennt abgemeldete, entfernte oder blockierende Personen |

- Kopf: `x-luma-api-key`. Der Schlüssel gehört zu **einem** Kalender.
- Rate-Limit: 200 Anfragen/Minute je Kalender; bei 429 eine Minute Sperre mit `Retry-After`. Der Client wiederholt nur 429 und 5xx.
- **Webhooks** (`guest.registered`, `guest.updated`, `event.updated` …) liefern beim Anlegen ein `secret`, das **Signaturverfahren ist in der Doku nicht beschrieben**. Bis es geklärt ist (Luma-Support), läuft der Rücklauf per Abruf, nicht per Webhook — ein Webhook ohne prüfbare Signatur widerspräche AGENTS.md („Webhook-Signaturen + Idempotenz").

## Zugang
`LUMA_API_KEY` (sensibel) und `LUMA_CALENDAR_ID` (Konfiguration), siehe `docs/zugangs-liste.md`. Konrad setzt beide mit `sh scripts/env-set.sh`.

## Probe 25.09.2026
`403 /v1/users/get-self` — „Your calendar must have an active Luma Plus plan to make API requests.“ Der Schlüssel wird erkannt, der zugehörige Kalender hat aber kein aktives Luma Plus (oder der Schlüssel stammt aus einem anderen Kalender). Konrad prüft Plus auf `cal-B49jJXx8bsvPDo0` und erzeugt den Schlüssel dort neu; `LUMA_WRITE_ENABLED` bleibt aus.

## Erster echter Lauf
```bash
node --env-file=.env.local scripts/luma-probe.mjs
```
Erwartet: „Schlüssel ok", die Kalender-Id wie `LUMA_CALENDAR_ID`, die nächsten Events mit Gästezahl, „Nichts geschrieben."

## Datenschutz
- Luma ist Auftragsverarbeiter (AVV prüfen, Checkliste). Übertragen werden bei der Anmeldung nur Name und E-Mail der angemeldeten Person, auf ihren Klick.
- Zurück ins Profil kommen nur Status, Zeitpunkt und Check-in — keine Antworten auf Luma-Zusatzfragen, keine Telefonnummern.
