# Runbook Produktabgleich (Portal → HubSpot und SevDesk)

Der Produktstamm hat genau einen Eigentümer: das Portal. HubSpot und SevDesk bekommen ihn geschrieben, nie umgekehrt. Ausgelöst wird der Abgleich **von Hand** im Admin unter *Partner → Integrationen*; es gibt keinen Nachtlauf.

**Erst Trockenlauf, dann scharf.** Der scharfe Knopf bleibt zu, bis ein Trockenlauf gelaufen ist, und fragt danach noch einmal nach — mit der Liste der Artikel, die neu angelegt würden. Konrad, 21.09.2026: *vor jedem Anlegen in SevDesk wird gesprochen.* Technisch schreibt nur ein ausdrückliches `{"dryRun": false}`; alles andere (fehlendes Feld, Tippfehler im Namen, `"false"` als Text) bleibt Trockenlauf — geprüft in `tests/produktabgleich.test.ts`.

## Wie Dubletten verhindert werden

Je Artikel in dieser Reihenfolge:

1. **Gemerkter Fremdschlüssel** (`external_ref`, System `hubspot` bzw. `sevdesk`, `object_type = 'product'`) — dann wird geändert.
2. **Suche über die Artikelnummer**: SevDesk `GET /Part?partNumber=<SKU>`, HubSpot `POST /crm/v3/objects/products/search` auf `hs_sku`. Ein Treffer wird geändert und der Schlüssel gemerkt.
3. Erst wenn beides leer bleibt, wird angelegt.

Die SevDesk-Suche ist **exakt, kein Präfix** — `partNumber=I-42` findet `I-42738` nicht (geprüft 21.09.2026 am echten Stamm). Der Schutz steht und fällt also damit, dass unsere SKU und die Artikelnummer drüben **zeichengleich** sind. Wo sie das nicht ist, entsteht eine Dublette, und der Trockenlauf zeigt es vorher: der fragliche Artikel steht dann in der Liste „wären neu", obwohl es ihn drüben gibt.

## Stand 21.09.2026 — Bestandsaufnahme vor dem ersten Lauf

Nur lesend gemessen (`GET /Part`, HubSpot-Produktliste), nichts geschrieben.

| | SevDesk | HubSpot |
|---|---|---|
| Artikel drüben | 125 | nicht lesbar (403) |
| davon ohne Artikelnummer | **0** | — |
| Nummern doppelt vergeben | **0** | — |
| Artikel, die wir schicken würden | 162 | 86 |
| davon drüben schon vorhanden ⇒ **Änderung** | **110** | — |
| davon **neu** | **52** | — |
| Nummern drüben ohne Gegenstück bei uns | 15 (`A-1003` … `A-1007` u. a.) | — |

Gelesen: Der Bestand in SevDesk ist sauber gepflegt — jede Nummer einmal, keine leer. Die 110 Treffer werden aktualisiert, nicht verdoppelt. Die 15 fremden Nummern fasst der Abgleich nicht an; er schreibt nur, was bei uns steht.

**HubSpot kann derzeit nicht abgeglichen werden.** Der private App-Schlüssel hat kein Produkt-Recht: sowohl `GET /crm/v3/objects/products` als auch die Produktsuche antworten mit **403 „hasn't been granted all required scopes"**. Der Abgleich würde bei jedem Artikel in den Fehlerzweig laufen. Zu tun: in HubSpot unter *Einstellungen → Integrationen → Private Apps* die Rechte `e-commerce` (bzw. `crm.objects.products.read` **und** `crm.objects.products.write`) ergänzen; der Schlüsselwert bleibt derselbe.

## Ablauf

1. *Partner → Integrationen → Produktabgleich → **Trockenlauf***. Ergebnis je System: wie viele wären neu, wie viele stehen schon drüben, wie viele Fehler — und die neuen namentlich.
2. Die Liste durchsehen. Steht dort ein Artikel, den es drüben längst gibt, stimmt die Artikelnummer nicht überein: erst drüben korrigieren oder den Fremdschlüssel setzen, dann erneut.
3. Mit Konrad sprechen (Vorgabe 21.09.2026), dann ***Jetzt abgleichen*** und im Bestätigungsdialog die Liste noch einmal lesen.
4. Läufe stehen in `integration.sync_job` (`product_sync_preview` bzw. `product_sync`), Fehler je Artikel in `integration.sync_error`, der Auslöser im Audit-Log.

## Was der Abgleich nie tut

* **Löschen.** Ein inaktives Produkt bekommt in SevDesk `status = 50` („nicht mehr im Angebot"); die Zeile bleibt stehen, weil Belege daran hängen.
* **Zurücklesen.** Was jemand drüben am Artikel ändert, ist beim nächsten Lauf wieder überschrieben.
* **Barter anfassen.** Die Initiativen-Leistungen (`INI-%`) gehen in kein Fremdsystem: Posten mit Preis 0 wären in einem Rechnungssystem eine Einladung, sie versehentlich zu berechnen.
* **Messeshop-Artikel nach HubSpot bringen.** SevDesk bekommt den vollständigen Stamm (Buchhaltung), HubSpot nur die Vertriebsartikel (`source_hubspot`) — Nachtrag zu A4.3, Konrad 21.09.2026.
