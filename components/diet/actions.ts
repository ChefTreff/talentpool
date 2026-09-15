"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type DietResult = { ok: true } | { ok: false; key: string; detail?: string };

/**
 * Ernährung eintragen — dieselbe Aktion für Speaker und Volunteers.
 *
 * Das Gate ist bewusst nur `requireUser`: geschrieben wird immer die **eigene**
 * Angabe, und das setzt `set_diet` in der Datenbank durch. Ein Bereichs-Gate
 * hier wäre eine zweite, schwächere Prüfung an einer Stelle, an der die Angabe
 * zu einer Person gehört und nicht zu einem Portal.
 *
 * `path` sagt nur, welche Seite danach neu geladen wird.
 */
export async function saveDiet(input: {
  diet: string | null;
  note: string | null;
  path: string;
}): Promise<DietResult> {
  await requireUser(input.path);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_diet", {
    p_diet: input.diet,
    p_note: input.note,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[diet] set_diet:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(input.path);
  return { ok: true };
}
