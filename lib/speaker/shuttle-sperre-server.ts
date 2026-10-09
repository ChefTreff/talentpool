import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sperreAusAntwort, type ShuttleSperre } from "./shuttle-sperre";

/**
 * Der Stand der Shuttle-Sperre für ein Profil (LEAD-065), gelesen mit der Sitzung. `locked` gilt für den Aufrufer: das Speaker-Team ist nie
 * gesperrt. Kommt keine Antwort (Fehler, kein Recht), bietet die Seite alles an wie bisher — die Datenbank sperrt trotzdem, und der Fehler
 * `shuttle_locked` sagt es dann im Formular.
 */
export async function ladeShuttleSperre(supabase: SupabaseClient, profileId: string): Promise<ShuttleSperre | null> {
  const { data, error } = await supabase.rpc("shuttle_lock_status", { p_profile_id: profileId });
  if (error) {
    if (error.code !== "42501" && error.code !== "28000") console.error("[shuttle] shuttle_lock_status:", error.message);
    return null;
  }
  return sperreAusAntwort(data);
}
