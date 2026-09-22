import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { istTrockenlauf } from "@/lib/products/dry-run";
import { archiveHubspotProducts, listHubspotProducts } from "@/lib/hubspot/products";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Den Altbestand in HubSpot archivieren — die Produkte **ohne `hs_sku`**.
 *
 * Warum es sie gibt: Der Abgleich findet ein Produkt drüben nur über `hs_sku`.
 * Was dort keine hat, findet er nicht und legt unseren Artikel daneben neu an.
 * HubSpot hielte danach den alten FLS26-Katalog und den neuen nebeneinander —
 * technisch keine Dublette, für den Vertrieb ein Durcheinander (Konrad, 21.09.2026).
 *
 * **Archivieren, nicht löschen.** HubSpot kennt über die API kein Hartlöschen;
 * `batch/archive` legt die Zeilen in den Papierkorb, aus dem sie 90 Tage lang
 * zurückgeholt werden können. Bestehende Angebote behalten ihre Positionen.
 *
 * `dryRun` ist die Vorgabe: ohne ein ausdrückliches `{"dryRun": false}` wird nur
 * gelesen und gelistet. `ids` schränkt auf ausgewählte Zeilen ein — ohne Auswahl
 * passiert **nichts**, auch im scharfen Lauf nicht: 38 fremde Datensätze
 * archiviert man nicht auf Zuruf, sondern nach Durchsicht.
 */
export async function POST(request: Request) {
  const ctx = await requireArea("admin", "/admin/partner/integrationen");
  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase.rpc("is_partner_team");
  if (!team) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean; ids?: unknown };
  const dryRun = istTrockenlauf(body);
  const gewaehlt = Array.isArray(body.ids)
    ? body.ids.filter((i): i is string => typeof i === "string" && i.trim() !== "")
    : [];

  if (!process.env.HUBSPOT_ACCESS_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, error: "HUBSPOT_ACCESS_TOKEN fehlt" }, { status: 400 });
  }

  try {
    const alle = await listHubspotProducts();
    const ohneSku = alle.filter((p) => !p.sku);
    const bekannt = new Set(ohneSku.map((p) => p.id));
    // Nur was wirklich ohne Nummer dasteht: eine mitgeschickte Id, die inzwischen
    // eine SKU hat, wird nicht archiviert. Zwischen Durchsicht und Knopfdruck kann
    // jemand drüben gearbeitet haben.
    const zuArchivieren = gewaehlt.filter((id) => bekannt.has(id));
    const uebersprungen = gewaehlt.filter((id) => !bekannt.has(id));

    if (!dryRun && zuArchivieren.length > 0) {
      await archiveHubspotProducts(zuArchivieren);
      await logAudit({
        action: "hubspot.products_archived",
        objectType: "product",
        objectId: "hubspot",
        after: {
          count: zuArchivieren.length,
          // Die volle Liste gehört hier hinein: es ist der einzige Ort, an dem
          // später steht, was archiviert wurde und wer es ausgelöst hat.
          products: ohneSku
            .filter((p) => zuArchivieren.includes(p.id))
            .map((p) => ({ id: p.id, name: p.name, price: p.price })),
          by: ctx.user?.email ?? "admin",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      total: alle.length,
      candidates: ohneSku,
      archived: dryRun ? 0 : zuArchivieren.length,
      skipped: uebersprungen.length,
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler);
    console.error("[hubspot/archive-products]", text);
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
