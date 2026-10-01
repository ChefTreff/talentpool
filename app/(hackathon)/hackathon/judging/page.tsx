import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { JudgingView } from "./JudgingView";
import type { JudgingRow } from "../types";
import { abgabeUrls, type AbgabeZeile } from "@/lib/hackathon/datensatz-server";
import type { AbgabeDatei } from "@/components/hackathon/AbgabeDateien";

export const dynamic = "force-dynamic";

/**
 * Jury-Ansicht. Das Gate lässt den Bereich herein; ob jemand **bewerten** darf,
 * entscheidet `is_hack_judge()` in der Datenbank — ein 42501 wird hier zu 404,
 * damit die Seite nicht einmal verrät, dass es sie gibt.
 */
export default async function JudgingPage() {
  await requireArea("hackathon", "/hackathon/judging");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("hack_judging", { p_language: locale });
  if (error) notFound();

  // Abgabe-Dateien aller Teams, die die Person bewerten darf (HACK-011);
  // signiert mit ihrer Sitzung — die Bucket-Policy entscheidet mit.
  const { data: dateiRows } = await supabase.rpc("hack_submission_files");
  const zeilen = (dateiRows ?? []) as AbgabeZeile[];
  const urls = await abgabeUrls(supabase, zeilen);
  const dateien: Record<string, AbgabeDatei[]> = {};
  for (const z of zeilen) {
    (dateien[z.team_id] ??= []).push({ file_id: z.file_id, filename: z.filename, size_bytes: z.size_bytes, late: z.late, url: urls.get(z.storage_path) ?? null });
  }

  return (
    <>
      <PageHeader title={t.hackathon.judgingTitle} description={t.hackathon.judgingLead} />
      <JudgingView rows={(data ?? []) as JudgingRow[]} dateien={dateien} dateLocale={t.meta.dateLocale} t={t.hackathon} rpcMessages={t.rpc} />
    </>
  );
}
