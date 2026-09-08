# Runbook · Key-Rotation

**Auslöser:** Turnusmäßiger Tausch, Verdacht auf Leak, Personalwechsel.

> Werte stehen **nur** in der Vercel-Env (lokal `vercel env pull .env.local`).
> Nie in Chat, Repo, Drive oder Screenshots. Die Liste der Schlüssel führt
> `docs/zugangs-liste.md`.

## Reihenfolge (immer gleich)
1. Neuen Schlüssel im Quellsystem erzeugen — **alten noch nicht löschen**.
2. Neuen Wert in Vercel setzen (Production, Preview, Development getrennt).
3. Deployment auslösen, damit der neue Wert greift.
4. Funktion prüfen (siehe Tabelle).
5. Erst dann den alten Schlüssel im Quellsystem widerrufen.
6. Datum in `docs/zugangs-liste.md` eintragen.

## Schlüssel und Prüfschritt
| Env-Variable | System | Prüfung nach dem Tausch |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | `/admin` lädt Kennzahlen |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Login per Magic-Link |
| `RESEND_API_KEY` | Resend | `/admin/mail` → Testmail, `mail_log` zeigt `sent` mit `provider_id` |
| Vivenu-Token | Vivenu | TODO (Welle 1) |
| Swapcard-Token | Swapcard | TODO (Welle 3) |
| HubSpot-Token | HubSpot | TODO (Welle 3) |
| Webhook-Secrets | make.com | TODO (Welle 1) — Signaturprüfung schlägt bei falschem Secret fehl |

## Sofort-Rotation bei Leak
Reihenfolge umkehren: **erst widerrufen**, dann neu erzeugen und einsetzen.
Kurzer Ausfall ist besser als ein gültiger Schlüssel in fremder Hand.
Danach [incident.md](incident.md).

## Historie
| Datum | Wer | Was |
|---|---|---|
| TODO | | |
