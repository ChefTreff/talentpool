import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Der geheime Server-Schlüssel: `SUPABASE_SECRET_KEY` (neues Schema,
 * `sb_secret_…`) vor `SUPABASE_SERVICE_ROLE_KEY` (alter service_role-JWT).
 * Steht bewusst nur hier — diese Datei wird nie aus dem Browser importiert.
 */
function supabaseSecretKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    undefined
  );
}

/**
 * Service-Role-Client — NUR serverseitig (Admin/Migration). Umgeht RLS.
 * Der geheime Schlüssel darf NIE an den Browser gelangen. Vor jeder Nutzung
 * muss serverseitig die Rolle geprüft sein (`requireArea`/`requireRole`).
 */
export function createSupabaseAdminClient() {
  const url = supabaseUrl();
  const secret = supabaseSecretKey();
  if (!url || !secret) {
    throw new Error(
      "Supabase-Zugang fehlt: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY " +
        "(bzw. SUPABASE_SERVICE_ROLE_KEY) nur serverseitig setzen.",
    );
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
