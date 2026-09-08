/**
 * Supabase-Env an einer Stelle. Die Vercel↔Supabase-Integration kann entweder die
 * klassischen Namen (ANON_KEY) oder die neuen (PUBLISHABLE_KEY) setzen — die App
 * akzeptiert beide. `process.env.NEXT_PUBLIC_*` steht hier wörtlich, damit Next die
 * Werte auch in Client-Bundles zur Build-Zeit einsetzt.
 */
export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

export function supabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY
  );
}

/** true, wenn URL und öffentlicher Key vorhanden sind (sonst läuft die App anonym). */
export function hasSupabaseEnv(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
