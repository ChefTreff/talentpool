# Sandbox-Lauf vivenu, 12.09.2026

Dev-Event `6aa450d647fa1075ce6c7c74` („DEV Future Leader Summit 2027"), Verkäufer `6a72ec8d33ceafcb2e8bcf2d`, Shop `https://cheftreff-idbu.vivenushop.dev`, `VIVENU_SANDBOX=true`. Ziel: die vier Schritte aus dem Arbeitsauftrag und ein Abgleich der tatsächlichen Feldnamen gegen `lib/vivenu`.

Die Feldnamen stehen in `vivenu-kontingente.md` (Tabelle „Feldnamen"), damit sie dort nachgeschlagen werden, wo gearbeitet wird. Hier steht, **wie** sie gefunden wurden und was dabei schiefging.

## Die wichtigste Erkenntnis: `/api/openapi.json`

Die Sandbox liefert unter `https://vivenu.dev/api/openapi.json` das vollständige Schema (456 Pfade). Vorher hatten wir 14 Pfade geraten, um den Coupon-Endpunkt zu finden. **Bei jeder offenen Frage zur vivenu-API zuerst dort nachsehen**, nicht in der Doku und erst recht nicht durch Probieren.

Was das Schema sofort geklärt hat und die Doku nicht: der Coupon liegt unter `/api/coupon` (Einzahl), `underShops[].tickets[]` braucht `baseTicket`, der Ticket-Status kennt genau fünf Werte, Freitickets laufen über `/api/tickets/free`.

## Schritt 1 — `ticket_type_map`

Konrads Tickettypen: `Teilnehmer Pass` ⇒ `talent`, `Partner Pass` ⇒ `partner`, `Speaker Pass` ⇒ `speaker`.

**Offen:** „Teilnehmer Pass" auf `talent` ist eine Annahme. Wenn der Pass für alle Gäste gilt und `talent` für die Talent-Schiene reserviert bleiben soll, gehört er auf `professional` — eine Zeile in `ticket_type_map`, keine Codeänderung.

Für `startup` und `investor` gibt es im Dev-Event keinen Tickettyp. Das Kontingent „TEST — Partner / investor" steht deshalb auf `error` mit `keine Tickettypen für Pass-Typ investor in ticket_type_map`. Das ist die gewollte Bremse, kein Fehler im Lauf.

## Schritt 2 — Kontingent-Sync

Fünf Anläufe, jeder an einem anderen Feld gescheitert; alle Funde sind in den Kommentaren von `lib/vivenu/allocations.ts` und `lib/vivenu/client.ts` festgehalten:

1. `POST /coupons` ⇒ 404 (richtig ist `/coupon`).
2. `PUT /coupon/{id}` ohne `name` ⇒ 400. Der PUT **ersetzt** den Coupon; jeder Aufruf schickt jetzt den vollen Satz.
3. `discountValue: 100` ⇒ der Warenkorb zeigte „−10000.00 %". Der Wert ist ein Anteil: `1` = 100 %.
4. Undershop-Tickets über `_id` verknüpft ⇒ vivenu nimmt die Id an, sie zeigt aber auf nichts. Richtig ist `baseTicket`; `_id` ist die eigene Zeilen-Id. Sichtbar wurde es erst, als Konrad einen Tickettyp anlegte und vivenu ihn von selbst in jeden Undershop schrieb.
5. Ohne `maxAmount`, `maxAmountPerOrder` und `sellStart`/`sellEnd` am Undershop war der Shop für die Kasse nicht im Verkauf (`POST /checkout`: „Shop is not on sale"), obwohl er im Browser normal aussah.

Dazu zwei Funde, die nichts mit Feldnamen zu tun haben:

- **Ein Undershop bietet von sich aus alle Tickettypen des Events an.** Im Partner-Shop stand der Speaker Pass zu 50 €. `availabilityMode: "contingentsOnly"` ändert das nicht; nur eine ausdrücklich inaktive Zeile blendet den Typ aus. Der Sync setzt sie jetzt für jeden fremden Typ.
- **Der Sync formte den Shop aus den offenen Kontingenten.** Stand nur eine Zeile einer Org offen, räumte der Lauf den Shop leer — `maxAmount 0`, alle Typen inaktiv. Genau so passiert, behoben mit Migration 0079 (`ticket_allocations_of_orgs`).

Ergebnis: zwei Partner-Undershops mit den richtigen Typen, Mengen und Links, vier Coupons mit `allowAllEvents: false` / `allowAllTickets: false`.

## Schritt 3 — Ticket-Ingest

Testkauf über `FLS27-TESTDATEN-PART-A1B2C3` im Shop „FLS27 · Testdaten Partner", 1 × Partner Pass zu 0,00 €, Buchung `6aa50a9cf132f85d574c4862`.

Fünf Webhooks kamen an (`customer.created`, `transaction.complete`, `checkout.detailsSubmitted`, `checkout.completed`, `ticket.created`), alle mit gültiger Signatur, alle **hex**. Base64 und das `sha256=`-Präfix sind aus `lib/vivenu/signature.ts` entfernt — eine zweite zugelassene Form ist eine zweite Tür.

Das Ticket landete mit `pass_type = partner`, Barcode und Status `valid`; `used_count` des Kontingents steht auf 1 von 4.

Personalisierung über `POST /tickets/personalize/{id}/{secret}` kam als `ticket.updated` zurück — mit `personalized: true` und **ohne** `personalizationStatus`. Ohne Migration 0080 wäre das Ticket bei uns auf `pending` stehen geblieben.

**Sicherheit:** Der Ticket-Code steht im Klartext im Webhook-Payload (`ticket.secret`, `transaction.secret`). `integration.webhook_event` ist zwar nur für `service_role` lesbar, aber wir haben die Codes in 0072 bewusst nach `ticket_secret` ausgelagert — im Protokoll haben sie nichts zu suchen. `redactSecrets()` nimmt sie jetzt heraus, bevor der Payload gespeichert wird; die Signaturprüfung läuft vorher und gegen den unveränderten Raw-Body. Die sechs bereits gespeicherten Payloads wurden nachträglich bereinigt. **Wirksam wird das erst mit dem Merge** — der Webhook zeigt auf die Produktion.

## Schritt 4 — Freiticket

`POST /api/tickets/free` mit `sendMail: false` legte Ticket `6aa50eff2e5d05d20993e67c` an (`ZZTEST Freiticket`, Teilnehmer Pass); `ticket.created` kam an, `pass_type = talent`.

`POST /api/tickets/{id}/invalidate` setzte den Status auf `INVALID`. Der kam bei uns als `blocked` an — nach der Zuordnung aus 0073. Das war falsch: `invalidate` **ist** der Storno, und als `blocked` hätte der Platz das Partner-Kontingent weiter belegt. Migration 0081 zieht die Zuordnung auf die echte Aufzählung nach und zählt nur noch, was einen Platz wirklich belegt.

## Aufgeräumt

Entfernt: vier `ZZTEST`-Tickettypen, Undershop `ZZTEST Undershop Partner`, Zugangsliste `ZZTEST Zugangsliste`, die zugehörigen `ticket_type_map`-Zeilen.

Geblieben (Absicht): Konrads drei Tickettypen, seine Kategorien und „Konrads geheimer Shop" unangetastet; die beiden Partner-Undershops der Testdaten; das gekaufte Partner-Ticket (`ZZTEST Sandboxlauf`) als Beleg für `used_count 1/4`; das stornierte Freiticket als Beleg für den Storno-Weg. Beide Tickets hängen an den Testdaten-Partnern und verschwinden mit ihnen (`scripts/testdaten-konrad.mjs --remove`).

## Werkzeug

`node --env-file=.env.local scripts/vivenu-sandbox-lauf.mjs <schritt>`

| Schritt | Was er tut |
| --- | --- |
| `event` | Event, Tickettypen und Undershops mit allen Feldnamen zeigen |
| `typen [--apply]` | `ticket_type_map` vorschlagen, nachziehen, tote Zeilen entfernen |
| `shops` | Undershops mit Links und Coupons lesen |
| `personalisieren <ticketId>` | Personalisierung wie im Portal (Secret bleibt verborgen) |
| `freiticket` | Freiticket ohne Mailversand anlegen |
| `storno <ticketId>` | Ticket entwerten |

Alles, was das Skript anlegt, trägt den Präfix `ZZTEST` und wird danach entfernt. Aus dem Dev-Event wird nichts gelöscht, was Konrad angelegt hat.
