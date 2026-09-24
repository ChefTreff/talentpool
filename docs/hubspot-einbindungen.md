# HubSpot-Einbindungen — Bestandsaufnahme für die Entscheidung HubSpot → Close

Stand: 24.09.2026 (Architektur-Session, nur aufgenommen, nichts geändert). **Entscheidung Konrad, 24.09.2026 abends: Close kommt nicht, HubSpot bleibt.** Abschnitt 6 bleibt als Dokumentation der Prüfung stehen; die offenen HubSpot-Punkte (INV0, Deal-Ingest scharf schalten, Labels) laufen weiter. Anlass: Konrad prüft den Umzug des CRM von HubSpot zu Close (Entscheidung Ende der Woche ab 28.09.). Quelle: Code auf `main` (cba4e87), Runbook `docs/runbooks/hubspot-ingest.md`, Zugangs-Liste, Schema.

## 1 · Überblick

| Nr. | Einbindung | Richtung | Auslöser | Stand |
|---|---|---|---|---|
| E1 | **Deal-Ingest**: Deal in Phase „Onboarding Start (Automation)“ → Partner-Organisation, Kontakte, gebuchte Leistungen im Portal | HubSpot → Portal | Sweep alle 15 Min (Hauptweg), Webhook optional, Einzellauf aus dem Admin | gebaut; scharf erst mit `set_edition_hubspot` (Pipeline- und Phasen-IDs je Edition) |
| E2 | **Deal-Phase zurückschreiben**: nach Erfolg in die Erfolgs-Phase, nach Gate-Fehler zurück auf die vorherige Phase | Portal → HubSpot | Ergebnis von E1 | gebaut |
| E3 | **Gate-Fehler melden**: Mail an den Deal-Owner (aus HubSpot gelesen), Slack `#fls27-onboarding` | HubSpot-Daten → Mail/Slack | Gate-Fehler in E1 | gebaut |
| E4 | **Produktstamm nach HubSpot**: Artikel als HubSpot-Produkte anlegen/ändern (`hs_sku`) | Portal → HubSpot | von Hand, Trockenlauf Standard (INV0) | gebaut, Echtlauf wartet auf Konrads SKU-Liste |
| E5 | **Altbestand archivieren**: HubSpot-Produkte ohne `hs_sku` in den Papierkorb | Portal → HubSpot | von Hand, nur ausgewählte IDs | gebaut, Echtlauf offen |
| E6 | **Admin-Anzeigen**: Deals je Organisation mit Link ins HubSpot, Ingest-Protokoll, Editions-Kennungen, Einzellauf | lesend | Admin → Partner → Integrationen; Organisationsseite | gebaut |
| E7 | **Hilfsskript** `scripts/hubspot-pipelines.mjs`: Pipelines, Phasen, Zuordnungs-Labels, Firmen-Eigenschaften auflisten | lesend | von Hand (lokal) | gebaut |
| E8 | **Ableitungen**: Sponsoring-Level als Freitext vom Deal für die Event-App (`level_source = hubspot`), automatische Rollen mit `note = 'hubspot'`, Kennzeichen `product.source_hubspot` aus der Item-Liste 2026 | intern | — | gebaut |

Nicht im Code, aber im Betrieb (Konrad ergänzt): Sales-Pipeline und Angebote, Marketing-Mails/Formulare, der HubSpot-Zugriff aus Konrads Claude-Werkzeugen. Ein Rücksync von Stammdaten aus dem Portal nach HubSpot (Masterplan §Integrationen „aus: Stammdaten-Rücksync“) ist **nicht** gebaut.

## 2 · Die Einbindungen im Detail

