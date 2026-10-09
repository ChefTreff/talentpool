# Vorschlag: Ticket-Bestätigung und Personalisierung im Portal (TAL-019, Welle 1 B4)

Stand 09.10.2026, Talent-Chat, **zur Freigabe durch Plan, danach Fragen an Konrad**. Noch kein Bau. Anlass: Befund der QS-078-Prüfung — die Datenbankseite aus Welle 1 A2 ist live, die Seite nach dem vivenu-Redirect gibt es nicht. Der Prozessstart ist der 01.11. und der Ticketverkauf hängt daran.

Quellen: `docs/arbeitsauftrag-welle-1.md` (A2, A3, B4), `docs/masterplan.md` (Ergänzung v0.1a, Ticket-Journey), `docs/vivenu-antworten-2026-09-11.md` (Antworten 09.09./11.09. und Nachtrag 06.10.), `supabase/snapshot/functions/` (Stand heute), Code unter `lib/vivenu/` und `app/`.

## 1 · Bestandsaufnahme

| Baustein (Arbeitsauftrag) | Stand | Beleg |
|---|---|---|
| Webhook `ticket.created/updated/deleted` → Ticket je vivenu-Ticket | **vorhanden** | `app/api/webhooks/vivenu/route.ts`, `ingest_vivenu_ticket` (Upsert je `vivenu_ticket_id`, schreibt `buyer_email`, `holder_email`, `vivenu_transaction_id`, Status, `extra_fields`, Secret in `ticket_secret`) |
| Nächtlicher Sweep, Ticket-Liste je Event | **vorhanden** | `lib/vivenu/client.ts` `listTickets` |
| Personalisierung in der Datenbank | **vorhanden** | `personalize_ticket(ticket, Vorname, Nachname, Firma, Position, für mich, Inhaber-E-Mail)`: Berechtigung über `person_id`, `buyer_email` **oder** `holder_email`; Status `partial`/`complete`; Audit `ticket.personalize` |
| Status-Abbildung vivenu → portal (`pending/partial/complete`) | **vorhanden** | `vivenu_personalization_status` (`DETAILSREQUIRED` = pending) |
| Ticket-Secret für das Rückschreiben | **vorhanden**, nur service_role | `ticket_secret` (keine Grants) |
| Ticket-Ansicht der eigenen Tickets | **vorhanden** | `/tickets` (TAL-015), `my_tickets()` — **nur Tickets mit `person_id = ich`** |
| Seite `/tickets/bestaetigung` | **fehlt** | in `app/` nicht vorhanden; nur der Pfad steht in `proxy.ts` als öffentlich (`PUBLIC_PATHS`) |
| Login-Gate mit Rücksprung | **fehlt** | `requireUser(nextPath)` gibt es, die Seite nicht |
| Tickets **einer Transaktion** laden | **fehlt** | `my_tickets()` kennt keine Transaktion und keine Tickets, die für andere gekauft wurden (`person_id` ist dort leer). Eine Lese-Funktion nach `buyer_email = Auth-E-Mail` (A2) gibt es nicht |
| Rückschreiben nach vivenu | **fehlt** | `personalize_ticket` schreibt nur in unsere Datenbank; kein Aufruf von `POST /tickets/personalize/{id}/{secret}`; im Repo nur im Sandbox-Skript (`scripts/vivenu-sandbox-lauf.mjs`) |
| Extrafelder je Tickettyp (Firma, Position) | **fehlt** | siehe QS-078: der öffentliche Endpunkt `GET data fields by reference` liefert sie je Tickettyp; heute liest der Code nichts davon |
| Verknüpfung Ticket ↔ Person beim ersten Login (A3) | **fehlt** | `claim_or_create_person` verknüpft Konto und `person_email`, berührt Tickets nicht; der Ingest setzt `person_id` nur, wenn die Person **zum Zeitpunkt des Webhooks** schon existiert. Ein Käufer ohne Konto sieht sein Ticket nach dem Login nie unter „Meine Tickets“ |
| Finale Ticket-Mail für Teilnehmende (A2) | **fehlt** | `ticket_final_mail` gilt nur für Speaker-Tickets (Empfängerin ist die Speakerin, Weiche `queue_speaker_mail`); es gibt keine Teilnehmer-Fassung |
| Zustände pending / partial / complete in der Oberfläche | **teilweise** | Daten ja, Anzeige nur im Speaker-Portal und unter `/tickets` |
| Redirect-URL im vivenu-Shop (Custom Confirmation Page je Event) | **offen, Konrad** | Soll-Wert `https://portal.chef-treff.de/tickets/bestaetigung`; vivenu hängt `?transactionId=…` an (nicht `tx`, Archiv 10.09.) |

