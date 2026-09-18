import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { SHUTTLE_EXPORT_COLUMNS, type ShuttleAdminRow } from "@/components/shuttle/types";

export const dynamic = "force-dynamic";

/**
 * Die Fahrtenliste für das Shuttle-Unternehmen (ADM-028).
 *
 * Konrad am 17.09.: „Export als CSV und .xlsx für Shuttle." Zwei Formate, eine
 * Quelle — die Spaltenliste steht in `components/shuttle/types.ts`, damit CSV
 * und Excel nie auseinanderlaufen.
 *
 * **Was hinausgeht, steht an der Fahrt.** Name der beförderten Person und
 * Telefonnummer für den Fahrer liegen in `shuttle_booking`, nicht an `person`;
 * der Export fasst die Personentabelle nicht an. Der Speaker-Name kommt aus
 * `shuttle_bookings_admin` als benannte Spalte und ist für die Disposition
 * nötig — das Unternehmen muss wissen, wen es abholt.
 *
 * Wer das darf, entscheidet `shuttle_bookings_admin` (42501 ohne Speaker-Team);
 * hier steht nur das Bereichsgate.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  await requireArea("admin", `/api/admin/shuttle/export${url.search}`);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("shuttle_bookings_admin", {
    p_edition_id: url.searchParams.get("edition") || null,
  });
  if (error) {
    // 42501 heisst: angemeldet, aber nicht zuständig. Kein Inhalt, kein Hinweis
    // darauf, wie viele Fahrten es gäbe.
    return new Response(error.code === "42501" ? "not allowed" : "error", {
      status: error.code === "42501" ? 403 : 500,
    });
  }

  // Stornierte Fahrten gehören nicht auf die Liste des Unternehmens — es soll
  // fahren, was bestellt ist, nicht was einmal bestellt war.
  const rows = ((data ?? []) as ShuttleAdminRow[]).filter((r) => r.status !== "cancelled");
  const datum = new Date().toISOString().slice(0, 10);
  const name = `shuttle-${datum}`;

  if (format === "csv") {
    // Semikolon und BOM wie bei Regieplan und Bestellliste, damit Excel auf
    // deutschen Rechnern die Spalten nicht in eine einzige quetscht.
    // `csvCell` entschärft Formelanfänge: der Name der beförderten Person und
    // die Adressen kommen als Freitext aus dem Portal, und das Unternehmen
    // öffnet die Datei in Excel (Befund der Architektur-Session, 18.09.).
    const kopf = SHUTTLE_EXPORT_COLUMNS.map((c) => csvCell(c.label)).join(";");
    const zeilen = rows.map((r) =>
      SHUTTLE_EXPORT_COLUMNS.map((c) => csvCell(c.value(r))).join(";"),
    );
    return new Response(`﻿${[kopf, ...zeilen].join("\r\n")}\r\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}.csv"`,
      },
    });
  }

  // Excel: dieselbe Spaltenliste, damit beide Formate dasselbe sagen.
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Shuttle");
  ws.columns = SHUTTLE_EXPORT_COLUMNS.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.width,
  }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) {
    ws.addRow(Object.fromEntries(SHUTTLE_EXPORT_COLUMNS.map((c) => [c.key, c.value(r)])));
  }

  const puffer = await wb.xlsx.writeBuffer();
  return new Response(puffer as ArrayBuffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