### E1 · Deal-Ingest (HubSpot → Portal)
- **Zweck:** Partner-Onboarding ohne Handarbeit — sobald Sales einen Deal in die Automations-Phase schiebt, entstehen Organisation, Kontakte (mit Login-Einladung), gebuchte Leistungen, Ticket-Kontingente, Rollen und die produktabhängige Checkliste.
- **Gelesene Objekte und Felder** (`lib/hubspot/mapping.ts`):
  - Deal: `dealname`, `pipeline`, `dealstage`, `hubspot_owner_id`, `amount`, `closedate`; Zuordnungen zu Companies, Contacts, Line-Items; Phasen-Historie (`propertiesWithHistory: dealstage`).
  - Company: `name`, `legal_name`, `communication_name`, `address`, `zip`, `city`, `country`, `website`/`domain`, `description`, `organization_type`, `partner_category`, `invoice_email`, `invoice_name`, `vat_id`, `po_number`, `sponsoring_level` sowie die ChefTreff-Eigenschaften `fls_booth_type`, `fls_partner_type`, `ct_company_type`, `purchase_ordner`, `invoice_contact` (Fallbacks, Zuordnung im Runbook).
  - Contacts: `email`, `firstname`, `lastname`, `jobtitle`; **Kontaktrollen aus den Zuordnungs-Labels** Deal ↔ Kontakt (v4-API; Wortstämme DE/EN → `primary_ops`, `signing`, `accounting`, `event_app_member`, `additional`).
  - Line-Items: `name`, `hs_sku`, `quantity`, `price` → `org_product` je SKU.
  - Owner: E-Mail und Name (für die Gate-Mail).
- **Geschriebene Tabellen** (`ingest_partner_deal(p jsonb)`, SECURITY DEFINER, Idempotenz je Deal): `organization` (bestehende nur ergänzt, `hubspot_id`), `org_edition` (`hubspot_deal_id`), `partner_deal` (Idempotenz, Payload ohne Personenbezug), `person`/`person_email`/`partner_contact` (Rollen), `org_product` (`hubspot_line_item_id`), Ticket-Kontingente, `role_assignment` (`note = 'hubspot'`), Deliverables aus den Vorlagen; Gate-Fehler nach `integration.sync_error`, Mail in die Warteschlange.
- **Gate-Schlüssel:** `deal_id_required`, `pipeline_unknown`, `legal_name_missing`, `communication_name_missing`, `address_missing`, `primary_contact_missing`, `primary_contact_name_missing`, `invoice_email_missing`, `invoice_email_invalid`, `line_items_missing` (Details Runbook).
- **Auslöser:** `GET /api/cron/hubspot-sweep` alle 15 Minuten (`vercel.json`, `CRON_SECRET`, höchstens 25 Deals je Lauf; `?deal=<id>` für einen Deal) — **Hauptweg**, weil HubSpot-Service-Schlüssel keine Webhooks kennen. `POST /api/webhooks/hubspot` (Signatur v3 mit `HUBSPOT_CLIENT_SECRET`, Fenster 5 Minuten, Idempotenz über `integration.webhook_event`) nur mit einer Projekt-App — **optional, nicht eingerichtet**.
- **Code:** `lib/hubspot/client.ts` (REST ohne SDK), `mapping.ts`, `ingest.ts`, `types.ts`, `signature.ts`, `notify.ts`; `app/api/cron/hubspot-sweep/route.ts`; `app/api/webhooks/hubspot/route.ts`; Konfiguration je Edition über `set_edition_hubspot` (Admin → Partner → Integrationen).
- **Zugang:** `HUBSPOT_ACCESS_TOKEN` (Service-Schlüssel; Scopes `crm.objects.deals.read/.write`, `companies.read`, `contacts.read`, `line_items.read`, `owners.read`, `crm.schemas.deals.read`, `crm.schemas.companies.read`; Rotation mit 7 Tagen Karenz), `CRON_SECRET`, optional `HUBSPOT_CLIENT_SECRET`. Werte nur in Vercel; lokal nur für das Skript.
- **Abhängigkeiten:** Sales pflegt die Labels (Hauptkontakt, Unterschrift, Buchhaltung, Event-App, Weiterer Kontakt), sonst wird nur ein einzelner Kontakt automatisch Hauptkontakt; SKUs an den Line-Items müssen dem Produktstamm entsprechen (`line_items_missing`, unbekannte SKU); die Pipeline- und Phasen-IDs stehen je Edition in `event`.

