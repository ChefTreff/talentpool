"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import type { AdminResult } from "../../partner/actions";

const PFAD = "/admin/produktion/produkte";

/**
 * Schreibwege des Produktstamms aus der Produktion (PROD-006). Dieselben RPCs
 * wie unter /admin/partner/produkte, aber das Gate ist der Abschnitt
 * `productCatalog`; die Datenbank prüft ihn noch einmal (v6_produktstamm_pflege).
 */
export async function saveProduct(data: Record<string, unknown>): Promise<AdminResult<{ sku: string }>> {
  await requireAdminSection("productCatalog", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data: sku, error } = await supabase.rpc("upsert_product", { p_data: data });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  revalidatePath("/admin/partner/produkte");
  return { ok: true, data: { sku: sku as string } };
}

export async function saveProductComponent(bundleSku: string, componentSku: string, qty: number): Promise<AdminResult> {
  await requireAdminSection("productCatalog", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_product_component", {
    p_bundle_sku: bundleSku,
    p_component_sku: componentSku,
    p_qty: qty,
  });
  if (error) {
    const f = toRpcFailure(error);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  return { ok: true, data: undefined };
}
