import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseBrowserKey, supabaseUrl } from "./env";

/**
 * Supabase-Client für Server Components / Server Actions / Route Handler.
 * Nutzt den öffentlichen Schlüssel + Session-Cookie -> RLS greift
 * (Teilnehmer sehen nur eigene Daten).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl()!, supabaseBrowserKey()!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Aufruf aus einer Server Component -> Cookies setzt der Proxy.
        }
      },
    },
  });
}