### E2 · Deal-Phase zurückschreiben (Portal → HubSpot)
- **Zweck:** Sales sieht im CRM, ob das Onboarding durch ist (Erfolgs-Phase „Onboarding Operations (Automation Complete)“) oder woran es hängt (Deal zurück auf die vorherige Phase, Slack-Nachricht mit den Gate-Schlüsseln).
- **Felder:** `dealstage` (PATCH). Braucht `crm.objects.deals.write`.
- **Code:** `setDealStage`, `previousStage`, `advanceToDoneStage` in `lib/hubspot/{client,ingest}.ts`; `event.hubspot_done_stage_id`.

### E3 · Gate-Fehler melden
- Mail an den Deal-Owner (Owner-E-Mail aus HubSpot; ist sie keine Person im Portal, Fallback an `area_lead_partner`) legt die Datenbank an; Slack über `SLACK_ONBOARDING_WEBHOOK_URL` oder `MAKE_ONBOARDING_WEBHOOK_URL` (`lib/hubspot/notify.ts`). Kein HubSpot-Aufruf, aber HubSpot-Daten im Text (Deal-Name, Firma, Deal-Link).

### E4 · Produktstamm nach HubSpot (Portal → HubSpot)
- **Zweck:** Ein Katalog — Sales baut Angebote aus denselben Artikeln (SKU `I-nnnnn`), die im Portal Checkliste und Shop steuern.
- **Felder:** Produkt `name`, `hs_sku`, `price` (Euro als Text), `description`, `hs_product_type`; Fremdschlüssel nach `product_external_ref` (`system = 'hubspot'`).
- **Auslöser:** `POST /api/admin/products/sync` nur von Hand aus dem Admin (`requireArea("admin")`, RPC prüft `is_partner_team()`), Trockenlauf ist die Vorgabe, gezielte SKU-Auswahl (INV0: Hauptartikel nur aktualisieren). Kein nächtlicher Lauf. Audit-Eintrag je Lauf.
- **Code:** `lib/hubspot/products.ts`, `lib/products/sync.ts`, `app/api/admin/products/sync/route.ts`, Admin-Karte `ProductSyncCard`. Derselbe Lauf schreibt parallel nach SevDesk (`lib/sevdesk/parts.ts`).

### E5 · Altbestand archivieren (Portal → HubSpot)
- HubSpot-Produkte **ohne** `hs_sku` (38 Stück laut Konrad 21.09.) über `batch/archive` in den Papierkorb (90 Tage rückholbar); nur ausgewählte IDs, Trockenlauf Standard, Audit mit voller Liste. `app/api/admin/hubspot/archive-products/route.ts`, Karte `HubspotArchiveCard`.

### E6 · Admin-Anzeigen (lesend)
- Organisationsseite `/admin/partner/[org]`: Deals (`partner_deals`) mit Name, ID, Positionen und Link ins HubSpot (`dealUrl`, Portal-ID aus `/account-info/v3/details`).
- `/admin/partner/integrationen`: Editions-Kennungen (`hubspot_editions`, Pflege `saveEditionHubspot` → `set_edition_hubspot`), Ingest-Protokoll (`partner_ingest_log`), Einzellauf eines Deals (ruft den Sweep mit `?deal=`), Produkt-Sync und Archiv-Karten.

### E7 · Hilfsskript
- `node --env-file=.env.local scripts/hubspot-pipelines.mjs` listet Pipelines/Phasen (IDs), Zuordnungs-Labels und Firmen-Eigenschaften — Grundlage für `set_edition_hubspot` und die Prüfung der Property-Namen. Gibt nie den Token aus. `scripts/import-products.mjs` setzt `source_hubspot` aus der Spalte „Source“ der Item-Liste 2026 (kein API-Zugriff).

### E8 · Ableitungen im Datenmodell
- Event-App (Swapcard): Aussteller-Level = bestes Level der gebuchten Produkte, sonst der HubSpot-Freitext `sponsoring_level` (`level_source = 'hubspot'`, `lib/event-app/types.ts`, Migration 0135).
- `sync_granted_roles`: automatische Rollen mit `note in ('auto:product','hubspot')` werden beim Produktabgleich beendet, wenn das Produkt wegfällt.
- Bestandskennzeichen: `product.source_hubspot` (Herkunft Item-Liste).

