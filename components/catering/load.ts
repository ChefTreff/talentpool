import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CateringCoverage, CateringNote, CateringRow } from "./CateringView";

/**
 * Die drei Catering-Abfragen an einer Stelle — Produktion und Admin zeigen
 * dieselben Zahlen, nur mit anderem Rahmen.
 */
export async function loadCatering(editionId: string | null) {
  const supabase = await createSupabaseServerClient();
  const args = { p_edition_id: editionId };
  const [{ data: summary }, { data: notes }, { data: coverage }] = await Promise.all([
    supabase.rpc("catering_summary", args),
    supabase.rpc("catering_notes", args),
    supabase.rpc("catering_coverage", args),
  ]);
  return {
    summary: (summary ?? []) as CateringRow[],
    notes: (notes ?? []) as CateringNote[],
    coverage: (coverage ?? []) as CateringCoverage[],
  };
}
