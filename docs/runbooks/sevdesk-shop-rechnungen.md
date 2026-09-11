# Runbook SevDesk-Rechnungsentwürfe aus dem Messeshop (Welle 3 A10)

Nach dem Summit legt das Partner-Team im Admin (B9) je Partner **einen Rechnungsentwurf** (SevDesk-Status 100) aus allen abgeschlossenen Shop-Bestellungen an. Die Datenbank liefert die Kandidaten (`shop_invoice_candidates`), der SevDesk-Aufruf liegt in `lib/sevdesk/*`, die Referenz je Bestellung landet in `external_ref` (`record_shop_invoice`) — ein zweiter Lauf legt nichts doppelt an. Nur Shop-Rechnungen (Entscheidung 5); Paket-Rechnungen laufen weiter HubSpot → SevDesk.

## Ablauf
1. Route `POST /api/admin/sevdesk/shop-invoices` mit `{ "editionId": "<uuid>", "dryRun": true }` (Gate: Admin-Bereich **und** `is_partner_team()`). `dryRun` ist Standard und zeigt je Org Bestellungen und Nettosumme, ohne SevDesk anzufassen.
2. Mit `"dryRun": false`: je Kandidat Kontakt sicherstellen (vorhandene `organization.sevdesk_contact_id`, sonst `POST /Contact` + Rechnungsadresse + Rechnungs-E-Mail und `set_org_sevdesk_contact`), dann `Invoice/Factory/saveInvoice` mit Status 100, Positionen je SKU (Netto, USt-Satz aus der Bestellzeile, Einheit im Positionstext), Kopftext mit PO-Nummer und Bestellnummern, Lieferdatum = Editionsende. Danach `record_shop_invoice` (Referenz `<Rechnungs-ID>#<Bestellnummer>` je Bestellung, `meta.invoice_id`).
3. `orgId` im Body begrenzt den Lauf auf eine Organisation (z. B. Wiederholung nach Fehler). Fehler stehen im Ergebnis und in `integration.sync_error` (`object_type shop_invoice`), der Lauf in `integration.sync_job` (`sevdesk/shop_invoices`).

## Einrichtung und Vorbehalte
- `SEVDESK_API_TOKEN` (gesetzt). Optional `SEVDESK_CONTACT_PERSON_ID` (SevUser als Ansprechpartner; sonst der erste Nutzer des Kontos) und `SEVDESK_COST_CENTRE_ID` (Kostenstelle FLS27; ohne Angabe keine).
- Feste SevDesk-IDs in `lib/sevdesk/mapping.ts`: Kontakt-Kategorie 3 (Kunde), Adress-Kategorie 47 (Rechnungsadresse), CommunicationWayKey 8 (Rechnungsadresse), StaticCountry 1 (Deutschland; andere Länder per Lookup), Unity 1 (Stück), TaxRule 1 (umsatzsteuerpflichtig). **Beim ersten echten Lauf gegenlesen** — dazu mit `orgId` eine einzelne Test-Org anlegen lassen, den Entwurf in SevDesk prüfen und bei Abweichung löschen (Status 100 ist löschbar).
- Erlöskonto je Produkt (E3/E4) hängt in SevDesk an der Steuerregel; eine Aufteilung nach Erlöskonten kommt, wenn die Buchhaltung sie braucht (dann über `external_ref` je Produkt).

## Team-Sicht
- `shop_invoice_candidates(edition)`: offene Kandidaten mit Positionen und Summen. `shop_invoice_refs(edition)`: erzeugte Entwürfe je Bestellung. Beides nur `area_lead_partner`/Admin.
