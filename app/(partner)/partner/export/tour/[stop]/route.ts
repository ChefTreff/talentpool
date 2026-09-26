import { requireArea } from "@/lib/auth";
import type { ExportZeile } from "@/lib/partner/bewerbungen-csv";
import { ladeTour } from "../../../company-tour/daten";
import { exportAntwort, exportFehler } from "@/lib/partner/export-antwort";

export const dynamic = "force-dynamic";

/**
 * Bewerbungen auf die Company Tour für den Partner eines Stopps als CSV —
 * PART-051. `export_tour_applications` prüft das Recht wie die Liste
 * (`partner_can_edit` der Organisation des Stopps), liefert **nur Bewerbungen
 * mit Einwilligung** mit Fragetext und den Wünschen dieses Stopps (PART-092)
 * und schreibt jeden Export ins Audit.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ stop: string }> }) {
  const { stop } = await params;
  await requireArea("partner", `/partner/export/tour/${stop}`);
  const { supabase, locale, t, stopps } = await ladeTour();

  const { data, error } = await supabase.rpc("export_tour_applications", { p_stop_id: stop });
  if (error) return exportFehler(error);

  const stopp = stopps.find((x) => x.stop_id === stop);
  return exportAntwort({
    supabase,
    zeilen: (data ?? []) as ExportZeile[],
    fragen: new Map(),
    fragenReihenfolge: [],
    titel: stopp
      ? t.partnerTour.stopTitle.replace("{n}", String(stopp.sort_order)).replace("{tour}", stopp.tour_name)
      : null,
    mitWunsch: true,
    locale,
    t,
  });
}
