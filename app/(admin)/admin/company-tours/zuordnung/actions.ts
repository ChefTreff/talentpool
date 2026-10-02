"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/company-tours/zuordnung";
export type Ergebnis = { ok: true; n?: number } | { ok: false; key: string };

/** Über die Sitzung: die Datenbank prüft `tourAssignment`, das Audit trägt die Person (ADM-045). */
async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  await requireAdminSection("tourAssignment", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error(`[tour-zuordnung] ${name}:`, f.raw);
    return { ok: false, key: f.key };
  }
  revalidatePath(PFAD);
  revalidatePath("/admin/company-tours");
  return { ok: true, n: typeof data === "number" ? data : undefined };
}

export async function touren() {
  return ruf("ensure_company_tours", {});
}
export async function setzeTyp(tourId: string, typ: string) {
  return ruf("set_company_tour_type", { p_tour_id: tourId, p_type: typ || null });
}
export async function ordneZu(stopId: string, orgId: string) {
  return ruf("assign_tour_stop", { p_stop_id: stopId, p_org_id: orgId || null });
}
export async function tausche(a: string, b: string) {
  return ruf("swap_tour_stops", { p_stop_a: a, p_stop_b: b });
}
