# Bericht der Build-Session — Durchlaufpaket Welle 4 (Abschnitt E)

Stand 14.09.2026. Für die Architektur-Session bei ihrer Rückkehr. Aufbau nach dem Auftrag: PRs mit Merge-Commit · angewendete Migrationen mit Server-Version und Testdatei · Abweichungen · offene Fragen · Funde außerhalb des eigenen Bausteins.

---

## 1. PRs

### Gemergt (in der Pause, nach grünem Gate und Walkthrough)

| PR | Merge | Inhalt |
| --- | --- | --- |
| [#21](https://github.com/ChefTreff/talentpool/pull/21) | `7f23b2d` | Welle 4 PR 1 — Volunteers (A1 + B1 + B2), Migrationen 0065–0070 |
| [#22](https://github.com/ChefTreff/talentpool/pull/22) | `063ba18` | Welle 4 PR 2 — Volunteer-Admin (B3) |
| [#23](https://github.com/ChefTreff/talentpool/pull/23) | `0f8437c` | F5 — Testdaten für Konrad in allen Bereichen, Löschskript, „Kontakt zuordnen" sichtbar |
| [#24](https://github.com/ChefTreff/talentpool/pull/24) | `85edf58` | Welle 4 PR 3 — vivenu-Ticket-Ingest, Migrationen 0071–0073 |
| [#25](https://github.com/ChefTreff/talentpool/pull/25) | `79d8725` | Security-Zusammenfassung der Pause-Migrationen 0067–0073 |
| [#26](https://github.com/ChefTreff/talentpool/pull/26) | `25084e1` | Nachträge zum Ingest, Migrationen 0075–0078 |
| [#28](https://github.com/ChefTreff/talentpool/pull/28) | `07b4cec` | vivenu-Sandbox-Lauf, Migrationen 0079–0081 |

### Offen — warten auf Review und auf das Anwenden der Migrationen

Die fünf offenen PRs bauen aufeinander auf. **#29 ist die Basis**, die anderen vier sind darauf abgezweigt.

| PR | Branch | Inhalt | Migration |
| --- | --- | --- | --- |
| [#29](https://github.com/ChefTreff/talentpool/pull/29) | `welle-4/f1-bereichsshell` | **F1 + F2 + F3** — Bereichs-Shell, Admin nach Portalen, Programm als Tabelle | — |
| [#30](https://github.com/ChefTreff/talentpool/pull/30) | `welle-4/produktion` | **PR 25** — Regie, Stand-Checkliste, Bestellungen | 0082 |
| [#31](https://github.com/ChefTreff/talentpool/pull/31) | `welle-4/wiki` | **PR 26** — Wissensbasis mit Overlay je Edition | 0083 |
| [#32](https://github.com/ChefTreff/talentpool/pull/32) | `welle-4/volunteer-tickets` | **PR 27** — Coupon je Volunteer | 0084 |
| [#33](https://github.com/ChefTreff/talentpool/pull/33) | `welle-4/hackathon` | **PR 28** — Challenges, Teams, Einreichung, Judging | 0085 |
| [#34](https://github.com/ChefTreff/talentpool/pull/34) | `welle-4/f7-design` | **F7** — Design-Durchgang | — |
| [#35](https://github.com/ChefTreff/talentpool/pull/35) | `fix/migrationsnamen` | Nachtrag: zwei Dateinamen auf die Server-Version | — |

**Nicht gebaut:** PR 24 Check-in (A2 + B4) steht als Einziges aus der Reihenfolge noch aus — es kam die Feedback-Runde 1 dazwischen, deren Querschnitts-Auftrag F vorgezogen wurde (F1–F3 vor PR 25–28, so in `docs/feedback-runde-1-2026-09-11.md` festgelegt). Der Check-in setzt auf `ticket.barcode` auf; der ist seit dem Sandbox-Lauf belegt gefüllt.

---

## 2. Angewendete Migrationen

Alle in der Pause selbst angewendet, Smoke-Test grün gegen Frankfurt, Datei auf die Server-Version umbenannt.

| Nr. | Server-Version | Name | Testdatei |
| --- | --- | --- | --- |
| 0067 | `20260911171724` | `v4_volunteer_role_end` | `supabase/tests/v4_volunteers.sql` |
| 0068 | `20260911172632` | `v4_volunteer_days_of_edition` | `v4_volunteers.sql` |
| 0069 | `20260911173005` | `v4_volunteer_days_rpc` | `v4_volunteers.sql` |
| 0070 | `20260911181257` | `v4_volunteer_lead_scope` | `v4_volunteer_lead.sql` |
| 0071 | `20260911183019` | `v4_vivenu_ticket_ingest` | `v4_vivenu_ingest.sql` |
| 0072 | `20260911183236` | `v4_ticket_secret_own_table` | `v4_vivenu_ingest.sql` |
| 0073 | `20260911184227` | `v4_vivenu_status_mapping` | `v4_vivenu_ingest.sql` |
| 0075 | `20260911190442` | `v4_vivenu_ingest_order_and_types` | `v4_vivenu_ingest.sql` |
| 0076 | `20260911190528` | `v4_ticket_type_id_and_backfill` | `v4_vivenu_ingest.sql` |
| 0077 | `20260911190628` | `v4_ingest_personalization_default` | `v4_vivenu_ingest.sql` |
| 0078 | `20260911190746` | `v4_ingest_not_null_defaults` | `v4_vivenu_ingest.sql` |
| 0079 | `20260912082615` | `v4_allocation_undershop_usage` | `v4_allocation_undershop_usage.sql` |
| 0080 | `20260912083355` | `v4_personalized_flag` | `v4_personalized_flag.sql` |
| 0081 | `20260912083857` | `v4_ticket_status_from_enum` | `v4_ticket_status_from_enum.sql` |

**0074 (`20260911185048`, `v4_ticket_column_grants`) hat die Architektur-Session angewendet**, nicht ich — es waren Grants an einer fremden Tabelle, also ausdrücklich Pausen-Tabu. Ich habe sie als Vorschlag unter `supabase/migrations/vorschlag/` abgelegt und die Sicherheitsfrage in den PR geschrieben.

### Noch nicht angewendet (liegen als Datei im jeweiligen PR)

| Nr. | Datei | Testdatei | PR |
| --- | --- | --- | --- |
| 0082 | `20260913235900_v4_produktion.sql` | `v4_produktion.sql` (10 Prüfungen) | #30 |
| 0083 | `20260913235901_v4_wissensbasis.sql` | `v4_wissensbasis.sql` (13 Prüfungen) | #31 |
| 0084 | `20260913235902_v4_volunteer_tickets.sql` | `v4_volunteer_tickets.sql` (10 Prüfungen) | #32 |
| 0085 | `20260914235900_v4_hackathon.sql` | `v4_hackathon.sql` (12 Prüfungen) | #33 |

Alle vier sind in `begin … rollback` gegen Frankfurt gelaufen und grün. Sie tragen Platzhalter-Zeitstempel und müssen beim Anwenden umbenannt werden. **Die Walkthroughs zu #30–#33 fehlen** — die RPCs gibt es erst danach; ich ziehe sie nach.

---

## 3. Abweichungen

Sechs, alle in den jeweiligen PRs begründet.

1. **`regie_cue` hängt an Bühne × Tag statt je Slot** (0082). Der Auftrag sagt „je Slot"; die Vorlage aus 2026 zeigt, dass die Hälfte der Zeilen keinen Slot hat — Soundcheck, DOORS OPEN, Einlass, Puffer, Countdown-Video. Ein Ablaufplan, der nur Sessions kennt, wäre am Veranstaltungstag unbrauchbar. `slot_id` ist optional; ist es gesetzt, zieht die Ansicht Titel, Format und Speaker aus der Session.
2. **`hack_team_member` statt `hack_team.members[]`** (0085). Eine Mitgliedschaft wird angelegt, verlassen, und die Rechteprüfung muss sie einzeln lesen können. Nebeneffekt: „eine Person, ein Team je Edition" wird ein Constraint statt einer Absprache.
3. **Das Teilnehmer-Portal zählt nur, wenn es der einzige Bereich ist** (F1). Sonst stünde über jedem Fachbereich „Talent | Speaker" — jede angemeldete Person hat es ja. Konrads Entscheidung vom 13.09. Der **Zugang** zu `/profil` bleibt unberührt.
4. **Drei neue Typo-Rollen** (F7): `.ct-small`, `.ct-display`, `.ct-wordmark`. Der Skill sagt „keine neue Schriftgröße"; die Alternative waren 25 rohe Werte in Seiten. Es sind dieselben Größen in anderer Rolle, keine neue Stufe.
5. **Vier Judging-Kriterien als feste Formularfelder** statt einer Wiederholgruppe (0085) — die `deliverable`-Engine kennt keine. Eine Wiederholgruppe wäre eine Erweiterung der Engine, kein Sonderweg im Hackathon.
6. **Der Hackathon-Zeitplan kommt aus `programme_public`** statt aus einem eigenen Modell. Der Hackathon ist im Datenmodell ein Event der Edition mit Bühnen und Slots; eine zweite Tabelle hätte dieselben Felder noch einmal gehabt und wäre irgendwann anders gefüllt gewesen. Konrads Antwort vom 14.09.

---

## 4. Offene Fragen

| # | Frage | Wo |
| --- | --- | --- |
| 1 | „Verantwortliche" in der Programm-Tabelle: Bühnen-Lead (ableitbar) oder eine Person je Session (neues Feld `session.owner_person_id`)? | #29 |
| 2 | Highlight-Wort der Startseite: `accent-soft` wie jetzt, Akzentfläche mit weißem Text, oder Highlight-Pink als neuer Token? | #34 |
| 3 | Bewerbungs-Übersicht ist nicht funktional (Feedback-Runde 1, Punkt 7) — gemeinsamer Termin mit Konrad steht aus | F6 |
| 4 | Notion-Export des Volunteer-Wikis fehlt; ohne ihn kein Trockenlauf des Import-Skripts | #31 |
| 5 | `HACKATHON_DISCORD_URL` fehlt — Discord wird in einigen Wochen aufgesetzt, steht auf der Abschluss-Checkliste | #33 |

Beantwortet und umgesetzt: Teilnehmer-Pass entfällt · `maxAmountPerOrder` bleibt das Gesamtkontingent · manuell aktivierte Tickettypen bleiben stehen · `startup`/`investor` bis zur Produktion offen · Einstieg für Team nach Admin.

---

## 5. Funde außerhalb des eigenen Bausteins

Was mir aufgefallen ist, ohne dass es zum jeweiligen Baustein gehörte.

**Sicherheit**

- **Ticket-Secrets im Webhook-Protokoll.** `ticket.secret` und `transaction.secret` stehen im Klartext im vivenu-Payload und landeten damit in `integration.webhook_event`. Die Tabelle ist nur für `service_role` lesbar, aber wir hatten die Codes in 0072 bewusst nach `ticket_secret` ausgelagert. `redactSecrets()` nimmt sie jetzt heraus, **nachdem** die Signatur gegen den unveränderten Raw-Body geprüft wurde; die sechs gespeicherten Payloads sind bereinigt. Wirksam mit dem Merge von #28 — erledigt.
- **Coupons galten für alle Events des Kontos.** `allowAllEvents` und `allowAllTickets` stehen bei vivenu per Vorgabe auf `true`. Ein Partner-Coupon hätte 100 % auf jedem Event des Verkäuferkontos gegeben. Beide Schalter stehen jetzt ausdrücklich auf `false` — erledigt in #28.
- **Signaturformat war offen.** Die Prüfung ließ hex **und** base64 zu, solange unklar war, was kommt. An sechs echten Webhooks gemessen: immer hex. Die zweite Form ist raus — eine zweite zugelassene Form ist eine zweite Tür.

**Datenmodell**

- **`event_day` hat einen SELECT-Grant für `authenticated`, aber keine RLS-Policy.** Direkt gelesen kommt nichts zurück. Ich habe mir mit der eigenen RPC `volunteer_days()` geholfen (0069), weil fremde Policies in der Pause tabu waren. Die Ursache steht noch: entweder Policy ergänzen oder den Grant entfernen — so ist es eine Falle für die nächste Seite, die `event_day` direkt liest.
- **`role_assignment_valid_chk` verlangt `valid_to > valid_from`.** Eine Rolle in derselben Transaktion zu beenden geht deshalb nur mit `delete`, nicht mit `valid_to = now()`. Steht seit 0067 in `docs/db-konventionen.md`.
- **NOT-NULL-Spalten mit Default** werden von einem ausdrücklichen NULL im INSERT ausgehebelt. Hat mich bei 0077/0078 zwei Runden gekostet; Lehre steht in den Konventionen.
- **`org_product.qty` ist `numeric(10,2)`, nicht `integer`.** Eine `RETURNS TABLE`-Spalte mit dem falschen Typ scheitert erst beim Aufruf (42804), also im Betrieb. Vom Smoke-Test zu 0082 gefangen.

**vivenu**

- **`/api/openapi.json` liefert das vollständige Schema** (456 Pfade). Dreizehn Feldnamen im Code waren falsch — darunter der Coupon-Endpunkt, die Verknüpfung der Undershop-Tickets und die Form von `appliedDiscountInfo`. Die Tabelle steht in `docs/runbooks/vivenu-kontingente.md`. **Bei jeder offenen Frage zur vivenu-API zuerst dorthin**, nicht in die Doku.
- **Ein Undershop bietet von sich aus alle Tickettypen des Events an.** Im Partner-Shop stand der Speaker Pass zu 50 €. Nur eine ausdrücklich inaktive Zeile blendet ihn aus.

**Design**

- **Die Typo-Rollen standen außerhalb jeder Cascade-Layer** und schlugen damit jede Tailwind-Utility. Auf der Navy-Seitenleiste wäre Hilfstext dunkel und unlesbar geblieben. Behoben in F7.
- **Das Hexagon im Leerzustand gehört zu Education**, nicht zu Events. Behoben in F7.

**Prozess**

- **Zwei Migrationsdateien trugen nicht die Server-Version** (0080, 0081). Aufgefallen beim Schreiben dieses Berichts, behoben in #35. Ein falscher Name fällt im Betrieb nicht auf — bis jemand die Migrationen der Reihe nach neu einspielt.

---

## 6. Was die Smoke-Tests gefunden haben, bevor etwas lief

Der Teil des Verfahrens, der sich am deutlichsten ausgezahlt hat. Fünf Fehler, alle vor dem Anwenden:

| Fund | Folge im Betrieb |
| --- | --- |
| `appliedDiscountInfo` ist ein Objekt an der Transaktion, kein Array am Ticket | `used_count` wäre nie über 0 gestiegen; Partner hätten unbegrenzt Tickets ziehen können |
| `INVALID` war auf `blocked` statt `cancelled` gemappt | ein stornierter Platz hätte das Kontingent für immer belegt |
| Overlay-Bedingung mit drittem Oder-Zweig | das Wiki hätte den Treffpunkt des Vorjahres angezeigt |
| Teamgröße 8 nur beim Beitritt über den Code geprüft | Teams wären über jeden anderen Weg beliebig gewachsen |
| `org_product.qty` als `integer` deklariert | Stand-Checkliste wäre beim ersten Aufruf mit 42804 gescheitert |

---

## 7. Bitte prüfen

1. **Die vier offenen Migrationen anwenden** (0082–0085), Dateien umbenennen, dann sage ich Bescheid und fahre die Walkthroughs zu #30–#33.
2. **Die vierzehn in der Pause angewendeten Migrationen rückwirkend prüfen** — so im Auftrag vorgesehen. Besonders: 0072 (Ticket-Secret in eigener Tabelle), 0079 (Undershop als Schlüssel für `used_count`), 0081 (Status-Zuordnung).
3. **`event_day`: Grant ohne Policy** — Ursache schließen.
4. **Reihenfolge der offenen PRs:** #29 zuerst, dann #30–#34 in beliebiger Reihenfolge, #35 unabhängig.