## 3 · Spuren in der Datenbank
- **Spalten:** `event.hubspot_pipeline_id`, `event.hubspot_onboarding_stage_id`, `event.hubspot_done_stage_id` · `org_edition.hubspot_deal_id` · `org_product.hubspot_line_item_id` · `organization.hubspot_id` · `partner_deal.hubspot_deal_id` (PK) · `product.source_hubspot` · `product_external_ref.system = 'hubspot'` · `integration.webhook_event.source = 'hubspot'` · `integration.sync_job.system`/`sync_error` · `role_assignment.note = 'hubspot'`.
- **Funktionen:** `ingest_partner_deal`, `hubspot_deals_ingested`, `hubspot_editions`, `set_edition_hubspot`, `partner_deals`, `partner_ingest_log`, `products_for_sync`, `set_product_external_ref`, `upsert_product`, `sync_granted_roles`, `event_app_exhibitors`, `partner_admin_overview` (Snapshot `supabase/snapshot/functions/`).
- **Migrationen mit HubSpot-Bezug:** `v2_integration_comms`, `v3_products`, `v3_partner_org_context`, `v3_partner_deliverables`, `v3_hubspot_ingest`, `v3_partner_deal`, `v3_ticket_allocations`, `v3_granted_roles_session_host_hubspot_done`, `v5_sponsoring_level_vokabular`, `v5_pass_type_choice`, `v6_aufraeumen_feldmatrix`, `v6_initiativen`, `v6_produktabgleich`, `v6_sevdesk_shopartikel`, `v6_ea1_aussteller_level`, `v6_formate_schema`.
- **Wichtig für die Ablöse:** `ingest_partner_deal(p jsonb)` ist **anbieterneutral** — es bekommt einen normalisierten Payload (`IngestPayload` in `lib/hubspot/types.ts`). HubSpot-spezifisch sind nur die Spaltennamen `hubspot_*`, der Client und die Zuordnung.

## 4 · Zugänge (nur Namen, Werte in Vercel)
`HUBSPOT_ACCESS_TOKEN` (gesetzt 11.09., Service-Schlüssel), `HUBSPOT_CLIENT_SECRET` (optional, nicht gesetzt), `CRON_SECRET`, `SLACK_ONBOARDING_WEBHOOK_URL` / `MAKE_ONBOARDING_WEBHOOK_URL` / `MAKE_WEBHOOK_SECRET`. HubSpot-Kennungen: Pipeline `379213775`, Phase „Onboarding Start (Automation)“ `3019026648`, Erfolgs-Phase `3569180889` (Runbook 11.09.). Bei einer Ablöse: Schlüssel in HubSpot widerrufen, Variablen aus Vercel entfernen, Zugangs-Liste nachziehen.

## 5 · Datenschutz
- Personenbezug: Kontakte (Name, dienstliche E-Mail, Position) und die Owner-E-Mail werden aus HubSpot gelesen und als `person`/`partner_contact` gespeichert — Verarbeitung V5 (Partner-Portal), Rechtsgrundlage Vertrag; HubSpot ist Auftragsverarbeiter (AVV: `docs/datenschutz-verarbeitungen.md`, Konrad prüft).
- `partner_deal.payload` enthält **keinen** Personenbezug; `webhook_event.payload` nur Deal-ID, Eigenschaft und Wert. Slack-Nachricht: Deal-Name, Firma, Deal-Link, Gate-Schlüssel (keine Personendaten außer implizit im Deal-Namen).
- Löschkonzept: „Profil löschen“ im Portal löscht nicht in HubSpot; externe Löschung binnen 30 Tagen ist als Runbook offen (Datenschutz-Checkliste, Punkt 6). Bei Close gilt dasselbe.

## 6 · Was Close leisten muss — Abgleich und Ablöse-Aufwand

