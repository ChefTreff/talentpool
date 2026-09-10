# Runbook HubSpot-Ingest (Welle 3 A2)

Deal erreicht Phase **„Onboarding Automation“** → Webhook → `ingest_partner_deal` legt Organisation, Edition, Leistungen, Kontakte (mit Einladung), Ticket-Kontingent und Checkliste an. Scheitert das Gate, bleibt die Datenbank unberührt: Fehlerdatensatz, Mail an den Deal-Owner, Phase zurück, Slack. Code: `app/api/webhooks/hubspot`, `app/api/cron/hubspot-sweep`, `lib/hubspot/*`; Datenbank: Migrationen 0043/0044, Test `supabase/tests/v3_partner_ingest.sql`.

## Einrichtung (einmalig)
1. **Private App** in HubSpot (Settings → Integrations → Private Apps): Scopes `crm.objects.deals.read` + `.write` (Phase zurücksetzen), `crm.objects.companies.read`, `crm.objects.contacts.read`, `crm.objects.line_items.read`, `crm.schemas.deals.read` (Pipelines), Webhooks. Token → Vercel `HUBSPOT_ACCESS_TOKEN`, Client Secret → Vercel `HUBSPOT_CLIENT_SECRET` (beide sensibel, nie im Chat).
2. **Webhook-Subscription** in der Private App: Objekt *Deal*, Ereignis *Property change*, Eigenschaft `dealstage`, Ziel-URL `https://portal.chef-treff.de/api/webhooks/hubspot`. **Voraussetzung:** Die Route muss ohne Vercel-Login erreichbar sein — die `vercel.app`-URL steht hinter der Deployment-Protection. Der Webhook geht deshalb erst mit der eigenen Domain in Betrieb (Runbook Domain-Umzug) oder mit einer früher aufgeschalteten Zwischen-Domain. Bis dahin ersetzt der Sweep den Webhook.
3. **IDs eintragen:** `node --env-file=.env.local scripts/hubspot-pipelines.mjs` zeigt Pipelines, Phasen, Zuordnungs-Labels und Firmen-Eigenschaften. Dann als Partner-Team (Admin oder `area_lead_partner`):
   ```sql
   select set_edition_hubspot('<edition_id fls27>', '<pipeline_id>', '<stage_id Onboarding Automation>');
   ```
   Ohne Eintrag verarbeitet die Route nichts (`ignored`), der Sweep hat keine Editionen.
4. **Zuordnungs-Labels Deal → Kontakt** im HubSpot-Portal anlegen und beim Deal setzen: *Hauptkontakt*, *Unterschrift*, *Buchhaltung*, *Event-App*, *Weiterer Kontakt*. Die Wortstämme (DE/EN) stehen in `lib/hubspot/mapping.ts` → `roleFromLabel`. Ein einzelner Login-Kontakt ohne Label wird automatisch Hauptkontakt; *Buchhaltung* bekommt keinen Login, ihre E-Mail wird Rechnungs-E-Mail (Entscheidung 1).
5. **Firmen-Eigenschaften** (interne Namen, sonst in `COMPANY_PROPERTIES` anpassen): `legal_name`, `communication_name` (Fallback jeweils `name`), `address`, `zip`, `city`, `country`, `website`/`domain`, `description`, `invoice_email`, `invoice_name`, `vat_id`, `po_number`, `organization_type` (Vokabular), `partner_category` (Vokabular), `sponsoring_level`. Line-Items brauchen `hs_sku` = Item-ID `I-nnnnn`.
6. **Slack:** make-Szenario „Webhook → Slack #fls27-onboarding“; URL → Vercel `MAKE_ONBOARDING_WEBHOOK_URL`. Optional prüft make den Header `x-webhook-secret` gegen `MAKE_WEBHOOK_SECRET`. Ohne URL wird nur geloggt.

## Ablauf
- **Webhook:** Signatur v3 (`X-HubSpot-Signature-v3`, `X-HubSpot-Request-Timestamp`, Fenster 5 Min.) → 401 bei Fehler, keine Verarbeitung. Jedes Ereignis nach `integration.webhook_event` (`record_webhook_event`, Duplikat je `(source, external_id)`). Antwort sofort; Verarbeitung danach (`after`). Relevant sind nur `deal.propertyChange`/`dealstage` mit der Phase einer Edition (`hubspot_editions`), alles andere `ignored`.
- **Ingest** (`lib/hubspot/ingest.ts`): Deal + Firma + Kontakte (Labels über v4-Zuordnungen) + Line-Items + Owner lesen → Payload (`lib/hubspot/mapping.ts`) → `ingest_partner_deal(p)` mit service_role. Erfolg: `organization` (bestehende nur ergänzt), `org_edition` `invited`, `partner_deal`, `org_product`, `org_ticket_allocation` (aus `product.pass_type`), Kontakte + `partner_contact` bis Editionsende + `partner_contact_invite`, `standbuehne_editor` (Scope org) bei Bühnenprodukt (`product.grants_role`), Checkliste per Trigger. Gate-Fehler: `integration.sync_error`, Mail `partner_gate_failed` an den Owner (Fallback `area_lead_partner`, dann Admins), Phase zurück auf den vorherigen Wert der Eigenschafts-Historie, Slack.
- **Sweep** (`/api/cron/hubspot-sweep`, täglich 03:15 UTC, `CRON_SECRET`): je Edition alle Deals der Phase gegen `partner_deal`, fehlende nachholen (max. 25 je Lauf), Lauf in `integration.sync_job`. Einzelner Deal ohne Rücksetzen der Phase:
  ```bash
  curl -s -H "Authorization: Bearer $CRON_SECRET" "https://portal.chef-treff.de/api/cron/hubspot-sweep?deal=<dealId>"
  ```
  (lokal `http://localhost:3000`, `CRON_SECRET` aus `.env.local`).

## Gate-Fehlerschlüssel
`pipeline_unknown`, `legal_name_missing`, `communication_name_missing`, `address_missing`, `invalid_type:<x>`, `invalid_partner_category`, `primary_contact_missing`, `primary_contact_multiple`, `primary_contact_name_missing`, `primary_conflict` (Firma hat im Portal schon einen anderen Hauptkontakt), `contact_email_invalid:<id>`, `contact_suppressed:<id>`, `invalid_role:<label>`, `invoice_email_missing`, `invoice_email_invalid`, `line_items_missing`, `unknown_sku:<sku>`, `inactive_sku:<sku>`. Zweiter Deal derselben Firma und Edition (Nachbuchung) ist kein Fehler: Leistungen kommen dazu, Kontakte werden nicht doppelt eingeladen.

## Betrieb und Fehlerbilder
- Log für das Team: `select * from partner_ingest_log(100);` (Webhook-Ereignisse + offene/erledigte Gate-Fehler), Deals einer Org `partner_deals(org_id)`, Fehler erledigen `resolve_sync_error(id)`; Admin-Oberfläche kommt mit B9.
- `webhook_event.status = failed` (HubSpot nicht erreichbar, RPC-Fehler): Sweep holt den Deal nachts nach; Details im `error`-Feld.
- Deal steht nach einem Gate-Fehler nicht zurückgesetzt: Phase-Historie leer oder Schreibrecht fehlt (Scope `deals.write`) — im Vercel-Log `Phase … nicht zurückgesetzt`.
- Keine Mail an den Owner: Owner-E-Mail ist keine `person` im Portal → Fallback an `area_lead_partner`; `owner_found=false` im Rückgabewert.
