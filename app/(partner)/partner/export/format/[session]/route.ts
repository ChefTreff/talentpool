import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExportZeile } from "@/lib/partner/bewerbungen-csv";
import { ladeFragen } from "../../../bewerbungen";
import { exportAntwort, exportFehler } from "@/lib/partner/export-antwort";

export const dynamic = "force-dynamic";

/**
 * Bewerbungen einer eigenen Session (Masterclass, Side-Event, Interview Table)
 * als CSV — PART-051. `export_session_applications` entscheidet über das Recht
 * (wer entscheiden darf, darf exportieren), liefert **nur Bewerbungen mit
 * Einwilligung** und schreibt jeden Export ins Audit. Die Fragetexte kommen
 * aus der Session, die Datei beginnt mit dem Datenschutzhinweis.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  await requireArea("partner", `/partner/export/format/${session}`);
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("export_session_applications", { p_session_id: session });
  if (error) return exportFehler(error);

  const [fragen, { data: kopf }] = await Promise.all([
    ladeFragen(supabase, session),
    supabase.from("session").select("title_de, title_en").eq("id", session).maybeSingle(),
  ]);
  const text = (f: { label_de: string; label_en: string }) => (locale === "en" ? f.label_en : f.label_de);
  return exportAntwort({
    supabase,
    zeilen: (data ?? []) as ExportZeile[],
    fragen: new Map(fragen.map((f) => [f.key, text(f)])),
    fragenReihenfolge: fragen.map((f) => f.key),
    titel: kopf ? (locale === "en" ? kopf.title_en ?? kopf.title_de : kopf.title_de) : null,
    locale,
    t,
  });
}
