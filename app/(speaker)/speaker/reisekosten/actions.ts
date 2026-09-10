"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import type { ExpensePosition } from "./types";

/**
 * Reisekosten. Alle Wege über die RPCs aus Migration 0031 mit dem
 * Session-Client — `expense_claim` selbst ist für `authenticated` nicht
 * lesbar (Spalten-Grants ohne `bank_secret_id`), die RPCs sind der Vertrag.
 */
const PATH = "/speaker/reisekosten";

export type ExpenseResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[speaker/reisekosten] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireArea("speaker", PATH);
  return createSupabaseServerClient();
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/speaker");
}

/** Entwurf speichern. Ohne `id` nimmt die RPC den offenen Antrag. */
export async function saveClaim(
  positions: ExpensePosition[],
  claimId?: string | null,
): Promise<ExpenseResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_expense_claim", {
    p_data: { ...(claimId ? { id: claimId } : {}), positions },
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data as string } };
}

/**
 * Beleg anmelden, nachdem die Datei im Bucket liegt. Gibt die Asset-ID
 * zurück, die als `receipt_asset_id` an die Position gehört.
 */
export async function registerReceipt(input: {
  profileId: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
}): Promise<ExpenseResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("register_speaker_asset", {
    p_profile_id: input.profileId,
    p_kind: "receipt",
    p_storage_path: input.storagePath,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_session_id: null,
  });
  if (error) return fail(error);
  const result = (data ?? {}) as { id?: string };
  return { ok: true, data: { id: result.id ?? "" } };
}

/**
 * Bankdaten. Die IBAN geht hier einmal hin und nie wieder zurück: die RPC
 * legt sie im Vault ab und liefert danach nur `bank_masked`. Deshalb wird das
 * Feld auch nie vorbefüllt — es gäbe nichts, womit man es füllen könnte.
 */
export async function saveBankDetails(
  claimId: string,
  iban: string,
  bic: string,
  holder: string,
): Promise<ExpenseResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_expense_bank_details", {
    p_claim_id: claimId,
    p_iban: iban,
    p_bic: bic.trim() ? bic : null,
    p_holder: holder,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: undefined };
}

/** Einreichen. Liefert die Rechnungsnummer und löst die Mail an die Freigabe aus. */
export async function submitClaim(
  claimId: string,
): Promise<ExpenseResult<{ invoiceNo: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("submit_expense", { p_claim_id: claimId });
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { invoiceNo: (data as string) ?? "" } };
}
