import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { getI18n } from "@/lib/i18n";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { NICHT_PERSONALISIERT_SPALTEN, type NichtPersonalisiert } from "@/lib/tickets/nicht-personalisiert";

export const dynamic = "force-dynamic";

/**
 * „Nicht personalisiert“ als CSV (TAL-019 Teil 2). Admin-Weg: Admin → Bewerbungen → Tickets → „Liste (CSV)“.
 * Wer das darf, entscheidet `tickets_unpersonalized` (42501 ohne Abschnitt applications); hier steht nur das Bereichsgate.
 * Zellen über `lib/csv.ts`: Namen und Firma sind Freitext, die Datei wird in Excel geöffnet.
 */
export async function GET() {
  await requireAdminSection("applications", "/admin/bewerbungen/tickets");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tickets_unpersonalized", { p_limit: 5000 });
  if (error) {
    return new Response(error.code === "42501" ? "not allowed" : "error", { status: error.code === "42501" ? 403 : 500 });
  }
  const zeilen = (data ?? []) as NichtPersonalisiert[];
  // „Pass“ mit der Bezeichnung des Tickettyps statt des Schlüssels (TAL-020, B11) — wie auf der Seite.
  const { locale } = await getI18n();
  const vocab = await loadVocabMap(supabase, locale);
  const pass = (k: string | null) => (k ? vlabel(vocab, "ticket_type", k) : "");
  const kopf = NICHT_PERSONALISIERT_SPALTEN.map((c) => csvCell(c.label)).join(";");
  const inhalt = zeilen.map((z) => NICHT_PERSONALISIERT_SPALTEN.map((c) => csvCell(c.wert(z, pass))).join(";"));
  const name = `tickets-nicht-personalisiert-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + [kopf, ...inhalt].join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
