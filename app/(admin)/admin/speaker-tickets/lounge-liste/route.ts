import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { LOUNGE_SPALTEN, loungeBerechtigte, type LoungeQuelle } from "@/lib/speaker/lounge-liste";

export const dynamic = "force-dynamic";

/**
 * Die Lounge-Liste fürs Personal (ADM-076): alle Lounge-Berechtigten — Speaker und Begleitungen — als CSV.
 *
 * Admin-Weg: Admin → Speaker-Tickets → „Lounge-Liste (CSV)“. Wer das darf, entscheidet `speaker_tickets_admin` (42501
 * ohne Speaker-Team); hier steht nur das Bereichsgate.
 *
 * Name, Art, Speaker, Stand, Pass — **keine E-Mail, kein Barcode** (Datenminimierung, Plan 05.10.). Die Zellen laufen über
 * `lib/csv.ts`: Namen sind Freitext, und das Personal öffnet die Datei in Excel. Semikolon und BOM wie bei den übrigen
 * Listen, damit Excel auf deutschen Rechnern die Spalten nicht in eine einzige quetscht.
 */
export async function GET() {
  await requireAdminSection("speakerTickets", "/admin/speaker-tickets");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("speaker_tickets_admin");
  if (error) {
    // 42501: angemeldet, aber nicht zuständig — kein Inhalt, kein Hinweis darauf, wie viele es gäbe.
    return new Response(error.code === "42501" ? "not allowed" : "error", {
      status: error.code === "42501" ? 403 : 500,
    });
  }
  const zeilen = loungeBerechtigte((data ?? []) as LoungeQuelle[]);
  const kopf = LOUNGE_SPALTEN.map((c) => csvCell(c.label)).join(";");
  const inhalt = zeilen.map((z) => LOUNGE_SPALTEN.map((c) => csvCell(c.wert(z))).join(";"));
  const name = `lounge-liste-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("\uFEFF" + [kopf, ...inhalt].join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
