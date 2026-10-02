import { requireAdminSection } from "@/lib/auth";
import { standCsv } from "@/lib/produktion/staende";
import { loadAxes, loadBooths } from "../../load";

export const dynamic = "force-dynamic";

// Die Zellen laufen über `lib/csv.ts` (in `standCsv`): Organisations- und Leistungsnamen sind
// Freitext, und die Liste wird in Excel geöffnet.

/**
 * Produktionsliste je Stand als CSV — Paketausstattung, Angebot und Messeshop
 * mit den drei Mengen und dem Haken „Geliefert“ (PROD-004). Ohne Filter alle
 * Stände, mit `?stand=<org_edition_id>` einer; der Link je Stand nimmt dieselbe
 * Kennung mit, die die Seite kennt. Semikolon und BOM wie bei der Bestellliste.
 */
export async function GET(request: Request) {
  await requireAdminSection("productionBooths", "/admin/produktion/staende");
  const stand = new URL(request.url).searchParams.get("stand")?.trim() || undefined;
  const axes = await loadAxes();
  const alle = axes.editionId ? await loadBooths(axes.editionId) : [];
  const rows = stand ? alle.filter((i) => i.org_edition_id === stand) : alle;

  // Der Name der Organisation landet im Dateinamen: nur Buchstaben, Ziffern, Bindestrich.
  const teil = stand
    ? (rows[0]?.org_name ?? "stand").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "stand"
    : "alle-staende";
  const name = `produktionsliste-${teil}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("\uFEFF" + standCsv(rows).join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
