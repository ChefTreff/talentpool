import { requireAdminSection } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LogoZeile } from "../page";

export const dynamic = "force-dynamic";

/**
 * Die Produktionsliste als CSV — das, was mit in die Druckerei geht (ADM-048).
 *
 * Zelle aus `lib/csv.ts`: verdoppelt Anführungszeichen **und** entschärft
 * Formelanfänge. Firmierungen und Dateinamen sind Freitext, und die Datei wird
 * in Excel geöffnet (Befund an #81, 18.09.2026).
 *
 * **Alle Partner, auch die ohne Logo.** Eine Datei, die nur das Vorhandene
 * enthält, ist der Grund, warum Logos in den Vorjahren vergessen wurden.
 */
export async function GET() {
  await requireAdminSection("logoWall", "/admin/partner/logos");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("partner_logo_production");
  if (error) return new Response(error.message, { status: 400 });
  const rows = (data ?? []) as LogoZeile[];

  const head = ["Partner", "Level", "Vektordatei", "Status der Datei", "Pixeldatei", "Einwilligung zum Weissen", "Druckfertig", "Was fehlt"];
  const lines = [
    head.map(csvCell).join(";"),
    ...rows.map((r) =>
      [
        r.org_name,
        r.sponsoring_level ?? "",
        r.vektor_datei ?? "",
        r.vektor_status ?? "",
        r.pixel_datei ?? "",
        r.einwilligung ? r.einwilligung.slice(0, 10) : "",
        r.druckbar ? "ja" : "nein",
        r.fehlt ?? "",
      ]
        .map(csvCell)
        .join(";"),
    ),
  ];

  const name = `logo-wand-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
