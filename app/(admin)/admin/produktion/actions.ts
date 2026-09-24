"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Schreibwege der Produktion. Mit dem **Sitzungs-Client**, nicht service_role:
 * `is_production_team()` prüft in der Datenbank, und genau diese Prüfung wollen
 * wir hier — das Gate davor sortiert nur vor.
 *
 * Die Regie-Cues liegen seit 0101 in `components/regie/actions.ts`: sie werden
 * auch aus dem Lead-Portal geschrieben, und die Rechteregel dafür steht in der
 * Datenbank (`can_edit_regie`).
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[produktion] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

const PATHS = ["/admin/produktion", "/admin/produktion/staende", "/admin/produktion/bestellungen"] as const;
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

async function client() {
  await requireAdminSection("production", PATHS[0]);
  return createSupabaseServerClient();
}

export async function setBoothCheck(input: {
  orgEditionId: string;
  sku: string;
  checked: boolean;
  note?: string | null;
}): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_booth_service_check", {
    p_org_edition_id: input.orgEditionId,
    p_product_sku: input.sku,
    p_checked: input.checked,
    p_note: input.note ?? null,
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}
