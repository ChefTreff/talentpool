# Runbook · Sicherheits-Header und Content-Security-Policy

Seit 11.09.2026 (Fund aus dem Team-Portal-Chat: auf `portal.chef-treff.de` stand nur HSTS) setzt die Plattform auf jede Antwort:

| Header | Wert | Wo |
|---|---|---|
| `X-Frame-Options` | `DENY` | `next.config.ts` |
| `X-Content-Type-Options` | `nosniff` | `next.config.ts` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `next.config.ts` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` — Kamera für den eigenen Ursprung (Check-in-Scanner, Welle 4) | `next.config.ts` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | `next.config.ts` |
| `Content-Security-Policy` (Grundregeln) | `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` | `next.config.ts` |
| `Content-Security-Policy-Report-Only` → später `Content-Security-Policy` | vollständige Richtlinie mit Nonce je Anfrage | `proxy.ts` |

**Vollständige Richtlinie (proxy.ts):** `default-src 'self'`; Skripte nur mit Nonce (`'strict-dynamic'`, Next setzt den Nonce an seine Inline-Skripte, Chunks laden von dort); Styles `'self' 'unsafe-inline'` (React-Inline-Styles); Bilder `'self' data: blob:` + Supabase-Ursprung (signierte und öffentliche Storage-URLs); Verbindungen `'self'` + Supabase `https://…supabase.co` und `wss://…supabase.co` (REST, Storage, Realtime); `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`; `report-uri /api/csp-report`. Lokal zusätzlich `'unsafe-eval'` (React Refresh) und `ws://localhost:*`.

## Scharfschalten
1. Einige Tage mit Report-Only laufen lassen; Verstöße stehen in den Vercel-Logs als `[csp] …` (Route `POST /api/csp-report`, speichert nichts) und lokal in der Browser-Konsole als Report-Only-Warnung.
2. Jeden Verstoß einordnen: eigene Quelle vergessen (Richtlinie in `buildCsp` ergänzen) oder Fremdinhalt/Erweiterung (ignorieren).
3. Vercel-Env `CSP_ENFORCE=true` (Production) setzen, Redeploy — ab dann blockiert der Browser statt zu melden. Zurück: Variable löschen oder auf `false`.

## Prüfen
```bash
curl -sI https://portal.chef-treff.de/login | grep -i -E "x-frame|content-security|x-content-type|referrer|permissions|strict-transport"
```
Erwartet: alle sechs Zeilen, CSP zunächst als `content-security-policy-report-only` mit `nonce-…`.

## Regeln für Code
- Keine eigenen Inline-`<script>`; wenn unvermeidbar, `nonce` aus dem Request-Header `x-nonce` lesen und setzen.
- Externe Skripte, Bilder oder Verbindungen nur nach Aufnahme in `buildCsp` (Entscheidungslog-Eintrag).
- Neue öffentliche Routen ohne Login gehören in `PUBLIC_PATHS`/`PUBLIC_PREFIXES` in `proxy.ts` und prüfen sich selbst (Secret, Signatur).
