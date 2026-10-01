"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/initiativen";

export type Ergebnis = { ok: true; n?: number } | { ok: false; key: string; detail?: string };

async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  await requireAdminSection("initiatives", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  return { ok: true, n: typeof data === "number" ? data : undefined };
}

/**
 * Funnel-Stufe setzen. `abgelehnt` ist eine Stufe, kein Löschen. Mit Notiz
 * entsteht eine Zeile im Verlauf (ADM-022), auch ohne Stufenwechsel.
 */
export async function setStage(orgEditionId: string, stage: string, note?: string): Promise<Ergebnis> {
  return ruf("set_initiative_stage", { p_org_edition_id: orgEditionId, p_stage: stage || null, p_note: note?.trim() || null });
}

export type VerlaufZeile = { stage: string | null; note: string | null; changed_at: string; changed_by_name: string | null };

/** Verlauf einer Initiative (ADM-022): Stufenwechsel und Notizen, neueste zuerst. */
export async function ladeVerlauf(orgEditionId: string): Promise<{ ok: true; zeilen: VerlaufZeile[] } | { ok: false; key: string }> {
  await requireAdminSection("initiatives", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("initiative_stage_history", { p_org_edition_id: orgEditionId });
  if (error) return { ok: false, key: toRpcFailure(error).key };
  return { ok: true, zeilen: (data ?? []) as VerlaufZeile[] };
}

/**
 * Vereinbarte Leistungen setzen.
 *
 * Die Liste **ersetzt** den Stand; was hier nicht steht, ist danach nicht mehr
 * vereinbart. Zeilen aus HubSpot oder dem Messeshop bleiben unberührt — die
 * Datenbank grenzt das auf `source = 'agreement'` ein, nicht diese Aktion.
 */
export async function setProducts(
  orgEditionId: string,
  items: { sku: string; qty: number }[],
): Promise<Ergebnis> {
  return ruf("assign_org_products", { p_org_edition_id: orgEditionId, p_items: items });
}
