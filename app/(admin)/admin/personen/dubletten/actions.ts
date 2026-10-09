"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

const PFAD = "/admin/personen/dubletten";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DupStatus = "open" | "confirmed_dupe" | "not_dupe";
export type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

export async function setDuplicateStatus(
  id: string,
  status: DupStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireAdminSection("duplicates");
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

  revalidatePath(PFAD);
  return { ok: true };
}

/**
 * Zusammenführen, Rückweg und Suche laufen über die Sitzung (ADM-036): die
 * Datenbank prüft den Abschnitt selbst, und Protokoll wie Audit tragen die
 * handelnde Person.
 */
export async function suchenDubletten(): Promise<{ ok: true; neu: number } | { ok: false; key: string }> {
  await requireAdminSection("duplicates", PFAD);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("duplicate_scan");
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[dubletten] duplicate_scan:", f.raw);
    return { ok: false, key: f.key };
  }
  revalidatePath(PFAD);
  return { ok: true, neu: Number(data ?? 0) };
}

export async function fuehreZusammen(bleibt: string, geht: string): Promise<Ergebnis> {
  await requireAdminSection("duplicates", PFAD);
  if (!UUID.test(bleibt) || !UUID.test(geht)) return { ok: false, key: "person_not_found" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("merge_persons", { p_survivor: bleibt, p_merged: geht });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[dubletten] merge_persons:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  revalidatePath(`/admin/personen/${bleibt}`);
  return { ok: true };
}

export async function nimmZurueck(logId: string): Promise<Ergebnis> {
  await requireAdminSection("duplicates", PFAD);
  if (!UUID.test(logId)) return { ok: false, key: "merge_not_found" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unmerge_persons", { p_log_id: logId });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[dubletten] unmerge_persons:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PFAD);
  return { ok: true };
}

/**
 * Zwei Personen von Hand gegenüberstellen: je Feld eine E-Mail-Adresse oder
 * eine Personen-ID. Liefert die beiden IDs für die Vorschau — ändert nichts.
 */
export async function findePaar(
  erste: string,
  zweite: string,
): Promise<{ ok: true; a: string; b: string } | { ok: false; key: string; feld?: 1 | 2 }> {
  await requireAdminSection("duplicates", PFAD);
  const admin = createSupabaseAdminClient();
  async function finde(eingabe: string): Promise<string | null> {
    const wert = eingabe.trim();
    if (!wert) return null;
    if (UUID.test(wert)) {
      const { data } = await admin.from("person").select("id").eq("id", wert).is("deleted_at", null).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    }
    const { data } = await admin.from("person_email").select("person_id").eq("email", wert.toLowerCase()).maybeSingle();
    return (data?.person_id as string | undefined) ?? null;
  }
  const [a, b] = await Promise.all([finde(erste), finde(zweite)]);
  if (!a) return { ok: false, key: "person_not_found", feld: 1 };
  if (!b) return { ok: false, key: "person_not_found", feld: 2 };
  if (a === b) return { ok: false, key: "same_person", feld: 2 };
  return { ok: true, a, b };
}
