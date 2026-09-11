# Security-Check: was die Build-Session in der Pause angewendet hat

**Stand 11.09.2026, abends.** Zusammenfassung für die Architektur-/Security-Session (Fable) nach der Pausenregel aus `docs/arbeitsauftrag-welle-4.md`, Abschnitt E. Alles hier ist **bereits auf `jqmqvgaiyjudkvtncijw` angewendet** und in `main` gemergt. Bitte rückwirkend prüfen.

Kurzfassung für den Einstieg: sieben Migrationen (0067–0073), davon **drei Korrekturen an eigenen Fehlern**, zwei davon sicherheitsrelevant. Die beiden wichtigsten Punkte stehen unter „Wo ich mich selbst korrigiert habe" — ein Ticket-Secret wäre für angemeldete Personen lesbar gewesen, und eine Rollenzuweisung endete nicht, wenn sie enden sollte.

## 1 · Angewendete Migrationen

| Nr. | Server-Version | Thema | Testdatei |
|---|---|---|---|
| 0067 | `20260911171724` | Volunteer-Rolle bei Absage sofort beenden | `v4_volunteers.sql` |
| 0068 | `20260911172632` | Eventtage gehören der Edition **und** ihren Events | `v4_volunteers.sql` |
| 0069 | `20260911173005` | `volunteer_days()` als Lese-RPC | `v4_volunteers.sql` |
| 0070 | `20260911181257` | Volunteer-Leads sehen keine Bewerbungen | `v4_volunteer_lead.sql` |
| 0071 | `20260911183019` | vivenu-Ticket-Ingest | `v4_vivenu_ingest.sql` |
| 0072 | `20260911183236` | Ticket-Secret raus aus `ticket` | `v4_vivenu_ingest.sql` |
| 0073 | `20260911184227` | vivenu-Statuswerte abbilden | `v4_vivenu_ingest.sql` |

0065 und 0066 hat die Architektur-Session selbst angewendet; sie stehen hier nur als Bezugspunkt.

Jede Migration endet mit `select harden_definer_functions();`. Kein Grant für `anon`. Alle neuen Tabellen mit RLS und ohne Grants, alle internen Helfer mit `revoke execute … from public, anon, authenticated`.

## 2 · Wo ich mich selbst korrigiert habe

### 2.1 Ticket-Secret wäre lesbar gewesen (0071 ⇒ 0072) — **der wichtigste Punkt**

0071 legte `ticket.secret` an: das vivenu-Ticket-Secret, mit dem sich ein Ticket bei vivenu personalisieren lässt. Ich hatte auf Spalten-Grants gesetzt. `ticket` hat aber einen **Tabellen**-Grant `select` für `authenticated`, und dagegen greift `revoke select (spalte)` nicht — genau der Fund aus 0032, der seit dem in `docs/db-konventionen.md` §5 steht und den ich beim Schreiben übersehen habe.

Wirksamkeit: `ticket_self_sel` grenzt die **Zeilen** auf eigene Tickets ein. Eine angemeldete Person hätte also das Secret **ihrer eigenen** Tickets lesen können — nicht fremde. Das ist kein Totalschaden, aber ein Secret, das eine Schreiboperation bei vivenu autorisiert, gehört nicht in eine Browser-Antwort.

Zeitfenster: rund drei Minuten zwischen 0071 und 0072, keine Zeile befüllt (0 von 4 Tickets), kein Deploy dazwischen.

0072: eigene Tabelle `ticket_secret` (RLS an, **keine Grants**, keine Policy), Schreiben nur über `set_ticket_secret()` (service_role), `ticket.secret` gedroppt. Im Smoke-Test verankert (`10_grants`).

**Bitte mitprüfen:** ob der Tabellen-Grant auf `ticket` selbst weg soll — siehe 4.1.

### 2.2 Rollenende wirkte nicht (0067)

