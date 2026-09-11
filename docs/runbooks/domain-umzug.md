# Runbook · Domain-Umzug (Team-Portal → team., Plattform → portal.)

**Auslöser:** Go-live der Plattform unter `portal.chef-treff.de` (spätestens 14.10.2026). Das alte Team-Portal (eigenes Supabase-Projekt `teamportal`, Frankfurt) belegt die Domain heute.
**Empfehlung:** Teil A Anfang Oktober, Teil B am Go-live-Tag. Beide Teile sind in Minuten rückrollbar (DNS/Domain-Zuordnung zurück).

## Voraussetzungen
- DNS liegt bei **IONOS**; die Zone `chef-treff.de` pflegt zentral ein Freelancer. Wir legen **keine Einträge selbst an**, sondern geben den CNAME-Wert aus Vercel weiter (Übergabe-Info Team-Portal, 11.09.2026). Zugriff auf beide Vercel-Projekte (`cheftreff-teamportal`, `talentpool`) und beide Supabase-Projekte.
- Google-OAuth-Client des Team-Portals (falls SSO genutzt) bekannt.

## Übergabe-Regeln des Team-Portals (11.09.2026)
Drei DNS-Einträge werden **nicht angefasst**: `chef-treff.de MX` (Google Workspace, ganze Firma), `send.chef-treff.de MX + SPF` (Mailversand über Resend) und `resend._domainkey.chef-treff.de` (DKIM dazu). Die letzten beiden sind als „Team-Portal“ beschriftet, tragen aber **auch unseren Versand**: die Plattform sendet als `@chef-treff.de` (`RESEND_FROM`) über denselben Resend-Workspace — nur dort kann die Domain mit diesem DKIM-Schlüssel verifiziert sein (Resend nutzt je Domain den festen Selektor `resend._domainkey`). Beim Abbau des alten Team-Portals dürfen diese Einträge also nicht mit entfernt werden.

**DMARC steht scharf** (`p=reject; sp=reject; aspf=s; adkim=s`). Für unseren Versand heißt das: Absender `@chef-treff.de` ⇒ DKIM `d=chef-treff.de` ist exakt ausgerichtet, DMARC besteht (SPF über den Return-Path `send.chef-treff.de` ist unter `aspf=s` nicht ausgerichtet, DMARC braucht aber nur eine der beiden Prüfungen). Ein Absender `@portal.chef-treff.de` wäre **nicht** gedeckt: er bräuchte einen eigenen DKIM-Schlüssel unter `<selektor>._domainkey.portal.chef-treff.de` und einen Return-Path auf einer weiteren Subdomain (z. B. `send.portal.chef-treff.de` mit MX + SPF) — an `portal.chef-treff.de` selbst darf neben dem CNAME nichts stehen (RFC 1034). Niemals einen zweiten `v=spf1`-Eintrag an `chef-treff.de` anlegen (PermError für die ganze Firma inkl. Google Workspace). **Entscheidung:** Wir bleiben beim Absender `@chef-treff.de`; Reply-To sind die Rollen-Postfächer (Google Workspace).

**Alte Links:** In verschickten internen Mails stehen `portal.chef-treff.de/belege`, `/abwesenheiten`, `/signatur`. Nach der Übergabe leitet die Plattform diese Pfade (und Unterpfade) mit 307 auf `team.chef-treff.de` weiter (`next.config.ts`, nur für den Host `portal.chef-treff.de`); alles andere bekommt den normalen 404 bzw. die Login-Seite.

## Teil A · Team-Portal auf `team.chef-treff.de` (parallel zu portal.)
1. Vercel → Projekt des Team-Portals → Settings → Domains → `team.chef-treff.de` hinzufügen; DNS-Eintrag laut Vercel-Anzeige setzen (CNAME). Warten bis „Valid".
2. Supabase-Projekt `teamportal` → Authentication → URL Configuration: Site URL `https://team.chef-treff.de`, Redirect-URL `https://team.chef-treff.de/**` **zusätzlich** eintragen (alte behalten).
3. Falls Google-SSO: Google Cloud Console → OAuth-Client → Authorized redirect URIs um die neue Callback-URL ergänzen.
4. Login auf `team.chef-treff.de` testen (zwei Personen). Team informieren: „Ab sofort team.chef-treff.de nutzen, portal. läuft noch bis <Datum>."
5. Hartkodierte Links im Team-Portal (Mails, Bookmarks, Slack-Pins) auf `team.` umstellen.

## Teil B · Plattform auf `portal.chef-treff.de` (Go-live)
6. Vercel → Team-Portal-Projekt → Domain `portal.chef-treff.de` entfernen.
7. Vercel → Projekt `talentpool` → Domains → `portal.chef-treff.de` hinzufügen. Vercel zeigt den nötigen CNAME (Standard `cname.vercel-dns.com`, bei neueren Projekten ein projektspezifischer `*.vercel-dns-0xx.com`-Wert) — **diesen Wert an den Freelancer geben**, der den vorhandenen CNAME bei IONOS anpasst (zeigt heute auf das Team-Portal-Projekt; innerhalb desselben Vercel-Teams reicht meist die Umhängung der Domain, der DNS-Wert bleibt dann gleich). Warten bis „Valid".
8. Vercel → `talentpool` → Environment Variables: `NEXT_PUBLIC_SITE_URL=https://portal.chef-treff.de` (Production) → Redeploy.
9. Supabase (Plattform-Projekt) → Authentication → URL Configuration: Site URL `https://portal.chef-treff.de`, Redirect `https://portal.chef-treff.de/auth/callback` ergänzen; alte Vercel-URL vorerst behalten.
10. Vercel → `talentpool` → Deployment Protection für Production ausschalten (Preview geschützt lassen).
11. Redirects: `partner.chef-treff.de`, `speaker.chef-treff.de`, `partnerhub.chef-treff.de` → 301 auf `portal.chef-treff.de` erst nach Abschaltung der Alt-Systeme (Checkliste).

## Prüfung
- `https://portal.chef-treff.de/login` lädt, Magic Link kommt zurück auf portal., `/admin` erreichbar.
- `https://team.chef-treff.de` funktioniert weiter; Mail-Links (`portal_url`) zeigen auf portal.

## Rollback
- Domain in Vercel zurück auf das alte Projekt zuordnen, `NEXT_PUBLIC_SITE_URL` zurücksetzen, Redeploy. DNS bleibt unverändert (CNAME zeigt auf Vercel).

## Historie
| Datum | Wer | Ergebnis |
|---|---|---|
| 11.09.2026 | Konrad / Team-Portal | Teil A gestartet: Team-Portal zieht kurzfristig auf `team.chef-treff.de`; Übergabe-Regeln (DNS bei IONOS, drei geschützte Einträge, DMARC strict) dokumentiert; Weiterleitungen alter Team-Pfade in `next.config.ts`. |
