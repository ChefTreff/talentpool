import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseFreigabeZaehler, type FreigabeZaehler } from "@/lib/freigaben";

/**
 * Wartende Freigaben je Art für das Admin-Menü (ADM-072b / ADM-080).
 *
 * Eine **Zugabe**, kein Muss: Fehlt die Funktion (die Migration ist noch nicht angewendet) oder schlägt der
 * Aufruf fehl, kommt `{}` zurück und die Leiste bleibt, wie sie war — eine Fehlerseite wegen eines Zählers
 * wäre schlimmer als kein Zähler. Die Funktion läuft mit den Rechten der angemeldeten Person (SECURITY
 * INVOKER) und nennt nur die Arten, die sie entscheiden darf.
 */
export async function ladeFreigabeZaehler(): Promise<FreigabeZaehler> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("freigabe_zaehler");
    return error ? {} : parseFreigabeZaehler(data);
  } catch {
    return {};
  }
}
