/**
 * Supabase-Zugangsdaten aus der Env — beide Namensschemata.
 *
 * Supabase hat die Schlüssel umbenannt: der `anon`-JWT heißt jetzt
 * *publishable key* (`sb_publishable_…`), der `service_role`-JWT *secret key*
 * (`sb_secret_…`). Die Vercel-Integration schreibt seit dem Neuaufsetzen des
 * Projekts (Frankfurt, 09.09.2026) die neuen Namen. Wir lesen neu vor alt,
 * damit dieselbe Codebasis mit beiden Ständen läuft.
 *
 * Die Zugriffe stehen bewusst ausgeschrieben da: Next ersetzt nur literale
 * `process.env.NEXT_PUBLIC_…`-Ausdrücke im Client-Bundle, keine berechneten.
 */

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

/**
 * Schlüssel für den Browser und für Session-Clients: publishable (neu) vor
 * anon (alt). Beide sind öffentlich — RLS ist der Schutz, nicht der Schlüssel.
 */
export function supabaseBrowserKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

/** Sind URL und öffentlicher Schlüssel gesetzt? Sonst läuft die App anonym. */
export function hasSupabaseConfig(): boolean {
  return Boolean(supabaseUrl() && supabaseBrowserKey());
}
