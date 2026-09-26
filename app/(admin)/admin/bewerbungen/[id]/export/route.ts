import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExportZeile } from "@/lib/partner/bewerbungen-csv";
import { exportAntwort, exportFehler } from "@/lib/partner/export-antwort";
import type { OverviewRow } from "../../types";

export const dynamic = "force-dynamic";

/**
 * Admin-Weg zum Partner-Export (PART-051, Admin-Vollständigkeit): dieselbe
 * Datei, die der Partner für diese Session lädt — nur Bewerbungen mit
 * Einwilligung, Datenschutzhinweis zuerst, jeder Export im Audit. Das Recht
 * prüft `export_session_applications` (`can_decide_session`: Team, Programm,
 * Talent-Leitung). Bei einer Company Tour ist es die ganze Tour-Session, ohne
 * die Wünsche einzelner Stopps; die stehen in der Entscheidungssicht.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminSection("applications", `/admin/bewerbungen/${id}`);
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("export_session_applications", { p_session_id: id });
  if (error) return exportFehler(error);

  const [{ data: fragenZeilen }, { data: uebersicht }] = await Promise.all([
    supabase
      .from("session_question")
      .select("id, question_id, label_de, label_en, sort_order, question_catalog(label_de, label_en)")
      .eq("session_id", id)
      .order("sort_order"),
    // Wie die Seite: nicht jede Rolle, die entscheiden darf, liest die `session`-Zeile.
    supabase.rpc("applications_overview"),
  ]);
  const kopf = ((uebersicht ?? []) as OverviewRow[]).find((x) => x.session_id === id);
  type Frage = {
    id: string;
    question_id: string | null;
    label_de: string | null;
    label_en: string | null;
    question_catalog: { label_de: string | null; label_en: string | null } | null;
  };
  // Fragetext wie beim Partner (`ladeFragen`): Katalog vor eigenem Text.
  const fragen = ((fragenZeilen ?? []) as unknown as Frage[]).map((q) => {
    const cat = Array.isArray(q.question_catalog) ? q.question_catalog[0] : q.question_catalog;
    const eigen = locale === "en" ? q.label_en : q.label_de;
    const katalog = locale === "en" ? cat?.label_en : cat?.label_de;
    return { key: q.question_id ?? q.id, text: katalog ?? (eigen?.trim() ? eigen : null) ?? q.label_de ?? "—" };
  });
  return exportAntwort({
    supabase,
    zeilen: (data ?? []) as ExportZeile[],
    fragen: new Map(fragen.map((f) => [f.key, f.text])),
    fragenReihenfolge: fragen.map((f) => f.key),
    titel: kopf ? (locale === "en" ? kopf.title_en ?? kopf.title_de : kopf.title_de) : null,
    locale,
    t,
  });
}