## 2 · Vorschlag für den Ablauf

1. **Kauf bei vivenu** → Redirect auf `/tickets/bestaetigung?transactionId=…`. Die Seite ist im Proxy öffentlich und bleibt es; sie prüft selbst.
2. **Login-Gate:** ohne Sitzung eine kurze Seite („Melde dich mit der E-Mail-Adresse an, mit der du gekauft hast“) und Link `/login?next=/tickets/bestaetigung?transactionId=…`. Die Transaktions-Id wird nirgends ausgegeben, solange niemand angemeldet ist.
3. **Tickets der Transaktion laden:** neue Lese-Funktion (Abschnitt 3), die nur Tickets liefert, deren `buyer_email` der Anmelde-Adresse gleicht. Andere Adresse → neutrale Meldung „Zu dieser Bestellung gehört eine andere E-Mail-Adresse“, ohne Angaben zur Bestellung.
4. **Webhook noch nicht da:** der Redirect kommt oft vor dem Webhook. Dann lädt eine Server-Aktion die Transaktion mit dem API-Schlüssel (`GET /transactions/{id}`, Tickets der Transaktion), prüft die Käufer-Adresse gegen die Anmelde-Adresse und schreibt sie **über denselben `ingest_vivenu_ticket`**. Kein zweiter Schreibweg, derselbe Upsert, idempotent.
5. **Je Ticket:** „Für mich“ (Vorname, Nachname vorbelegt aus dem Profil) oder „Für eine andere Person“ (dann Inhaber-E-Mail Pflicht), dazu Firma und Position — das Badge-Minimum aus dem Masterplan. „Vorerst überspringen“ ist möglich; das Ticket bleibt `pending`.
6. **Speichern:** Server-Aktion ruft `personalize_ticket` (Berechtigung wie bisher in der Datenbank) und schreibt **danach** mit dem Ticket-Secret `POST /tickets/personalize/{id}/{secret}` nach vivenu (`firstname`, `lastname`, `extraFields` mit den Slugs aus `data fields by reference` je Tickettyp). Das Secret verlässt den Server nie. Schlägt vivenu fehl (429 mit Wiederholung, sonst Fehler), bleibt der Stand im Portal gespeichert und das Ticket wird beim nächsten Sweep nachgezogen; die Oberfläche sagt „gespeichert, Übertragung folgt“.
7. **Danach:** Zustände pending / partial / complete je Ticket sichtbar, Next-Best-Actions (Profil → Programm → Interessen), Add-on-Hinweise (aus `ticket.addons`, nur Anzeige).
8. **Mail:** Vorschlag in Frage 1.

Die Seite zeigt nie Barcode oder Secret; den QR gibt es weiter unter `/tickets`.

## 3 · Datenmodell-Kurzfassung (keine neue Tabelle)

Eine Migration als Vorschlag mit Test, nach Freigabe; alles auf Basis von `supabase/snapshot/functions/`:

1. **`my_transaction_tickets(p_transaction_id text)`** — neu, `STABLE SECURITY DEFINER`, nur Lesen. Liefert die Tickets mit `vivenu_transaction_id = p_transaction_id` **und** (`buyer_email = auth.email()` oder `person_id = ich`): Ticket-Id, Tickettyp/Pass-Typ, Status, `personalization_status`, Vorname, Nachname, Firma, Position, Inhaber-E-Mail, `person_id = ich`?, `addons`. Kein Barcode, kein Secret. Fehler: 28000 ohne Anmeldung.
2. **`claim_or_create_person()` erweitert (A3)** — nach dem Verknüpfen/Anlegen: Tickets mit `holder_email = verifizierte Adresse` (und, wenn keine Inhaberin gesetzt ist, `buyer_email`) und leerem `person_id` der Person zuordnen. Nur bei bestätigter E-Mail. Die Rollenvergabe `talent` je Edition bleibt wie sie ist — **zu prüfen**, ob sie dort schon geschieht (im Snapshot nicht sichtbar).
3. **`personalize_ticket`** bleibt wie sie ist; ihre Prüfung (Käufer, Inhaber, Person) reicht. Eine Ergänzung wäre nur nötig, wenn „Für mich“ für den Käufer eines fremden Tickets verhindert werden soll — kein Bedarf bekannt.
4. **Server (kein SQL):** `getTransaction`/`personalizeInVivenu` in `lib/vivenu/` (Wiederholung bei 429 wie `backoff.ts`), `readDataFields(ticketTypeId)` (QS-078), Seite und Server-Aktionen unter `app/(talent)/…` bzw. eine eigene Route, da öffentlich und eigener Rahmen.
5. **Test:** SQL-Test `my_transaction_tickets` (fremde Adresse = 0 Zeilen, Käufer = alle Tickets, anderer Käufer kein Zugriff) und `claim` (Ticket wird nach Login verknüpft, nur bei bestätigter Adresse).

