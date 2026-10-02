"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/** Löschwunsch zu einem Foto (TAL-010) — das Team entscheidet, kein Selbstlöschen. */
export async function requestRemoval(photoId: string, note: string): Promise<{ ok: true } | { ok: false; key: string }> {
  await requireArea("talent", "/fotos");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_photo_removal", { p_photo_id: photoId, p_note: note });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  revalidatePath("/fotos");
  return { ok: true };
}
