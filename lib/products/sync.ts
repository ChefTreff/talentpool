import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertHubspotProduct, type ProductOut } from "@/lib/hubspot/products";
import { upsertSevdeskPart } from "@/lib/sevdesk/parts";
import { hasSevdeskToken } from "@/lib/sevdesk/client";

export type SyncSystem = "hubspot" | "sevdesk";

export type SyncErgebnis = {
  system: SyncSystem;
  jobId: number | null;
  /** Neu drüben angelegt. */
  created: number;
  /** Drüben geändert. */
  updated: number;
  /** Bewusst nicht hinausgegangen — mit Grund. */
  skipped: number;
  failed: number;
  /** Warum nichts passiert ist, wenn nichts passiert ist. */
  skippedReason?: string;
};

type Zeile = ProductOut & { external_id: string | null };

/**
 * Den Produktstamm hinausschreiben.
 *
 * **Idempotent je SKU.** Der erste Lauf legt an und merkt sich den
 * Fremdschlüssel, jeder weitere ändert. Bricht ein Artikel ab, laufen die
 * übrigen weiter und der Fehler steht in `integration.sync_error` — ein
 * Abbruch beim ersten Problem hiesse, dass ein Tippfehler in einem Artikel den
 * ganzen Stamm aufhält.
 *
 * `supabase` ist der Client des Teammitglieds: die RPCs prüfen
 * `is_partner_team()` selbst. `admin` schreibt nur Protokoll und
 * Fremdschlüssel — nach der Rollenprüfung, nie davor.
 */
export async function syncProducts(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  system: SyncSystem,
  triggeredBy: string,
): Promise<SyncErgebnis> {
  const out: SyncErgebnis = { system, jobId: null, created: 0, updated: 0, skipped: 0, failed: 0 };

  const { data, error } = await supabase.rpc("products_for_sync", { p_system: system });
  if (error) throw new Error(error.message);
  const zeilen = (data ?? []) as Zeile[];

  // Ohne Zugang passiert nichts, und zwar sichtbar: ein stiller Trockenlauf,
  // der „0 Fehler" meldet, ist schlimmer als eine klare Absage.
  const kein_zugang =
    system === "hubspot"
      ? !process.env.HUBSPOT_ACCESS_TOKEN?.trim()
      : !hasSevdeskToken();
  if (kein_zugang) {
    out.skipped = zeilen.length;
    out.skippedReason = system === "hubspot" ? "HUBSPOT_ACCESS_TOKEN fehlt" : "SEVDESK_API_TOKEN fehlt";
    return out;
  }

  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: system,
    p_direction: "out",
    p_job_type: "product_sync",
    p_triggered_by: triggeredBy,
  });
  out.jobId = typeof jobId === "number" ? jobId : null;

  for (const z of zeilen) {
    try {
      const res =
        system === "hubspot"
          ? await upsertHubspotProduct(z, z.external_id)
          : await upsertSevdeskPart(z, z.external_id);
      if (res.angelegt) out.created += 1;
      else out.updated += 1;
      // Den Schlüssel erst merken, wenn drüben etwas steht — andersherum
      // zeigte die Referenz auf einen Artikel, den es nie gab.
      if (res.id !== z.external_id) {
        await admin.rpc("set_product_external_ref", {
          p_sku: z.sku,
          p_system: system,
          p_external_id: res.id,
        });
      }
    } catch (fehler) {
      out.failed += 1;
      const text = fehler instanceof Error ? fehler.message : String(fehler);
      console.error(`[product-sync] ${system} ${z.sku}:`, text);
      if (out.jobId !== null) {
        await admin.rpc("record_sync_error", {
          p_job_id: out.jobId,
          p_object_type: "product",
          p_object_id: z.sku,
          p_message: text.slice(0, 500),
        });
      }
    }
  }

  if (out.jobId !== null) {
    await admin.rpc("finish_sync_job", {
      p_id: out.jobId,
      p_status: out.failed === 0 ? "ok" : out.created + out.updated > 0 ? "partial" : "failed",
      p_stats: { created: out.created, updated: out.updated, skipped: out.skipped, failed: out.failed },
    });
  }
  return out;
}