Audit: `ticket.personalize` besteht. Ohne Klartext-E-Mail ins Audit (Regel 02.10.).

**Admin-Weg:** Das Team sieht Tickets heute unter `/admin/speaker-tickets` und `/admin/volunteers/tickets`; für Teilnehmende gibt es keine Admin-Liste. Vorschlag: eine **Statuszahl** (pending/partial/complete je Edition) und die Liste „nicht personalisiert“ im Admin-Bereich Tickets/Technik, damit das Team vor dem Summit nachfassen kann — als eigener kleiner Baustein, nicht im ersten PR.

**Konrads Konto:** Testdaten-Schritt `ticket-bestaetigung` (nur `ZZTEST`): ein Ticket mit `buyer_email` = seine Adresse und Status `pending`, eines `partial`, eines `complete`. Es entsteht **keine** vivenu-Transaktion; das Rückschreiben prüft ein Sandbox-Lauf (Konrad oder Plan, `VIVENU_SANDBOX`).

## 4 · Reihenfolge und Aufwand

| Schritt | Inhalt | Umfang |
|---|---|---|
| 1 | Migration (`my_transaction_tickets`, `claim`-Erweiterung) + Test | klein |
| 2 | Seite, Login-Gate, Liste, Formular „Für mich / andere Person“, Zustände, Überspringen; Texte DE/EN | mittel |
| 3 | vivenu-Client: Transaktion laden, Rückschreiben, Datenfelder je Tickettyp; Sandbox-Lauf | mittel |
| 4 | Mail (nach Frage 1), Admin-Zahl, Testdaten-Schritt | klein bis mittel |

**Ein PR** für 1–3 (Migration enthalten), Mail und Admin-Zahl als zweiter. Die Seite **ohne** vivenu-Rückschreiben ist bereits nutzbar (Daten bleiben im Portal); das Rückschreiben darf hinter dem Flag `VIVENU_WRITE_ENABLED` liegen (wie Luma/ActiveCampaign), bis der Sandbox-Lauf grün ist.

## 5 · Fragen an Konrad

1. **Wer verschickt das Ticket?** (a) **vivenu** nach der Personalisierung: im Event „Tickets nicht versenden“, dann `send ticket per mail` mit der Inhaber-Adresse — wenig Bau, Wallet und QR kommen von vivenu. (b) **Wir** mit eigener Mail `ticket_final` (Teilnehmer-Fassung, QR = Barcode) — volle Gestaltung, mehr Bau. Empfehlung (a).
2. **Firma und Position:** vivenu kennt Vorname/Nachname am Ticket, Firma und Position nur als **Extra-Felder**. Legst du sie je Tickettyp im Event an (Slugs z. B. `company`, `position`), oder soll ich die vorhandenen Slugs aus dem Endpunkt lesen und du nennst mir die Namen? Ohne Extra-Felder gehen sie nur ins Portal, nicht auf das Badge.
3. **„Vorerst überspringen“:** Soll das Ticket gültig bleiben (Empfehlung) und eine Erinnerung nach X Tagen folgen (Mail-Vorlage, Cron), oder reicht der Hinweis im Portal?
4. **„Andere Person“:** Die Inhaberin bekommt das Ticket per Mail (Frage 1) und kann sich anmelden; beim ersten Login hängt das Ticket an ihrem Konto (A3). Reicht das, oder soll der Käufer die Inhaberin im Portal einladen können?
5. **Redirect-URL im Shop:** Wer trägt `https://portal.chef-treff.de/tickets/bestaetigung` je Event ein, und wann? Erst nach der Sandbox-Probe; für den Parallelbetrieb mit der vivenu-Maske in der Übergangsphase bleibt die vivenu-Seite wählbar.
6. **Add-on-Kacheln** (Hotel, DB, Locker): nur Anzeige der gekauften Add-ons oder schon Kauf-Links? Empfehlung: nur Anzeige.

## 6 · Was ich nicht anfasse

Keine Änderung an Webhook-Signatur, Kontingent-Lauf, Speaker-Ticket-Wegen (`set_ticket_issued`, `speaker_ticket_create`) und `ticket_final_mail` der Speaker. Kein Schreib-Lauf gegen vivenu und keine Migration von mir angewendet.
