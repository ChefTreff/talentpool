import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamsView } from "./TeamsView";
import type { HackOpenChallenge, HackTeamRow } from "../types";

export const dynamic = "force-dynamic";

/**
 * Sicht des Hack-Teams. `hack_admin_overview()` prüft `is_hack_team()` selbst;
 * ein 42501 wird zu 404, damit die Seite nicht verrät, dass es sie gibt.
 */
export default async function HackTeamsPage() {
  await requireArea("hackathon", "/hackathon/teams");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("hack_admin_overview", { p_language: locale });
  if (error) notFound();

  // Eingereichte Challenge-Formulare, die noch keine Challenge sind — über die
  // Leserolle (ADM-055): der direkte Griff auf `deliverable` scheiterte für das
  // Hackathon-Team an der RLS.
  const [{ data: open }, vocab] = await Promise.all([
    supabase.rpc("hack_open_challenges"),
    loadVocabMap(supabase, locale),
  ]);
  const openChallenges = (open ?? []) as HackOpenChallenge[];

  return (
    <>
      <PageHeader title={t.hackathon.teamsTitle} description={t.hackathon.teamsLead} />
      <TeamsView
        rows={(data ?? []) as HackTeamRow[]}
        openChallenges={openChallenges}
        trackLabels={vgroup(vocab, "hack_track")}
        locale={locale}
        t={t.hackathon}
        rpcMessages={t.rpc}
      />
    </>
  );
}
