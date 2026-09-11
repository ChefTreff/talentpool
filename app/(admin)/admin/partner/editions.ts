import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminEdition } from "./types";

/**
 * Editionen mit ihren Integrations-Kennungen.
 *
 * `hubspot_editions` zeigt nur, was schon eine Pipeline hat, und kennt vivenu
 * und Swapcard nicht — für die Verwaltung braucht es aber gerade die noch
 * leeren Editionen. Gelesen wird deshalb `event` direkt (SELECT ist für
 * Angemeldete erlaubt); geschrieben wird ausschliesslich über
 * `set_edition_hubspot` / `set_edition_vivenu` / `set_edition_swapcard`.
 */
export async function loadEditions(supabase: SupabaseClient): Promise<AdminEdition[]> {
  const { data } = await supabase
    .from("event")
    .select(
      "id,name,slug,start_date,hubspot_pipeline_id,hubspot_onboarding_stage_id,hubspot_done_stage_id,vivenu_event_id,swapcard_event_id",
    )
    .eq("is_edition", true)
    .order("start_date", { ascending: false, nullsFirst: false });
  return (data ?? []) as AdminEdition[];
}

/** Die gewünschte Edition, sonst die neueste. */
export function pickEdition(
  editions: AdminEdition[],
  wanted?: string,
): AdminEdition | null {
  return editions.find((e) => e.id === wanted) ?? editions[0] ?? null;
}
