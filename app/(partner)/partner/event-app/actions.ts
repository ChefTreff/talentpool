"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PATH = "/partner/event-app";

export type StepResult = { ok: true } | { ok: false; key: string; detail?: string };

/**
 * Einen Schritt der Event-App als erledigt melden — oder den Haken wieder
 * wegnehmen.
 *
 * Es ist eine **Selbstauskunft**: was in Swapcard passiert, sehen wir nicht.
 * Geprüft wird trotzdem in der Datenbank (`partner_can_edit`), sonst könnte
 * jeder Partner für jeden anderen abhaken.
 */
export async function setEventAppStep(
  orgId: string,
  editionId: string,
  key: string,
  done: boolean,
): Promise<StepResult> {
  await requireArea("partner", PATH);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_org_step", {
    p_org_id: orgId,
    p_topic: "event_app",
    p_key: key,
    p_done: done,
    // Ausdrücklich mitgeben: ohne Edition nähme die RPC die jüngste. Das ist
    // heute dieselbe, aber die Seite weiss es genauer als die Voreinstellung.
    p_edition_id: editionId,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[event-app] set_org_step:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PATH);
  return { ok: true };
}
