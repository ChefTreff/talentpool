import { requireAdminSection } from "@/lib/auth";
import { lieferantenCsv } from "@/lib/produktion/staende";
import { loadAxes, loadSuppliers } from "../../load";

export const dynamic = "force-dynamic";

// Die Zellen laufen über `lib/csv.ts` (in `lieferantenCsv`): Anführungszeichen
// verdoppelt **und** Formelanfänge entschärft. Die Liste geht per Mail an den
// Messebauer und wird dort in Excel geöffnet; Leistungsnamen und Standbezeichnungen
// sind Freitext (Befund der Architektur-Session an #81, 18.09.2026).

/**
 * Bestellliste als CSV je Dienstleister — das, was per Mail an den Messebauer
 * geht. Seit PROD-004 summiert sie Paketausstattung, Angebot und Messeshop und
 * weist die drei Mengen einzeln aus. Semikolon als Trenner und BOM, damit Excel
 * auf deutschen Rechnern die Spalten nicht in eine einzige quetscht.
 */
export async function GET(request: Request) {
  await requireAdminSection("productionOrders", "/admin/produktion/bestellungen");
  const supplier = new URL(request.url).searchParams.get("dienstleister")?.trim() || undefined;
  const axes = await loadAxes();
  const rows = axes.editionId ? await loadSuppliers(axes.editionId, supplier) : [];

  // Der Filter kommt aus der Adresse und landet im Dateinamen: nur Buchstaben, Ziffern, Bindestrich.
  const teil = (supplier ?? "alle").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "alle";
  const name = `bestellung-${teil}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("\uFEFF" + lieferantenCsv(rows).join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
