import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { JudgingView } from "./JudgingView";
import type { JudgingRow } from "../types";

export const dynamic = "force-dynamic";

/**
 * Jury-Ansicht. Das Gate lässt den Bereich herein; ob jemand **bewerten** darf,
 * entscheidet `is_hack_judge()` in der Datenbank — ein 42501 wird hier zu 404,
 * damit die Seite nicht einmal verrät, dass es sie gibt.
 */
export default async function JudgingPage() {
  await requireArea("hackathon", "/hackathon/judging");
  const { t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("hack_judging");
  if (error) notFound();

  return (
    <>
      <PageHeader title={t.hackathon.judgingTitle} description={t.hackathon.judgingLead} />
      <JudgingView rows={(data ?? []) as JudgingRow[]} t={t.hackathon} rpcMessages={t.rpc} />
    </>
  );
}
