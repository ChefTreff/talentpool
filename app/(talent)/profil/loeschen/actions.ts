"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type LoeschErgebnis =
  | { ok: true; status: "done" | "pending" }
  | { ok: false; key: string };

/**
 * Löschung auslösen.
 *
 * Ob sofort gelöscht wird oder ein Antrag entsteht, entscheidet die Datenbank —
 * nicht diese Aktion. Wer die Hürden hier noch einmal prüfte, hätte zwei
 * Wahrheiten, und die falsche wäre die, die dem Menschen angezeigt wird.
 */
export async function requestDeletion(reason: string): Promise<LoeschErgebnis> {
  await requireUser("/profil/loeschen");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_profile_deletion", {
    p_reason: reason.trim() || null,
  });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath("/profil/loeschen");
  return { ok: true, status: data === "done" ? "done" : "pending" };
}