Vorbehalt: Close-API nach Dokumentationsstand der Architektur-Session; vor der Entscheidung gegen die aktuelle API und den Tarif prüfen.

| Baustein heute (HubSpot) | Gegenstück in Close | Aufwand |
|---|---|---|
| Deal mit Pipeline und Phase | Opportunity mit Pipeline und Status | gering (IDs je Edition wie heute) |
| Company mit Standard- und Custom-Eigenschaften | Lead (= Firma) mit Custom Fields | gering; Feldnamen neu zuordnen |
| Kontakte mit **Zuordnungs-Labels** als Rollen | Kontakte hängen am Lead; **keine Labels** → Rolle als Custom Field am Kontakt | mittel; Sales pflegt ein Feld statt Labels |
| **Line-Items mit SKU, Menge, Preis** → gebuchte Leistungen | **Close hat kein Produkt- und kein Positionsobjekt.** Ersatz: (a) Custom Field „gebuchte Artikel“ (fehleranfällig), (b) **SevDesk-Angebot/Auftrag als Quelle der Positionen** (Positionen mit Artikelnummer; Anbindung `lib/sevdesk/*` besteht), (c) eine Opportunity je Produkt | **größte Lücke**, Entscheidung nötig; Empfehlung (b) prüfen |
| Owner (E-Mail) | Close-User am Lead/Opportunity | gering |
| Webhook (Signatur v3) / Sweep | Close-Webhook-Subscriptions (Signatur-Header) / Suche nach Opportunity-Status | gering bis mittel (Adapter) |
| Phase vor- und zurücksetzen | Opportunity-Status setzen | gering |
| Deal-Link im Admin | Lead-/Opportunity-URL | gering |
| Produktstamm nach HubSpot (E4), Archiv (E5) | entfällt (kein Katalog in Close) → Katalog nur im Portal und in SevDesk | Wegfall |
| Hilfsskript (E7) | Neues Skript für Pipelines/Status/Custom-Field-IDs | gering |

**Bau-Aufwand (Schätzung):** neuer Adapter `lib/crm/close/` (Client, Zuordnung, Ingest) anstelle von `lib/hubspot/` (rund 700 Zeilen), Routen Webhook und Sweep, Admin-Karten (Kennungen, Einzellauf), Zugangs-Liste und Env (`CLOSE_API_KEY`, Webhook-Secret): 2–3 Tage · Datenbank: `ingest_partner_deal` bleibt; Spalten `hubspot_*` → `crm_*` umbenennen (eine Migration, Sichten und Snapshot nachziehen): 0,5 Tag · Positionen-Quelle (Variante b: SevDesk-Angebot lesen und in Line-Items übersetzen): 1–2 Tage · Test gegen eine Close-Testorganisation: 1 Tag. **Zusammen etwa 5–7 Arbeitstage** in der Architektur-Session plus Admin-Chat, zuzüglich der Datenübernahme HubSpot → Close (Firmen, Kontakte, Deals) durch Sales/Close-Import und der Feldanlage in Close.

**Zeitpunkt:** Der Ingest ist heute noch nicht scharf (Runbook: `set_edition_hubspot` erst nach Freigabe). Fällt die Entscheidung für Close vor dem Scharfstellen, gibt es keinen Doppelbetrieb; danach müssten die schon verarbeiteten Deals (`partner_deal`) mit ihren Close-Kennungen nachgezogen werden. Prozessstart 01.11. bleibt erreichbar, wenn der Adapter bis Mitte Oktober steht.

## 7 · Offen für Konrad
1. Welche HubSpot-Funktionen nutzt das Team außerhalb des Portals (Angebote/Quotes, Sequenzen, Marketing-Mails, Formulare, Reports)? Das entscheidet über den Umfang der Ablöse jenseits des Codes.
2. Quelle der gebuchten Leistungen ohne Line-Items: SevDesk-Angebot (Empfehlung) oder Custom Field?
3. Tarif und API-Zugang bei Close (Webhooks, Custom Fields, Nutzerzahl).
4. AVV HubSpot heute, AVV Close morgen; Löschkonzept extern (Runbook).
