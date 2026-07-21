import { createClient } from "@supabase/supabase-js";

/**
 * Service-Role-Client — NUR serverseitig (Admin/Migration). Umgeht RLS.
 * Der Service-Role-Key darf NIE an den Browser gelangen. Vor jeder Nutzung
 * muss serverseitig is_staff() geprüft sein.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL fehlen (nur serverseitig setzen).",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
