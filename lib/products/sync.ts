import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findHubspotProduct, upsertHubspotProduct, type ProductOut } from "@/lib/hubspot/products";
import { findSevdeskPart, upsertSevdeskPart } from "@/lib/sevdesk/parts";
import { hasSevdeskToken } from "@/lib/sevdesk/client";

export type SyncSystem = "hubspot" | "sevdesk";

export type SyncErgebnis = {
  system: SyncSystem;
  jobId: number | null;
  /** Trockenlauf: gelesen und verglichen, nichts geschrieben. */
  dryRun: boolean;
  /** Neu drüben angelegt — im Trockenlauf: **würde** angelegt. */
  created: number;
  /** Drüben geändert — im Trockenlauf: **würde** geändert. */
  updated: number;
  /** Bewusst nicht hinausgegangen — mit Grund. */
  skipped: number;
  failed: number;
  /**
   * Jeder betrachtete Artikel mit dem, was mit ihm geschähe. Genau diese Liste
   * entscheidet, ob ein Lauf sauber ist: steht bei einem Artikel `create`, den es
   * drüben längst gibt, stimmt die Artikelnummer nicht überein — und ein scharfer
   * Lauf legte ihn ein zweites Mal an. Aus ihr wählt das Team auch aus, was
   * wirklich hinausgehen soll (INV0, Konrad 21.09.2026).
   */
  artikel: { sku: string; name: string; category: string | null; aktion: "create" | "update" }[];
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
 * **`dryRun` ist die Vorgabe der Route.** Er liest denselben Weg (gemerkter
 * Fremdschlüssel, sonst Suche über Artikelnummer beziehungsweise SKU) und sagt
 * je Artikel, ob er drüben schon steht — schreibt aber nichts. Damit lässt sich
 * vor dem ersten scharfen Lauf sehen, wie viele Artikel wirklich neu wären.
 * Konrad, 21.09.2026: vor jedem Anlegen in SevDesk wird gefragt.
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
  dryRun = true,
  /** Nur diese Artikelnummern. Leer oder `undefined` heisst „alle". */
  nurSkus?: string[],
): Promise<SyncErgebnis> {
  const out: SyncErgebnis = { system, jobId: null, dryRun, created: 0, updated: 0, skipped: 0, failed: 0, artikel: [] };

  const { data, error } = await supabase.rpc("products_for_sync", { p_system: system });
  if (error) throw new Error(error.message);
  let zeilen = (data ?? []) as Zeile[];
  // Gezielter Lauf (INV0): nur die bestätigten Artikel. Die Auswahl schneidet die
  // Liste **nach** der RPC zu — was die Datenbank ohnehin nicht hinauslässt
  // (Barter, systemfremde Artikel), kommt auch über eine Auswahl nicht hinaus.
  if (nurSkus && nurSkus.length > 0) {
    const gewollt = new Set(nurSkus);
    const vorher = zeilen.length;
    zeilen = zeilen.filter((z) => gewollt.has(z.sku));
    out.skipped = vorher - zeilen.length;
  }

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
    p_job_type: dryRun ? "product_sync_preview" : "product_sync",
    p_triggered_by: triggeredBy,
  });
  out.jobId = typeof jobId === "number" ? jobId : null;

  for (const z of zeilen) {
    try {
      // Im Trockenlauf denselben Weg gehen, aber nur lesen: gemerkter
      // Fremdschlüssel schlägt Suche, Suche schlägt „neu".
      if (dryRun) {
        const gefunden =
          z.external_id ??
          (system === "hubspot" ? await findHubspotProduct(z.sku) : await findSevdeskPart(z.sku));
        if (gefunden) out.updated += 1;
        else out.created += 1;
        out.artikel.push({ sku: z.sku, name: z.name_de, category: z.category, aktion: gefunden ? "update" : "create" });
        continue;
      }
      const res =
        system === "hubspot"
          ? await upsertHubspotProduct(z, z.external_id)
          : await upsertSevdeskPart(z, z.external_id);
      if (res.angelegt) out.created += 1;
      else out.updated += 1;
      out.artikel.push({ sku: z.sku, name: z.name_de, category: z.category, aktion: res.angelegt ? "create" : "update" });
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
      p_stats: { dryRun, created: out.created, updated: out.updated, skipped: out.skipped, failed: out.failed },
    });
  }
  return out;
}
