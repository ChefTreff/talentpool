"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type DupStatus = "open" | "confirmed_dupe" | "not_dupe";

export async function setDuplicateStatus(
  id: string,
  status: DupStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireArea("admin");
  const admin = createSupabaseAdminClient();

  const { data: before } = await admin
    .from("potential_duplicate")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("potential_duplicate")
    .update({
      status,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "duplicate.decide",
    objectType: "potential_duplicate",
    objectId: id,
    before,
    after: { status },
  });

  revalidatePath("/admin/dubletten");
  return { ok: true };
}
