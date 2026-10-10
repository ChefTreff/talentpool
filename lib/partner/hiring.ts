import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toRpcFailure } from "@/lib/rpc-error";
import type { HiringErgebnis, HiringSpeichern } from "@/components/partner/hiring";

/**
 * „Wen sucht ihr?“ (K-94 Stufe 2a, PART-107) — die Schreibwege hinter den Actions von Partnerportal und Admin. Beide rufen sie mit dem Sitzungs-Client nach ihrem eigenen Gate auf;
 * die RPCs prüfen Recht (`partner_can_edit`: primary_ops, additional, signing oder Team), Pflicht, Vokabular und das Limit selbst. Kein `service_role`.
 */

function fehler(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[hiring] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

/** Eintrag anlegen (`id` leer) oder ändern. */
export async function hiringSpeichern(supabase: SupabaseClient, input: HiringSpeichern): Promise<HiringErgebnis<{ id: string }>> {
  const { data, error } = await supabase.rpc("set_org_hiring", {
    p_org_id: input.orgId,
    p_id: input.id,
    p_career_opportunity: input.careerOpportunity,
    p_function_area: input.functionArea,
    p_role_text: input.roleText,
    p_skills: input.skills,
    p_study_fields: input.studyFields,
    p_published: input.published,
    p_edition_id: input.editionId,
  });
  if (error) return fehler(error);
  return { ok: true, data: { id: data as string } };
}

export async function hiringEntfernen(supabase: SupabaseClient, id: string): Promise<HiringErgebnis> {
  const { error } = await supabase.rpc("delete_org_hiring", { p_id: id });
  if (error) return fehler(error);
  return { ok: true, data: undefined };
}
