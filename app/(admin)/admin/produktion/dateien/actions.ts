"use server";

import { revalidatePath } from "next/cache";
import { requireAnyAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Zielgruppe einer vorhandenen Editionsdatei ändern (PROD-009) — etwa den
 * Partner-Hallenplan für Speaker sperren, wenn es einen eigenen Speaker-Plan
 * gibt. `set_edition_file` mit `id` ändert nur, was mitkommt; `kind` muss mit,
 * sonst fiele die Art auf `sonstiges` zurück. Über die Sitzung: die Funktion
 * prüft die Rolle, das Audit trägt die handelnde Person.
 */
export async function setzeZielgruppe(
  id: string,
  kind: string,
  audience: string[],
): Promise<{ ok: true } | { ok: false; key: string }> {
  await requireAnyAdminSection(["productionFiles", "videos"], "/admin/produktion/dateien");
  if (audience.length === 0) return { ok: false, key: "invalid_audience" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_edition_file", { p_data: { id, kind, audience } });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[dateien] set_edition_file:", f.raw);
    return { ok: false, key: f.key };
  }
  revalidatePath("/admin/produktion/dateien");
  revalidatePath("/admin/medien");
  return { ok: true };
}
