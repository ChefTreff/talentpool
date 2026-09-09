# Runbook · Domain-Umzug (Team-Portal → team., Plattform → portal.)

**Auslöser:** Go-live der Plattform unter `portal.chef-treff.de` (spätestens 14.10.2026). Das alte Team-Portal (eigenes Supabase-Projekt `teamportal`, Frankfurt) belegt die Domain heute.
**Empfehlung:** Teil A Anfang Oktober, Teil B am Go-live-Tag. Beide Teile sind in Minuten rückrollbar (DNS/Domain-Zuordnung zurück).

## Voraussetzungen
- Zugriff auf DNS (Registrar) für `chef-treff.de`, auf beide Vercel-Projekte und beide Supabase-Projekte.
- Google-OAuth-Client des Team-Portals (falls SSO genutzt) bekannt.

## Teil A · Team-Portal auf `team.chef-treff.de` (parallel zu portal.)
1. Vercel → Projekt des Team-Portals → Settings → Domains → `team.chef-treff.de` hinzufügen; DNS-Eintrag laut Vercel-Anzeige setzen (CNAME). Warten bis „Valid".
2. Supabase-Projekt `teamportal` → Authentication → URL Configuration: Site URL `https://team.chef-treff.de`, Redirect-URL `https://team.chef-treff.de/**` **zusätzlich** eintragen (alte behalten).
3. Falls Google-SSO: Google Cloud Console → OAuth-Client → Authorized redirect URIs um die neue Callback-URL ergänzen.
4. Login auf `team.chef-treff.de` testen (zwei Personen). Team informieren: „Ab sofort team.chef-treff.de nutzen, portal. läuft noch bis <Datum>."
5. Hartkodierte Links im Team-Portal (Mails, Bookmarks, Slack-Pins) auf `team.` umstellen.

## Teil B · Plattform auf `portal.chef-treff.de` (Go-live)
6. Vercel → Team-Portal-Projekt → Domain `portal.chef-treff.de` entfernen.
7. Vercel → Projekt `talentpool` → Domains → `portal.chef-treff.de` hinzufügen (DNS-Eintrag prüfen/anpassen). Warten bis „Valid".
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
| TODO | | |
