"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
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
