import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Der geheime Server-Schlüssel: klassischer `service_role`-JWT oder der neue
 * Secret Key der Vercel↔Supabase-Integration. Der Zugriff steht bewusst nur
 * hier — diese Datei wird nie aus dem Browser importiert.
 */
function serviceKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    undefined
  );
}

/**
 * Ein echter Schlüssel ist `sb_secret_<base62>` oder ein JWT (`eyJ…`).
 *
 * Zwei Platzhalter sehen sonst wie ein gesetzter Wert aus und scheitern erst
 * beim ersten Aufruf mit „Invalid API key": `[SENSITIVE]` aus
 * `vercel env pull` (sensible Variablen werden nie ausgeliefert) und der
 * Beispielwert `sb_secret_…` aus der Doku. Deshalb reicht das Präfix nicht —
 * geprüft wird auch, dass nur ASCII-Schlüsselzeichen folgen.
 */
const SECRET_PATTERN = /^(sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_.-]{32,})$/;

function looksLikeKey(value: string): boolean {
  return SECRET_PATTERN.test(value);
}

/**
 * Service-Role-Client — NUR serverseitig (Admin/Migration). Umgeht RLS.
 * Der geheime Schlüssel darf NIE an den Browser gelangen. Vor jeder Nutzung
 * muss serverseitig die Rolle geprüft sein (`requireArea`/`requireRole`).
 */
export function createSupabaseAdminClient() {
  const url = supabaseUrl();
  const secret = serviceKey();

  if (!url || !secret) {
    throw new Error(
      "Supabase-Zugang fehlt: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY " +
        "(oder SUPABASE_SECRET_KEY) nur serverseitig setzen.",
    );
  }

  if (!looksLikeKey(secret)) {
    throw new Error(
      "Der geheime Supabase-Schlüssel hat kein gültiges Format (erwartet `sb_secret_…` " +
        "oder einen JWT `eyJ…`). Das ist ein Platzhalter aus `vercel env pull` — sensible " +
        "Variablen liefert Vercel nie aus. Echten Wert lokal in `.env.local` eintragen und " +
        "mit `sh scripts/env-pull.sh --worktrees` verteilen; siehe docs/zugangs-liste.md.",
    );
  }

  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
