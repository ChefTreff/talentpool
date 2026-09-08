# Zugangs- und Token-Liste (ohne Werte) — Stand 08.09.2026

> Konrad erzeugt alle Zugänge selbst und setzt die Werte **nur in Vercel** (Environment Variables, Production und Preview getrennt). Lokal: `vercel env pull .env.local`. Nichts davon gehört in Chat, Drive oder Repo. Rotation und Widerruf werden im Entscheidungslog notiert. Platzhalter stehen in `.env.local.example`.

| Variable | System | Wofür | Woher / minimale Rechte | Welle |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Client-Zugriff (RLS) | seit 08.09. über die **Vercel↔Supabase-Integration** automatisch gesetzt (die App akzeptiert auch die neuen Namen `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`) | 0 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Server-Aktionen nach Rollenprüfung, Migration | Project Settings → API (vorhanden); nie im Client | 0 |
| Google OAuth Client-ID/-Secret | Google Cloud → Supabase Auth | Staff-SSO (Domain chef-treff.de) + 2FA | Google Cloud Console, OAuth-Client „Web"; Redirect = Supabase-Callback; **in Supabase Auth Providers eintragen, nicht in Vercel** | 0 |
| `RESEND_API_KEY`, `RESEND_FROM` | Resend | alle System-Mails | Resend → API Keys (Sending only); Domain `chef-treff.de` verifizieren (SPF, DKIM, DMARC) | 0 |
| `NEXT_PUBLIC_SITE_URL` | App | absolute Portal-URL für Mail-Links und Redirects (kein Host-Header-Fallback in Produktion) | selbst setzen: Production `https://portal.chef-treff.de`, Preview je Deployment; lokal `http://localhost:3000` | 0 |
| `VIVENU_API_KEY`, `VIVENU_WEBHOOK_SECRET`, `VIVENU_SANDBOX` | vivenu | Ticket-Ingest, Personalisierung, Coupons | vivenu Dashboard → Entwickler; **erst Sandbox-Key**, Produktiv-Key nach Rotation des alten (Checkliste) | 1 |
| `SWAPCARD_API_KEY`, `SWAPCARD_EVENT_ID` | Swapcard | Teilnehmer/Speaker/Sessions/Exhibitors-Sync | Swapcard Studio → API; neuer Key nach Rotation; Event-ID FLS27 | 3 |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot | Deal-Ingest (Onboarding Automation), Rücksync | Private App; Scopes: `crm.objects.deals` (read/write), `crm.objects.companies`, `crm.objects.contacts`, `crm.objects.line_items` (read), Webhooks | 3 |
| `SEVDESK_API_TOKEN` | SevDesk | Rechnungsentwürfe, Kontakte | SevDesk → Einstellungen → Benutzer → API-Token | 2–3 |
| `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN` | Sanity | Partner-Logos auf die Website | sanity.io → API → Token mit Rolle „Editor" auf dem Dataset | 3 |
| `ACTIVECAMPAIGN_API_URL`, `ACTIVECAMPAIGN_API_KEY` | ActiveCampaign | Segmente/Tags push, Opt-in zurück | AC → Settings → Developer | 4–5 |
| `LUMA_API_KEY` / Webhook-Secret | Luma | Community-Events → `registration` | Luma → Settings → API | 4 |
| `MAKE_WEBHOOK_SECRET` | make.com | Shared Secret für Transport-Webhooks (Header) | selbst erzeugen (`openssl rand -hex 32`), in make-Szenario als Header setzen | 3 |
| `ANTHROPIC_API_KEY` | Anthropic | Chatbots (serverseitig) | console.anthropic.com → API Keys, eigener Workspace „Portal" mit Limit | 5 |
| Fehler-Tracking DSN (z. B. `SENTRY_DSN`) | Monitoring | Fehler-/Uptime-Alarm → `alarm@chef-treff.de` | Anbieterentscheidung in Welle 5 | 5 |
| `alarm@chef-treff.de` | Google Workspace | Alarm-Gruppe (Supabase, Vercel, Webhook-Sweeps) | Google Admin → Gruppe anlegen | Betrieb |
| Qonto Rechnungseingang | Qonto | Auslagen-PDFs per Mail | keine API; nur die Eingangsadresse als `QONTO_INBOX_EMAIL` | 2 |

**Regeln:** ein Key pro System und Umgebung · Rechte minimal · Rotation dokumentiert (Datum, Grund) · alte Keys nach Umstellung widerrufen (vivenu, Swapcard, make-Blueprints) · Keys nie in Screenshots oder Support-Tickets.
