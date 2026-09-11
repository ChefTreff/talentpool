# Runbook HubSpot-Ingest (Welle 3 A2)

Deal erreicht Phase **„Onboarding Automation“** → Abgleich alle 15 Minuten (oder optionaler Webhook) → `ingest_partner_deal` legt Organisation, Edition, Leistungen, Kontakte (mit Einladung), Ticket-Kontingent und Checkliste an. Scheitert das Gate, bleibt die Datenbank unberührt: Fehlerdatensatz, Mail an den Deal-Owner, Phase zurück, Slack. Code: `app/api/webhooks/hubspot`, `app/api/cron/hubspot-sweep`, `lib/hubspot/*`; Datenbank: Migrationen 0043/0044, Test `supabase/tests/v3_partner_ingest.sql`.

## Einrichtung (einmalig)
1. **Service-Schlüssel** in HubSpot (Settings → Integrationen → Service-Schlüssel; braucht Developer-Tools-Zugriff, ein Schlüssel bekommt nur Scopes, die der anlegende Nutzer selbst hat): `crm.objects.deals.read` + `.write` (Phase zurücksetzen), `crm.objects.companies.read`, `crm.objects.contacts.read`, `crm.objects.line_items.read`, `crm.objects.owners.read` (Deal-Owner für die Gate-Mail), `crm.schemas.deals.read` (Pipelines), `crm.schemas.companies.read` (Einrichtungsskript). Wert → Vercel `HUBSPOT_ACCESS_TOKEN` (sensibel, nie im Chat). Rotation über die Schlüsselverwaltung (7 Tage Karenz). **Keine Legacy Private App** mehr anlegen (HubSpot schaltet das Anlegen ab 26.10.2026 ab; Entscheidungslog 11.09.).
2. **Webhook optional:** Service-Schlüssel kennen keine Webhooks. Der Ingest läuft deshalb über den Abgleich alle 15 Minuten (unten). Wer später Sekunden statt Minuten braucht, legt eine Projekt-App über die HubSpot-CLI mit Subscription *Deal · Property change · `dealstage`* auf `https://portal.chef-treff.de/api/webhooks/hubspot` an und setzt deren Client Secret als `HUBSPOT_CLIENT_SECRET`; die Route prüft die Signatur v3 und ist ohne Secret wirkungslos (401).
3. **IDs eintragen — macht den Ingest scharf** (ab dann verarbeitet der Abgleich alle 15 Minuten jeden Deal in der Phase, legt Organisationen und Kontakte an und verschickt Einladungen an echte Adressen; deshalb erst nach Konrads Freigabe): `node --env-file=.env.local scripts/hubspot-pipelines.mjs` zeigt Pipelines, Phasen, Zuordnungs-Labels und Firmen-Eigenschaften. Dann als Partner-Team (Admin oder `area_lead_partner`):
   ```sql
   select set_edition_hubspot('<edition_id fls27>', '<pipeline_id>', '<stage_id Onboarding Automation>', '<stage_id Automation Complete>');
   ```
   Ohne Eintrag verarbeitet die Route nichts (`ignored`), der Sweep hat keine Editionen.
4. **Zuordnungs-Labels Deal → Kontakt** im HubSpot-Portal anlegen und beim Deal setzen: *Hauptkontakt*, *Unterschrift*, *Buchhaltung*, *Event-App*, *Weiterer Kontakt*. Die Wortstämme (DE/EN) stehen in `lib/hubspot/mapping.ts` → `roleFromLabel`. Ein einzelner Login-Kontakt ohne Label wird automatisch Hauptkontakt; *Buchhaltung* bekommt keinen Login, ihre E-Mail wird Rechnungs-E-Mail (Entscheidung 1).
5. **Firmen-Eigenschaften** (interne Namen, sonst in `COMPANY_PROPERTIES` anpassen): `legal_name`, `communication_name` (Fallback jeweils `name`), `address`, `zip`, `city`, `country`, `website`/`domain`, `description`, `invoice_email`, `invoice_name`, `vat_id`, `po_number`, `organization_type` (Vokabular), `partner_category` (Vokabular), `sponsoring_level`. Line-Items brauchen `hs_sku` = Item-ID `I-nnnnn`.
6. **Slack:** Slack-App „ChefTreff Portal“ (api.slack.com/apps → Create New App → From scratch, Workspace ChefTreff) → *Incoming Webhooks* aktivieren → „Add New Webhook to Workspace“ → Kanal `#fls27-onboarding` → Webhook-URL → Vercel `SLACK_ONBOARDING_WEBHOOK_URL` (sensibel; wer die URL hat, kann in den Kanal posten). Mehr braucht die App nicht: Scope `incoming-webhook` kommt automatisch, kein Bot-Token, keine Event-Subscriptions, keine Verteilung; unter *Display Information* Name und Icon setzen, so erscheint der Absender im Kanal. Fallback: make-Szenario „Webhook → Slack“ als `MAKE_ONBOARDING_WEBHOOK_URL` (optional Header `x-webhook-secret` = `MAKE_WEBHOOK_SECRET`). Ohne URL wird nur geloggt.

