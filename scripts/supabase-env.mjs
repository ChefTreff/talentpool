/**
 * Gemeinsame Env-Auflösung für die Diagnose-Skripte.
 * Neues Supabase-Schema (publishable/secret) vor altem (anon/service_role) —
 * dieselbe Reihenfolge wie in `lib/supabase/env.ts`.
 */
export const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

export const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

export const secretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Bricht mit einer klaren Meldung ab, statt später kryptisch zu scheitern. */
export function requireEnv(needSecret = false) {
  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!needSecret && !publicKey)
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (oder …_ANON_KEY)");
  if (needSecret && !secretKey)
    missing.push("SUPABASE_SECRET_KEY (oder SUPABASE_SERVICE_ROLE_KEY)");
  if (missing.length > 0) {
    console.error(
      `❌ Fehlt in .env.local: ${missing.join(", ")}\n` +
        "   Aufruf: node --env-file=.env.local scripts/<datei>.mjs",
    );
    process.exit(1);
  }
}
