"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/loeschantraege";

export type Ergebnis = { ok: true } | { ok: false; key: string };

/**
 * Einen Antrag auflösen.
 *
 * `delete` ist nicht rückgängig zu machen, `reject` schickt die Begründung als
 * Mail an die Person — beides prüft die Datenbank, nicht diese Aktion.
 */
export async function resolveRequest(
  id: string,
  action: "delete" | "reject",
  note: string,
): Promise<Ergebnis> {
  await requireArea("admin", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_deletion_request", {
    p_id: id,
    p_action: action,
    p_note: note.trim() || null,
  });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath(PFAD);
  return { ok: true };
}
