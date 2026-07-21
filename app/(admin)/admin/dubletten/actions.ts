"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type DupStatus = "open" | "confirmed_dupe" | "not_dupe";

export async function setDuplicateStatus(
  id: string,
  status: DupStatus,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaff();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("potential_duplicate")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/dubletten");
  return { ok: true };
}
