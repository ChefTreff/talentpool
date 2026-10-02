"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export type Ergebnis = { ok: true } | { ok: false; key: string };

/** Foto veröffentlichen/zurückziehen und Credit setzen (TAL-010). Gate hier und in der RPC. */
export async function setPhoto(photoId: string, published: boolean, credit: string): Promise<Ergebnis> {
  await requireAdminSection("photos");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_event_photo", { p_photo_id: photoId, p_published: published, p_credit: credit });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath("/admin/fotos");
  revalidatePath("/fotos");
  return { ok: true };
}

/** Löschwunsch erledigen oder ablehnen (TAL-010). */
export async function handleRemoval(requestId: string, status: "done" | "rejected"): Promise<Ergebnis> {
  await requireAdminSection("photos");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("handle_photo_removal", { p_request_id: requestId, p_status: status });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath("/admin/fotos");
  return { ok: true };
}
