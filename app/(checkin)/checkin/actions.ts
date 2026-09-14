"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/** Was das Kiosk nach einem Scan anzeigt. Mehr kommt aus der RPC nicht zurück. */
export type ScanResult = {
  status: "ok" | "already" | "invalid" | "unknown" | "error";
  holderName: string | null;
  passType: string | null;
  checkedInAt: string | null;
  /** Nur bei `error`: Text für die Zeile unter dem Ergebnis. */
  message?: string;
};

/**
 * Ein Scan. Die Prüfung steckt vollständig in `checkin_scan()` — hier wird
 * nichts entschieden, nur durchgereicht und in die Form gebracht, die die
 * Ansicht braucht.
 *
 * Der Barcode geht unverändert an die Datenbank: Barcodes sind zeichengenau,
 * und ein „hilfreiches" Zurechtschneiden im Client würde am Einlass Codes
 * gleichmachen, die verschieden sind.
 */
export async function scanAction(barcode: string, device: string | null): Promise<ScanResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("checkin_scan", {
    p_barcode: barcode,
    p_device: device,
  });

  if (error) {
    return {
      status: "error",
      holderName: null,
      passType: null,
      checkedInAt: null,
      message: toRpcFailure(error).key,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { status: string; holder_name: string | null; pass_type: string | null; checked_in_at: string | null }
    | undefined;

  if (!row) {
    return { status: "error", holderName: null, passType: null, checkedInAt: null, message: "empty" };
  }

  return {
    status: (["ok", "already", "invalid", "unknown"].includes(row.status)
      ? row.status
      : "error") as ScanResult["status"],
    holderName: row.holder_name,
    passType: row.pass_type,
    checkedInAt: row.checked_in_at,
  };
}
