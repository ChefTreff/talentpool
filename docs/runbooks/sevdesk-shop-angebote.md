# Runbook SevDesk-Angebote aus dem Messeshop (PART-116, K-81)

Partnerinnen und Partner erstellen im Warenkorb **„Angebot erstellen“**: der Warenkorb wird festgesetzt, in SevDesk entsteht ein Angebot (`orderType AN`), das Portal zeigt Nummer, Frist und PDF. Danach bestellen sie **verbindlich** zu den Preisen des Angebots oder **ziehen es zurück** und bearbeiten den Warenkorb wieder. Die Datenbank hält den Zustand (Teil 1, Migration `v6_shop_angebot`, live als 0291), SevDesk das Beleg-System, die Route verbindet beide (Teil 2).

## Schalter `SHOP_ANGEBOT_SEVDESK` — ohne Konrads Ja gibt es keinen Schreibzugriff auf SevDesk

| Wert | Organisation mit Kundennummer `ZZTEST…` (Testorganisation) | Alle anderen (echte Partner) |
|---|---|---|
| `aus` (**Standard**, auch ohne Variable) | **simuliert**: kein SevDesk-Aufruf, Nummer `AN-PROBE-0001`, in der Datenbank als Probe gekennzeichnet, kein PDF | „Angebot erstellen“ fehlt; die Oberfläche sagt, warum, und führt per Mailto zum Team |
| `probe` | Entwurf in SevDesk (Status 100, kein PDF, nicht festgeschrieben), danach **sofort wieder gelöscht**; der Beleg im Portal bleibt als Probe | wie `aus` |
| `live` | wie `probe` | echtes Angebot: festgeschrieben (`getPdf`), mit PDF; nur mit Kundennummer, deutscher Adresse und Token |

Setzen (kein Geheimnis): `sh scripts/env-set.sh SHOP_ANGEBOT_SEVDESK --config`, Wert `aus`, `probe` oder `live`; danach neu deployen. **Umstellen nur nach Konrads ausdrücklicher Freigabe** — `probe` legt in SevDesk einen **Testkontakt** an (Kundennummer `ZZTEST-ANGEBOT`, „TEST — Partner Angebot GmbH“; er bleibt dort stehen und wird von Hand gelöscht), `live` verschickt echte Angebote.

## Ablauf der Route (`POST /api/partner/shop/angebot`, Body `{ orderId }`)

Die Organisation und das Recht kommen aus der Sitzung und aus der Bestellung, nie aus dem Request. Code: `lib/sevdesk/angebot.ts` (Ablauf, ohne Netz testbar), `lib/sevdesk/angebot-server.ts` (Anbindung), `lib/sevdesk/client.ts` (SevDesk-Aufrufe).

1. **Sperren** — `shop_quote_begin` (Sitzungs-Client): prüft Recht, Zustand `draft`, Phase, Kundennummer, Land (Deutschland), Adresse und das Limit von **drei Angeboten je Bestellung**; setzt die Bestellung auf `quoted`, reserviert den Bestand, friert Preise und Positionen ein und liefert die Grundlage samt `lines_hash`.
2. **Weg wählen** (`wegWaehlen`): simuliert · SevDesk-Probe · SevDesk-live · nicht verfügbar (dann `shop_quote_abort` und Meldung „auf Anfrage“).
3. **SevDesk** (nur Probe und live): Kontakt über `organization.sevdesk_contact_id` oder die Kundennummer — **zwei Treffer brechen ab** (`quote_contact_ambiguous`, Eintrag im Protokoll, das Team klärt es), kein Treffer legt den Kontakt an; nächste Nummer (`getNextOrderNumber`, verbraucht keine); `Order/Factory/saveOrder` als Entwurf, Kopf- und Fußtext aus `angebot.ts` (Gültigkeit **30 Tage** steht im Fußtext, das Angebot trägt kein `validUntil`); live danach **festschreiben** (`getPdf` — der Abruf *ist* der Schritt „verbindlich“, deshalb nie in Probe).
4. **Eintragen** — `record_shop_quote` (nur `service_role`): Beleg, Nummer, Frist, Probe-Kennzeichen; ab da gilt das Angebot, die Frist setzt die Datenbank.
5. Antwort `{ ok: true, number, validUntil, probe }` oder `{ ok: false, error }` mit dem Schlüssel, den die Oberfläche unter `rpc.*` nachschlägt.

