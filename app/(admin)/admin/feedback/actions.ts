"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/** Status und Schlagworte eines Feedbacks setzen (TAL-011). Gate hier und in der RPC. */
export async function updateFeedback(id: string, status: "open" | "seen" | "done", tags: string[]): Promise<{ ok: true } | { ok: false; key: string }> {
  await requireAdminSection("feedback");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_feedback", { p_id: id, p_status: status, p_tags: tags });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath("/admin/feedback");
  return { ok: true };
}
