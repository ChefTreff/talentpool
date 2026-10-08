import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vorlage } from "@/components/partner/fristen-aufgaben";

/**
 * Die aktiven Aufgabenvorlagen, soweit sie die Frist einer Aufgabe bestimmen (PART-099).
 *
 * `deliverable_template` ist für jede Anmeldung lesbar (nur aktive Zeilen, keine Personendaten);
 * gebraucht werden `key`, `product_sku` und `due_rule`, um zu wissen, an welcher Frist der Edition
 * eine Aufgabe hängt. Scheitert das Lesen, kommt eine leere Liste: dann gilt keine Aufgabe als
 * Trägerin einer Frist, und jede Frist steht als eigene Zeile da — doppelt, aber nichts fehlt.
 */
export async function loadFristVorlagen(supabase: SupabaseClient): Promise<Vorlage[]> {
  const { data, error } = await supabase
    .from("deliverable_template")
    .select("key, product_sku, due_rule")
    .eq("active", true);
  if (error) {
    console.error("[fristen] deliverable_template:", error.message);
    return [];
  }
  return (data ?? []) as Vorlage[];
}