`set_volunteer_status` beendete die Rolle `volunteer` bei Absage über `valid_to = greatest(now(), valid_from + interval '1 second')`. In derselben Transaktion steht `now()` still — die Endzeit lag damit immer in der Zukunft und die Rolle galt weiter. Das ist wörtlich die Falle aus `db-konventionen` §4 („in derselben Transaktion beenden über `delete`, nicht `valid_to = now()`").

0067 löscht stattdessen, und zwar nur die Zuweisung mit `note = 'auto:volunteer_accepted'` — eine von Hand vergebene Rolle bleibt stehen. Beide Fälle im Test (`19_abgesagt`: `rolle_aktiv=0 zeilen=0`, `19b_handrolle_bleibt`: `1`).

Derselbe Mechanismus steckt in `revoke_role` (Bestand, nicht von mir): dort wirkt der Entzug erst eine Sekunde nach `valid_from`. Im Alltag folgenlos, nachgemessen und in PR #20 dokumentiert.

### 2.3 Webhook wäre an einem Constraint gescheitert (0073)

`ingest_vivenu_ticket` schrieb `lower(status)` von vivenu direkt in `ticket.status` und `ticket.personalization_status`. Beide haben eigene Check-Constraints. vivenus `DETAILSREQUIRED` wäre mit 23514 abgebrochen — und weil vivenu bis zu siebenmal wiederholt und danach aufgibt, wäre das Ereignis am Ende verloren gewesen. Kein Sicherheitsloch, aber ein stiller Datenverlust.

0073 bildet ab (`vivenu_ticket_status`, `vivenu_personalization_status`); unbekannte Werte lassen den alten Wert stehen, statt abzubrechen.

## 3 · Sicherheitsgrenzen, die neu entstanden sind

### 3.1 Volunteer-Team eingeengt (0070)

Nach Entscheidung Konrads: `is_volunteer_team()` umfasst nur noch `admin` und `area_lead_volunteers`. `volunteer_lead` ist **raus** — damit greifen `volunteer_admin_overview`, `shift_plan`, `set_volunteer_status`, `upsert_shift`, `assign_shift` und `unassign_shift` für Schichtleads nicht mehr, auch nicht über die API.

Stattdessen `my_lead_shifts()`: die eigenen Schichten mit **Name und Stand** der Zugeteilten, sonst nichts. Keine Mailadresse, kein Geburtsdatum, nichts aus der Bewerbung; Warteliste und Absagen bleiben draußen; fremde Schichten ohnehin. Der Test prüft ausdrücklich, dass in der Antwort kein `@` vorkommt.

Die Funktion ist bewusst für `authenticated` ausführbar — sie grenzt sich selbst über `lead_person_id = current_person_id()` ein.

### 3.2 vivenu-Webhook

- Signatur über den **Raw-Body**, geprüft **vor** dem Parsen. Ohne Secret oder ohne Header: **Ablehnung**, kein Durchwinken (Test deckt beides ab).
- Idempotenz über die Webhook-Id in `integration.webhook_event`; vivenu versucht bis zu siebenmal.
- Verarbeitung zusätzlich idempotent: Upsert je vivenu-Ticket-Id, und Coupon-Einlösungen werden **neu gezählt** (`recount_allocation_usage`) statt hochgezählt.
- `service_role` erst nach der Signaturprüfung. `ingest_vivenu_ticket` lehnt jeden Aufruf mit `auth.uid() is not null` ab (42501).
- Personen werden **nicht** angelegt; die Zuordnung läuft über eine vorhandene Mailadresse.

### 3.3 Volunteers (0065–0070, Gesamtbild)

`volunteer_profile`, `shift`, `shift_assignment`: RLS an, **keine Grants** — gelesen und geschrieben wird ausschließlich über RPCs. Mindestalter 18 am ersten Eventtag wird serverseitig geprüft; die Bewerbung verlangt Einwilligung zu `terms` und `privacy`. Der CSV-Export im Admin enthält **kein** Geburtsdatum.

## 4 · Was ich nicht angefasst habe (Abschnitt E) — bitte entscheiden

### 4.1 `ticket`: Tabellen-Grant statt Spalten-Grants — **Vorschlag liegt bereit**

`authenticated` hat `grant select on ticket`. Damit liest jede angemeldete Person **alle** Spalten ihrer eigenen Tickets: `team_note` (interne Notiz des Teams), `meta`, `extra_fields`, Preise, alle vivenu-Kennungen.

Konrads Vorgabe vom 11.09.: „Die Person sollte eigentlich nichts von den eigenen Tickets sehen können, ausser den Code."

Vorschlag liegt als **nicht angewendete** Datei: `supabase/migrations/vorschlag/ticket-spalten-grants.sql` — Tabellen-Grant weg, stattdessen `select (id, event_id, person_id, status, barcode)`. Geprüft, was die Oberfläche wirklich direkt aus der Tabelle liest: genau eine Stelle (`app/(talent)/meine/page.tsx`, Ticketpflicht-Prüfung). Alles andere läuft über SECURITY-DEFINER-RPCs und ist von Grants unberührt.

### 4.2 `event_day`: toter Grant ohne Policy

`authenticated` hat `select` auf `event_day`, es gibt aber **keine** Policy — RLS verweigert damit jede Zeile. Der Bewerbungs-Wizard bekam eine leere Tagesliste. Ich habe den Grant nicht angefasst und lese über die eigene RPC `volunteer_days()` (0069). Zu klären: Grant weg (wie die Welle-1-Reste in 0063) oder Lese-Policy ergänzen.

### 4.3 `anon`-Grants auf `event`

Aus dem B9-Review noch offen: `anon` hat INSERT/SELECT/UPDATE auf allen Spalten von `event`, einschließlich `hubspot_pipeline_id`, `vivenu_event_id`, `swapcard_event_id`. Wirksam wird nichts, weil `event` nur `event_read_auth` für `authenticated` hat — aber eine später ergänzte `anon`-Policy würde die Kennungen sofort schreibbar machen.

## 5 · Offene Fragen (nummeriert, auch in Abschnitt D)

| Nr. | Frage |
|---|---|
| F1 | `event_day`: toter Grant entfernen oder Lese-Policy ergänzen? |
| F2 | Welche Edition ist „die laufende"? `volunteer_edition()` nimmt die nächste nicht abgelaufene nach Startdatum; bei zwei parallelen Editionen entscheidet das Datum. Reicht das, oder braucht es ein Kennzeichen „aktiv"? |
| F3 | Das Vokabular `volunteer_area` ist leer; ohne Eintrag lässt sich keine Schicht anlegen. Die Oberfläche erklärt das inzwischen. |
| F6 | `ticket`: Tabellen-Grant ersetzen — Vorschlag liegt (4.1). |
| F7 | vivenu-Signaturformat ist nur „laut Doku" bestätigt; die Prüfung nimmt Hex und Base64 und ein `sha256=`-Präfix. Nach dem ersten echten Webhook enge ich auf eine Variante ein. |
| F8 | vivenu schickt keinen Zeitstempel — Replay-Schutz kommt allein aus der Webhook-Id. Gibt es einen Zeitstempel-Header, nehme ich ihn dazu. |
| F9 | `ticket_type_map` ist für FLS27 leer; ohne Eintrag bekommt ein Ticket `pass_type = 'professional'` als Rückfall. |

## 6 · Testdaten und Wegwerf-Konten

Alle Walkthroughs liefen mit Wegwerf-Konten auf Resend-Testadressen, Rollen mit zwei Stunden Ablauf, danach gelöscht und nachgezählt. Nach jedem Lauf: 18 Personen, 12 Auth-Nutzer, keine Reste.

**Eine bewusste Abweichung:** Konrads eigenes Konto trägt seit F5 Testdaten in allen Bereichen (`scripts/testdaten-konrad.mjs`, Doku `docs/testdaten-konrad.md`). Gekennzeichnet über `role_assignment.note = 'testdaten:konrad'`, Namenspräfix `TEST — ` und interne Notizen; `--remove` räumt genau das weg. Konrad hat zugestimmt, dass das bis zum Go-live so bleibt und danach ein eigener Testzugang entsteht.

## 7 · Stand der PRs

| PR | Inhalt | Merge |
|---|---|---|
| #20 | Merch-Konfiguration (0064) | `a20c37c` |
| #21 | Volunteers A1 + B1 + B2 (0065–0069) | `7f23b2d` |
| #22 | Volunteer-Admin B3 (0070) | `063ba18` |
| #23 | F5 Testdaten für Konrad | `0f8437c` |
| #24 | vivenu-Ticket-Ingest (0071–0073) | `85edf58` |

Offen aus dem Durchlaufpaket: Check-in (A2 + B4), Produktion (A4 + B5), Wiki (A5 + B6), Volunteer-Tickets (A6), Hackathon (A3 + B7 + B8), dazu F1–F3 vor den PRs 25–28.
