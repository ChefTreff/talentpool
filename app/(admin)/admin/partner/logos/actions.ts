"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/partner/logos";

/**
 * Logokategorie eines Partners setzen oder leeren (ADM-046). Leer heisst: aus
 * der Sponsoring-Stufe, sonst „Official". Über die Sitzung — die Datenbank
 * prüft den Abschnitt `logoWall`, und das Audit trägt die handelnde Person.
 */
export async function setzeKategorie(
  orgEditionId: string,
  kategorie: string | null,
): Promise<{ ok: true; wirksam: string } | { ok: false; key: string }> {
  await requireAdminSection("logoWall", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_logo_category", {
    p_org_edition_id: orgEditionId,
    p_category: kategorie,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[logos] set_logo_category:", f.raw);
    return { ok: false, key: f.key };
  }
  revalidatePath(PFAD);
  return { ok: true, wirksam: String(data ?? "") };
}
