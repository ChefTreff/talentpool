import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseNeueSpeakerZahl } from "@/lib/neue-speaker";

/**
 * Zahl der neuen Speaker von Partnern für das Admin-Menü (ADM-084).
 *
 * Eine **Zugabe**, kein Muss — wie `ladeFreigabeZaehler`: Fehlt die Funktion (die Migration ist noch nicht angewendet), hat
 * die Person kein Recht darauf oder schlägt der Aufruf fehl, kommt `null` zurück und die Leiste bleibt, wie sie war. Eine
 * Fehlerseite wegen eines Zählers wäre schlimmer als kein Zähler. Welche Zeilen mitzählen, entscheidet die Funktion
 * (`new_speaker_count`: dieselbe Regel und dasselbe Tor wie die Liste).
 */
export async function ladeNeueSpeakerZahl(): Promise<number | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("new_speaker_count");
    return error ? null : parseNeueSpeakerZahl(data);
  } catch {
    return null;
  }
}
