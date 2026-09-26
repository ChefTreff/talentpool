"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  // Bis PORT1 hing der Schutz allein an der RPC: die Tür zum Admin-Bereich stand
  // nur `admin` offen, also war jede Action dahinter implizit gedeckt. Jetzt
  // kommt jede Teamrolle durch die Tür — das Gate gehört hierher.
  await requireAdminSection("videos");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(name, args);
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath("/admin/videos");
  return { ok: true };
}

export async function saveVideo(data: Record<string, unknown>) {
  return ruf("upsert_portal_video", { p_data: data });
}
export async function removeVideo(id: string) {
  return ruf("delete_portal_video", { p_id: id });
}

/** PART-072: Links je Schlüssel (`portal_link`), zuerst die Store-Links der Event-App. */
export async function saveLink(data: Record<string, unknown>) {
  return ruf("upsert_portal_link", { p_data: data });
}
export async function removeLink(id: string) {
  return ruf("delete_portal_link", { p_id: id });
}
