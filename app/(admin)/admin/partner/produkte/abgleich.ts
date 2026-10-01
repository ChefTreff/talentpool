import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Abgleich } from "./ProduktExtras";

/**
 * Fremdschlüssel der Produkte in HubSpot und SevDesk (`external_ref`,
 * `object_type = 'product'`, `object_id` = SKU) — für die Anzeige „verknüpft"
 * im Editor (PROD-006). Nur mit der Service-Rolle lesbar; Aufrufer prüfen
 * vorher den Abschnitt `partner`.
 */
export async function ladeAbgleich(admin: SupabaseClient): Promise<Record<string, Abgleich>> {
  const { data } = await admin
    .from("external_ref")
    .select("system, object_id, external_id")
    .eq("object_type", "product")
    .in("system", ["hubspot", "sevdesk"]);
  const out: Record<string, Abgleich> = {};
  for (const r of (data ?? []) as { system: "hubspot" | "sevdesk"; object_id: string; external_id: string }[]) {
    (out[r.object_id] ??= {})[r.system] = r.external_id;
  }
  return out;
}
