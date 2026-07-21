"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function setVocabActive(
  vocabulary: string,
  key: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("vocab_term")
    .update({ active })
    .eq("vocabulary", vocabulary)
    .eq("key", key);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/vokabular");
  return { ok: true };
}
