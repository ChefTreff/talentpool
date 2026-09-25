import { requireAdminSection } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Treffer = {
  holder: string | null; email: string | null; pass_type: string | null; status: string;
  barcode: string | null; scans: number; letzter_scan: string | null; letztes_ergebnis: string | null;
};

/**
 * Die Treffer der Ticketsuche als CSV (ADM-051) — für den Fall, dass am Einlass
 * eine Liste gebraucht wird, die nicht am Bildschirm hängt.
 *
 * Zelle aus `lib/csv.ts`: verdoppelt Anführungszeichen **und** entschärft
 * Formelanfänge. Namen sind Freitext, und die Datei wird in Excel geöffnet.
 *
 * Es geht **nur** die Suche heraus, nie der ganze Bestand: ohne Frage keine
 * Datei. Eine Ausgabe aller Tickets wäre eine Teilnehmerliste zum Mitnehmen,
 * und dafür ist das hier nicht gebaut.
 */
export async function GET(request: Request) {
  await requireAdminSection("checkin", "/admin/checkin");
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return new Response("query_too_short", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("checkin_admin_search", { p_query: q, p_limit: 100 });
  if (error) return new Response(error.message, { status: 400 });
  const rows = (data ?? []) as Treffer[];

  const head = ["Name", "E-Mail", "Pass", "Status", "Barcode", "Scans", "Letzter Scan", "Letztes Ergebnis"];
  const lines = [
    head.map(csvCell).join(";"),
    ...rows.map((r) =>
      [
        r.holder ?? "", r.email ?? "", r.pass_type ?? "", r.status, r.barcode ?? "",
        r.scans, r.letzter_scan ?? "", r.letztes_ergebnis ?? "",
      ]
        .map(csvCell)
        .join(";"),
    ),
  ];

  const name = `checkin-suche-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
