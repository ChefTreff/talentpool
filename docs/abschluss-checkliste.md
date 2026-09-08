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

## Sofortmaßnahmen make.com (Sicherheit — vor Neubau, Entscheidung Konrad)
- ☐ **Vivenu-Secret-Key rotieren** (Owner klären, Blast-Radius: welche Systeme nutzen ihn?) — alter Key in ~9 Blueprints im Klartext.
- ☐ **Swapcard-Basic-Auth** in Szenario 7874519 entfernen → bestehende Swapcard-Connection nutzen; Zugangsdaten rotieren.
- ☐ **~23 verwaiste aktive Webhooks** abschalten (Abschaltliste vorbereiten; prüfen, ob Softr/Airtable/lu.ma noch darauf senden).
- ☐ **Sample-Daten mit Personenbezug** aus Blueprints entfernen (DSGVO).
- ☐ **Gipfel-26-Stack** archivieren oder als Vorlage sichern (Export ohne Secrets/Samples).
- ☐ Leerlauf-Szenarien (FLA-Rechnungen stündlich, 15 Stubs, TEMP4/5) auf Bedarf umstellen.

## Ergänzungen 08.09. (aus Antworten)
- ☐ **Segmentierungs-Übersicht ans Marketing** senden (alle Felder/Kombinationen) → Segmente zurück → Views + AC-Tags bauen.
- ☐ **Speaker Reception**: neuen Namen eintragen; Flag „Reception-berechtigt" im Speaker-Onboarding.
- ☐ **Domain-Umzug**: Team-Portal → `team.chef-treff.de`, Plattform → `portal.chef-treff.de` (im Härtungsfenster, nach Entscheidung); `partner.chef-treff.de` → Redirect.
- ☐ **Schriften**: OTF → WOFF2 konvertieren, `@font-face` einbinden, Lesbarkeits-Check SemiBold als Fließtext (ggf. Book/Medium nachlizenzieren).
- ☐ **Keys in Vercel-Env** (Prod/Preview/Dev) hinterlegen; lokal `vercel env pull`.
- ☐ **Verwaiste make.com-Webhooks deaktivieren** — Liste: `docs/makecom-webhooks-2026-09-08.md` (23 Hooks; 2 Finanz-Hooks vorher bestätigen); per API nicht möglich → manuell in der Make-UI.

## Ergänzungen aus dem Feedback FLS26 (08.09.)
- ☐ **Vivenu**: Anleitung „Bestätigungsseite nachbauen" einholen; Deposit für Free Tickets klären (Support Q9); Add-ons Hotel/DB-Ticket/Locker/Bundles im Shop anlegen (Kontingente extern beschaffen; DB-Veranstaltungsticket beantragen).
- ☐ **Swapcard**: Processing-Fehler der Teilnehmer-Importe FLS26 analysieren; Exhibitor-Kategorien + Rechte definieren; QR = Vivenu-Barcode verifizieren.
- ☐ **Website/Sanity**: Zugang + Schema für automatische Partner-Logos.
- ☐ **Mail-Plan je Journey** (Teilnehmer, Partner, Speaker, Volunteer) — Minimierung, Templates DE/EN, Reminder-Regeln.
- ☐ **Strategy-Call-Slots** 6 Wochen vor Summit (ab Premium) einplanen (≈ Anfang März 2027).
- ☐ **Domain-Umzug** Team-Portal → `team.chef-treff.de` (Konrad), Plattform → `portal.chef-treff.de`.

## Ergänzungen 08.09. (Vivenu-Call / Referenzen)
- ☐ vivenu-Doku „Transaktionsbestätigungsseite austauschen" + **Endpunktliste** erhalten und in den Integrationsvertrag übernehmen.
- ☐ **Einlass-Setup** entscheiden (CoreGo vs. vivenu vs. Fastlane), Throughput 10.000 Personen; Scan-Rückfluss testen.
- ☐ **Cashless/Pfand**: POS-Bedarf klären (nur wenn Deposit kommt).
- ☐ `vivenu_customer_id` im Datenmodell/Sync mitführen; **Segment-Feature** (E-Mail-Domain → Secret Shop) für Uni-Kontingente evaluieren.
- ☐ Confirmation Page im OMR-Muster spezifizieren (Design-Loop).

## Ergänzungen 08.09. abends (Portal-Walkthrough, Wiki)
- [ ] **PII im Wiki bereinigen** (private Mobilnummern/Gmail von Freelancern) **vor** jedem Import/Indexieren; Rollen-Postfächer speaker@/partner@ einrichten.
- [ ] **Chatbase-Account prüfen:** Quellen, Plan, Datenstandort, AVV; entscheiden (Frage 64) und ggf. kündigen + Trainingsdaten löschen lassen.
- [ ] **Alt-Systeme bis zur Abschaltung patchen:** WordPress/WooCommerce Messeshop (Updates, Admin-Pfad), SoftR-Hubs; nach Go-live: Bestellungen exportieren (Referenz), Logins deaktivieren, DNS `partner.`/`speaker.`/`partnerhub.` auf Portal umleiten.
- [ ] **Notion-Wikis nach Import einfrieren** (read-only) — eine Quelle der Wahrheit: Portal.

## Ergänzungen 08.09. spät (Antworten 56–77)
- [ ] **Token-Liste** (`docs/zugangs-liste.md`) durchgehen und alle Werte in Vercel setzen (Production + Preview getrennt); danach `vercel env pull .env.local` — Konrad.
- [ ] **Kontingente Hotel / DB-Ticket / Locker** über Laura bis **01.11.2026**; Add-ons in vivenu anlegen.
- [ ] **Chatbase** nach Go-live des eigenen Bots kündigen, Trainingsdaten löschen lassen (Quelle war nur die Wiki-DB).
- [ ] **Figma-Template Slot-Grafiken** neu bauen (Design), Generator erst danach (C).
- [ ] **Item-Liste 2026** vor Welle 3 einfrieren (nur noch im Portal pflegen), HubSpot-Produkte und SevDesk-Artikel mit `product.sku` abgleichen.
- [ ] **Item-Liste bereinigen** (Konrad, vor Welle 3): 24 Platzhalter-SKUs, USt-Satz je Kategorie, 52 preislose Zusatzleistungen, Namen/Kategorien trimmen; HubSpot-Produkte per SKU abgleichen.
- [ ] **Volunteer-Wiki exportieren** (Notion Markdown + Bilder) vor dem Import; WhatsApp-Links und Team-Blöcke entfernen.
- [ ] **Supabase Auth: „Leaked Password Protection" aktivieren** (Dashboard → Authentication → Settings) — Konrad; kostet nichts, auch wenn wir Magic Links nutzen.
