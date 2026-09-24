"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  // Gate hier und in der RPC (`can_edit_next_up`): die Tür zum Admin lässt
  // jede Teamrolle ein, der Abschnitt entscheidet selbst.
  await requireAdminSection("nextUp");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(name, args);
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath("/admin/next-up");
  revalidatePath("/start");
  return { ok: true };
}

export async function saveNextUp(data: Record<string, unknown>) {
  return ruf("upsert_next_up_item", { p_data: data });
}
export async function removeNextUp(id: string) {
  return ruf("delete_next_up_item", { p_id: id });
}
