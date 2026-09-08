# Abschluss-Checkliste — vor Go-live (14.10.) bzw. vor Prozessstart (01.11.)

Laufend gepflegt. ☐ offen · ☑ erledigt. Quelle: Entscheidungslog.

## Sicherheit & Datenschutz
- ☐ **Consent-Agent briefen** (alle Tools, Verbindungen, Datenflüsse, Consent-Set: Verarbeitung · Newsletter · Weitergabe an Partner · Foto/Recording · Swapcard-Übertragung) → Texte erstellen → **Anwaltsprüfung** → im Portal verankern (Versionierung + Zeitstempel).
- ☐ **AVVs** abschließen: Supabase, Vercel, Resend, Vivenu, Swapcard, HubSpot, SevDesk, make.com, Google Workspace.
- ☐ **Aufbewahrungs- & Löschkonzept** (Workshop Konrad + Claude): Fristen je Datenart (Bewerbungen, CVs, Speaker-Daten, Bankdaten, Logs); „Profil löschen"-Button + Sperrvermerk (gehashte E-Mail) umgesetzt und getestet.
- ☐ **Security-Loop** mit externem Experten: Threat-Model, RLS-Review, Secrets, Abhängigkeiten, Rate-Limits, Pen-Test; Findings geschlossen.
- ☐ **Staff-2FA via Google-SSO** (Domain `chef-treff.de`), Magic-Link für Teilnehmer; Check-in-Rolle mit minimalen Rechten.
- ☐ Audit-Log für Admin-Aktionen und Partner-Zugriffe auf Bewerberdaten aktiv.

## Betrieb
- ☐ **Supabase PITR** aktivieren (Point-in-Time-Recovery), Backup-**Restore-Test** dokumentiert durchgeführt.
- ☐ **Vercel Pro** bestätigt; Regionen EU; Env-Variablen (Production/Preview) vollständig.
- ☐ **`alarm@chef-treff.de`** angelegt (Alias + Postfach-Abschnitt); Alerts aus Supabase, Vercel, Resend, make.com, Cron-Jobs dorthin.
- ☐ Domain(s) + DNS: Portal-Domain, **Resend-Domain-Verifizierung** (SPF/DKIM/DMARC für @chef-treff.de).
- ☐ Monitoring: Fehler-Tracking, Uptime-Check, Webhook-Reconciliation-Sweeps (Vivenu, HubSpot) laufen.

## Integrationen
- ☐ Vivenu: Support-Antworten (E-Mail im Personalize-Body, Server-Key ohne Secret, Webhook-Retry) eingeholt; Sandbox → Prod umgeschaltet; Add-ons (Unterkunft, Bahn) im Shop angelegt.
- ☐ Swapcard: Sync Teilnehmer/Speaker/Sessions/Exhibitors getestet (27er-Event), Tracks als Custom Field.
- ☐ HubSpot: Webhook „FLS27-Pipeline → Onboarding Automation" + Line-Items getestet; Rücksync Stammdaten.
- ☐ ActiveCampaign: Segment-Push + Opt-in-Rückfluss; **Reaktivierungs-Kampagne** (Lead → Talent) vorbereitet.
- ☐ SevDesk: Rechnungsentwürfe (Partner, Messeshop, Auslagen) automatisiert; Freigabe-Flow Konrad.
- ☐ **Badge-Druck-System** festgelegt (Oktober) und Datenquelle angebunden.

## Dokumentation & Reproduzierbarkeit
- ☐ **Reproduktionstest**: frisches Supabase-Projekt + Vercel-Deploy allein aus Repo/Doku hochgezogen (Migrationen, Seeds, Env-Vorlage, Runbooks).
- ☐ Runbooks: Deploy, Rollback, Restore, Key-Rotation, Incident.
- ☐ Architektur-/Datenmodell-/Rechte-Doku aktuell; Drive-Spiegel aktuell.

## Design & Abnahme
- ☐ Designer-Loop (Token-Übergabe, Review aller Portale) nach Funktionsstand.
- ☐ Konrad-Abnahme je Portal (80 %-Runden dokumentiert).
- ☐ Migration Altbestand (Airtable, später AC) mit Report + Dubletten-Review — **letzter Schritt**.