## Bestandsaufnahme 11.09.2026 (Service-Schlüssel gesetzt, nur gelesen)
- **Pipeline „Future Leader Summit“** `379213775`; Phase **„Onboarding Start (Automation)“** `3019026648` (0 Deals), „Signed“ `586899154` (1 Deal), „Onboarding Operations (Automation Complete)“ `3569180889` (0) — Letztere ist die **Erfolgs-Phase** (0058, Entscheidung Konrad 11.09.): nach gelungenem Ingest schiebt der Sweep den Deal dorthin, sofern `hubspot_done_stage_id` gesetzt ist. **IDs noch nicht eingetragen — erst nach Konrads Freigabe, wenn alles andere steht.**
- **Zuordnungs-Labels Deal → Kontakt fehlen** (nur das Standard-Label ohne Namen): *Hauptkontakt*, *Unterschrift*, *Buchhaltung*, *Event-App*, *Weiterer Kontakt* im Portal anlegen (Schritt 4), sonst wird nur ein einzelner Kontakt automatisch Hauptkontakt.
- **Kontakt-Labels** trägt das Sales-Team nach (Entscheidung Konrad 11.09.); für den Start genügt der Hauptkontakt, den Rest ergänzt der Partner im Portal.
- **Firmen-Eigenschaften** — Zuordnung **umgesetzt** in `lib/hubspot/mapping.ts` (11.09.; Portal-Eigenschaften gleichen Namens haben Vorrang, HubSpot-Eigenschaften sind der Fallback):

  | Portal-Feld | HubSpot heute | Vorschlag |
  |---|---|---|
  | `legal_name` | fehlt | Standard `name` |
  | `communication_name` | `communication_name` („Company (Communication Name)“) ✅ | Fallback Firmenname; der Partner ändert ihn im Portal (Stammdaten) |
  | Adresse, PLZ, Ort, Land, Website, Beschreibung | Standard `address`/`address2`, `zip`, `city`, `country`, `website`/`domain`, `description` ✅ | — |
  | `invoice_email` | `invoice_contact` (string) | prüfen, ob dort eine E-Mail steht; sonst neue Eigenschaft |
  | `invoice_name` | fehlt | Standard `name`, sonst neue Eigenschaft |
  | `vat_id` | `vat_id` ✅ | — |
  | `po_number` | `purchase_ordner` (Tippfehler im internen Namen) | so übernehmen |
  | `organization_type` | `ct_company_type` (Corporate, VC, Startup, Universität, Initiative, Stiftung, Media, Service / Kooperation, Catering, Important, Other) | Zuordnung auf das Vokabular `organization_type`: Corporate ⇒ corporate, Startup ⇒ startup, Universität ⇒ university, Initiative ⇒ initiative, **Stiftung ⇒ foundation (0059)**, Media ⇒ media, Service / Kooperation ⇒ agency; VC, Catering, Important, Other bleiben leer ⇒ corporate |
  | `partner_category` | `fls_partner_type` (HR, Marketing, Startup, Hackathon, ZEIT, Agency Partner) | HR Partner → `talent`, Startup Partner → `startup`; Rest klären (Vokabular kennt nur startup/talent) |
  | `sponsoring_level` | `fls_booth_type` (1,5qm Start Up, 4qm Intro, 9qm General, 18qm Premium, 25qm+ Signature, Main Stage Loge, Gemeinschaftsstand) | Level aus dem Standtyp; `fls_sponsoring` sind Sponsoring-Arten (Speaker Lounge, Food, …), kein Level |
  | Logo | `logo` (string) | optional als Vorbelegung |
  | Line-Items | `hs_sku` ✅ | — |

## Ablauf
- **Webhook:** Signatur v3 (`X-HubSpot-Signature-v3`, `X-HubSpot-Request-Timestamp`, Fenster 5 Min.) → 401 bei Fehler, keine Verarbeitung. Jedes Ereignis nach `integration.webhook_event` (`record_webhook_event`, Duplikat je `(source, external_id)`). Antwort sofort; Verarbeitung danach (`after`). Relevant sind nur `deal.propertyChange`/`dealstage` mit der Phase einer Edition (`hubspot_editions`), alles andere `ignored`.
- **Ingest** (`lib/hubspot/ingest.ts`): Deal + Firma + Kontakte (Labels über v4-Zuordnungen) + Line-Items + Owner lesen → Payload (`lib/hubspot/mapping.ts`) → `ingest_partner_deal(p)` mit service_role. Erfolg: `organization` (bestehende nur ergänzt), `org_edition` `invited`, `partner_deal`, `org_product`, `org_ticket_allocation` (aus `product.pass_type`), Kontakte + `partner_contact` bis Editionsende + `partner_contact_invite`, `standbuehne_editor` (Scope org) bei Bühnenprodukt (`product.grants_role`), Checkliste per Trigger. Gate-Fehler: `integration.sync_error`, Mail `partner_gate_failed` an den Owner (Fallback `area_lead_partner`, dann Admins), Phase zurück auf den vorherigen Wert der Eigenschafts-Historie, Slack.
- **Sweep = Hauptweg** (`/api/cron/hubspot-sweep`, alle 15 Minuten, `CRON_SECRET`): je Edition alle Deals der Phase „Onboarding Automation“ gegen `partner_deal`, neue verarbeiten (max. 25 je Lauf, Rest im nächsten Lauf), Gate-Fehler wie oben inkl. Rücksetzen der Phase, Lauf in `integration.sync_job`. Einzelner Deal ohne Rücksetzen der Phase:
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
