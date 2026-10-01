"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/initiativen/award";
export type Ergebnis = { ok: true } | { ok: false; key: string };

/** Über die Sitzung: die Datenbank prüft den Abschnitt `initiatives`, das Audit trägt die handelnde Person (ADM-024). */
async function ruf(name: string, args: Record<string, unknown>): Promise<Ergebnis> {
  await requireAdminSection("initiatives", PFAD);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(name, args);
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error(`[award] ${name}:`, f.raw);
    return { ok: false, key: f.key };
  }
  revalidatePath(PFAD);
  revalidatePath("/award");
  return { ok: true };
}

export async function setzeStatus(id: string, status: string): Promise<Ergebnis> {
  return ruf("set_award_status", { p_application_id: id, p_status: status });
}

export async function verknuepfeOrganisation(id: string, orgId: string | null): Promise<Ergebnis> {
  return ruf("set_award_organization", { p_application_id: id, p_org_id: orgId });
}

export async function loescheBewerbung(id: string): Promise<Ergebnis> {
  return ruf("delete_award_application", { p_application_id: id });
}
