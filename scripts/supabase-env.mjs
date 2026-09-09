/**
 * Gemeinsame Env-Auflösung für die Diagnose-Skripte — dieselbe Reihenfolge wie
 * `lib/supabase/env.ts` und `lib/supabase/admin.ts`, damit Skript und App nie
 * gegen verschiedene Projekte laufen.
 *
 * Die Vercel↔Supabase-Integration setzt je nach Stand die klassischen Namen
 * (`ANON_KEY`, `SERVICE_ROLE_KEY`) oder die neuen (`PUBLISHABLE_KEY`,
 * `SECRET_KEY`). Beide werden akzeptiert.
 */

/** `vercel env pull` schreibt für sensible Variablen nur diesen Platzhalter. */
const SENSITIVE_PLACEHOLDER = "[SENSITIVE]";

function real(value) {
  if (!value) return undefined;
  const v = value.trim();
  if (v === "" || v === SENSITIVE_PLACEHOLDER || v.includes("<")) return undefined;
  return v;
}

export const url =
  real(process.env.NEXT_PUBLIC_SUPABASE_URL) || real(process.env.SUPABASE_URL);

export const publicKey =
  real(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  real(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  real(process.env.SUPABASE_ANON_KEY) ||
  real(process.env.SUPABASE_PUBLISHABLE_KEY);

export const secretKey =
  real(process.env.SUPABASE_SERVICE_ROLE_KEY) || real(process.env.SUPABASE_SECRET_KEY);

/**
 * Ein echter Schlüssel ist `sb_secret_…`/`sb_publishable_…` oder ein JWT —
 * jeweils mit echtem Rest. Das Präfix allein würde auch die Beispielwerte aus
 * der Doku durchlassen (`sb_secret_…` mit Auslassungszeichen).
 */
const KEY_PATTERN =
  /^(sb_(secret|publishable)_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_.-]{32,})$/;

function looksLikeKey(value) {
  return KEY_PATTERN.test(value);
}

/** Bricht mit einer klaren Meldung ab, statt später kryptisch zu scheitern. */
export function requireEnv(needSecret = false) {
  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!needSecret && !publicKey)
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY (oder …_PUBLISHABLE_KEY)");
  if (needSecret && !secretKey)
    missing.push("SUPABASE_SERVICE_ROLE_KEY (oder SUPABASE_SECRET_KEY)");

  if (missing.length > 0) {
    console.error(
      `❌ Fehlt in .env.local: ${missing.join(", ")}\n` +
        "   Sensible Vercel-Variablen kommen bei `vercel env pull` nur als [SENSITIVE].\n" +
        "   Echten Wert lokal eintragen, dann `sh scripts/env-pull.sh --worktrees`.\n" +
        "   Aufruf: node --env-file=.env.local scripts/<datei>.mjs",
    );
    process.exit(1);
  }

  const key = needSecret ? secretKey : publicKey;
  if (!looksLikeKey(key)) {
    console.error(
      "❌ Der Schlüssel in .env.local hat kein gültiges Format " +
        "(erwartet `sb_secret_…`, `sb_publishable_…` oder einen JWT `eyJ…`).",
    );
    process.exit(1);
  }
}
