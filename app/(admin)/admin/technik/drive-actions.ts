"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import type { OrdnerRechte } from "@/lib/drive/api";
import { pruefeVerbindung, spiegelNachholen } from "@/lib/drive/server";
import type { Zusammenfassung } from "@/lib/drive/spiegel";
import { ordnerIdAus } from "@/lib/drive/ziel";

/**
 * Admin-Karte „Folien in Drive“ (SPK-023) unter `/admin/technik`.
 *
 * Erst `requireAdminSection("tech")`, dann der Server mit `service_role`
 * (`lib/drive/server.ts`). Den Zielordner setzt die Datenbank selbst nur für
 * den Abschnitt `tech` (`set_edition_slides_folder`, mit Audit) — mit dem
 * Session-Client, nicht mit dem Server-Schlüssel.
 */
const PATH = "/admin/technik";

export type DriveAktion<T = void> = { ok: true; data: T } | { ok: false; key: string; detail?: string };

export async function driveNachholen(editionId: string): Promise<DriveAktion<Zusammenfassung>> {
  const ctx = await requireAdminSection("tech", PATH);
  const r = await spiegelNachholen(editionId, `manual:${ctx.personId ?? "?"}`);
  revalidatePath(PATH);
  if (!r.ok) {
    const key = r.grund === "fehlt" ? "drive_account_missing" : r.grund === "ungueltig" ? "drive_account_invalid" : "drive_run_failed";
    return { ok: false, key, detail: r.detail };
  }
  return { ok: true, data: r.zusammenfassung };
}

export async function drivePruefen(editionId: string): Promise<DriveAktion<OrdnerRechte>> {
  await requireAdminSection("tech", PATH);
  const r = await pruefeVerbindung(editionId);
  if (r.ok) return { ok: true, data: r.rechte };
  const key =
    r.grund === "fehlt" ? "drive_account_missing" : r.grund === "ungueltig" ? "drive_account_invalid" : r.grund === "ohne_ordner" ? "drive_no_folder" : r.grund;
  return { ok: false, key, detail: r.detail };
}

export async function driveOrdnerSetzen(editionId: string, eingabe: string): Promise<DriveAktion> {
  await requireAdminSection("tech", PATH);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_edition_slides_folder", {
    p_edition_id: editionId,
    p_folder_id: ordnerIdAus(eingabe) || null,
  });
  if (error) {
    const f = toRpcFailure(error);
    if (f.key === "unknown" && f.raw) console.error("[admin/technik] set_edition_slides_folder:", f.raw);
    return { ok: false, key: f.key, detail: f.detail };
  }
  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
