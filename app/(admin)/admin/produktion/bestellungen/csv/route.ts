import { requireAdminSection } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { loadAxes, loadSuppliers } from "../../load";

export const dynamic = "force-dynamic";

// Zelle aus `lib/csv.ts`: verdoppelt Anführungszeichen **und** entschärft
// Formelanfänge. Die Liste geht per Mail an den Messebauer und wird dort in
// Excel geöffnet; Leistungsnamen und Standbezeichnungen sind Freitext
// (Befund der Architektur-Session an #81, 18.09.2026).

/**
 * Bestellliste als CSV je Dienstleister — das, was per Mail an den Messebauer
 * geht. Semikolon als Trenner und BOM, damit Excel auf deutschen Rechnern die
 * Spalten nicht in eine einzige quetscht.
 */
export async function GET(request: Request) {
  await requireAdminSection("productionOrders", "/admin/produktion/bestellungen");
  const supplier = new URL(request.url).searchParams.get("dienstleister")?.trim() || undefined;
  const axes = await loadAxes();
  const rows = axes.editionId ? await loadSuppliers(axes.editionId, supplier) : [];

  const head = ["Dienstleister", "Artikelnummer", "Leistung", "Menge", "Einheit", "Stände", "EK je Einheit", "EK gesamt"];
  const lines = [
    head.map(csvCell).join(";"),
    ...rows.map((r) =>
      [
        r.supplier,
        r.product_sku,
        r.product_name,
        r.qty,
        r.unit ?? "",
        r.orgs,
        r.purchase_price_cents == null ? "" : (r.purchase_price_cents / 100).toFixed(2),
        r.purchase_price_cents == null ? "" : ((r.purchase_price_cents * Number(r.qty)) / 100).toFixed(2),
      ]
        .map(csvCell)
        .join(";"),
    ),
  ];

  const name = `bestellung-${supplier ?? "alle"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
