"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function setVocabActive(
  vocabulary: string,
  key: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireArea("admin");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("vocab_term")
    .update({ active })
    .eq("vocabulary", vocabulary)
    .eq("key", key);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "vocab.toggle",
    objectType: "vocab_term",
    objectId: `${vocabulary}:${key}`,
    before: { active: !active },
    after: { active },
  });

  revalidatePath("/admin/vokabular");
  return { ok: true };
}
