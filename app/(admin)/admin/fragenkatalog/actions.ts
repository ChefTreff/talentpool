"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type KatalogErgebnis = { ok: true } | { ok: false; key: string; detail?: string };

const PFAD = "/admin/fragenkatalog";

/**
 * Schreiben über die Sitzung: `upsert_question_catalog` prüft den Abschnitt
 * `questionCatalog` in der Datenbank, und das Protokoll trägt die handelnde
 * Person. Revalidiert wird auch die Partner-Fragenseite, denn dort erscheinen
 * die freigegebenen Katalogfragen.
 */
export async function saveQuestion(input: Record<string, unknown>): Promise<KatalogErgebnis> {
  await requireAdminSection("questionCatalog", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_question_catalog", { p_data: input });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[admin/fragenkatalog] upsert_question_catalog:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  revalidatePath("/partner", "layout");
  return { ok: true };
}

export async function reorderQuestions(ids: string[]): Promise<KatalogErgebnis> {
  await requireAdminSection("questionCatalog", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_question_catalog", { p_ids: ids });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[admin/fragenkatalog] reorder_question_catalog:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  return { ok: true };
}