**Wenn etwas schiefgeht:** vor dem Beleg in SevDesk gibt `shop_quote_abort` den Warenkorb frei (ein vorhandener Entwurf wird gelöscht, sonst steht seine Nummer im Protokoll). Scheitert nur das Eintragen *nach* dem Festschreiben, steht in SevDesk ein Angebot ohne Referenz: `integration.sync_error` (`object_type shop_quote`, Nummer und SevDesk-Id im Payload), und `shop_quotes_housekeeping` gibt den Warenkorb nach **zehn Minuten** frei. Reißt die Verbindung des Browsers ab, kann das Angebot trotzdem entstanden sein — die Seite lädt danach neu und zeigt den Stand.

## Für Partner

- **PDF:** `GET /api/partner/shop/angebot/<Bestellung>/pdf` — Recht über `shop_quote_info`, das PDF kommt bei jedem Abruf frisch von SevDesk und wird bei uns **nicht abgelegt**. Nicht im Probebetrieb, nicht nach Rückzug oder Ablauf.
- **Zurückziehen:** „Warenkorb wieder bearbeiten“ (`shop_quote_withdraw`): zurück auf Entwurf, Bestand frei. **Das Angebot in SevDesk bleibt dort offen** und wird nicht gelöscht (Entscheidung Q3) — bei Bedarf in SevDesk schließen.
- **Ablauf:** nach 30 Tagen verfällt das Angebot; bis die Bereinigung läuft, bleibt der Warenkorb festgesetzt, und die Seite zeigt „abgelaufen“ mit dem Weg zurück. Bestellen kann man nur bis zum Ende der Bestellphase (`phase_closed`).
- **Kein Angebot möglich:** Mailto an `partner@chef-treff.de` mit Organisation, Kundennummer, Positionen und Summe vorbereitet.

## Team-Sicht (Admin-Vollständigkeit)

`/admin/partner/bestellungen`, Karte **„Offene Angebote“** (`shop_quotes_admin`): Organisation, Nummer, Frist, Netto, Probe-Kennzeichen, „wird erstellt“ und „abgelaufen“ in Worten; je Zeile **Zurückziehen** (`shop_quote_withdraw`) und **Bestellung stornieren** (`shop_admin_set_status … cancelled`, schließt den Beleg als `cancelled`). In der Bestellliste hat ein festgesetzter Warenkorb keinen frei wählbaren Stand und keine bearbeitbaren Positionen (`order_quoted`).

## Umstellung in Stufen

1. **`aus`** (heute): Testlauf mit `node --env-file=.env.local scripts/testdaten-konrad.mjs --apply --nur=angebot` — Konrads Test-Organisation „TEST — Partner Angebot“, Klickweg in der PR-Beschreibung.
2. **`probe`** — nach Konrads Ja: dieselbe Test-Organisation klickt „Angebot erstellen“; in SevDesk entsteht kurz ein Entwurf und verschwindet wieder. Danach prüfen: Testkontakt `ZZTEST-ANGEBOT` löschen; ob SevDesk die Nummer des gelöschten Entwurfs wieder vergibt oder im Nummernkreis eine Lücke bleibt (Buchhaltung informieren).
3. **`live`** — nach Konrads Ja und einem abgestimmten ersten Echtfall (Partner mit Kundennummer): Kopf- und Fußtext, Positionen, Adresse und PDF in SevDesk gegenlesen; Mapping-IDs (Einheit, Steuerregel, Land) stehen in `lib/sevdesk/mapping.ts`, wie beim Rechnungslauf (`sevdesk-shop-rechnungen.md`).

## Grenzen

- Nur Organisationen mit **Kundennummer** (HubSpot, ADM-057) und **deutscher Adresse** (Steuerregel 1); alle anderen fragen beim Team an.
- Nie automatisch: Angebote außerhalb des Shops, Angebote nach dem Zurückziehen schließen, Verknüpfung Angebot → Rechnung. Der Rechnungslauf nimmt weiter nur `completed`-Bestellungen (`sevdesk-shop-rechnungen.md`).
- Bei **mehr als einer** Bestellphase mit Angebot: je Organisation und Phase gibt es nur einen aktiven Warenkorb; ein Angebot der früheren Phase bleibt festgesetzt, bis es abläuft oder zurückgezogen wird.
