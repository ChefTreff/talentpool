import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamsView } from "./TeamsView";
import type { HackTeamRow } from "../types";

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

  // Eingereichte Challenge-Formulare, die noch keine Challenge sind.
  const { data: open } = await supabase
    .from("deliverable")
    .select("id, answers, status, org_edition:org_edition_id(org:org_id(legal_name, communication_name)), template:template_id(key)")
    .eq("status", "submitted");

  const openChallenges = ((open ?? []) as unknown as {
    id: string;
    answers: Record<string, string> | null;
    template: { key: string } | null;
    org_edition: { org: { legal_name: string | null; communication_name: string | null } | null } | null;
  }[])
    .filter((d) => d.template?.key === "hackathon_challenge")
    .map((d) => ({
      deliverable_id: d.id,
      org_name: d.org_edition?.org?.communication_name ?? d.org_edition?.org?.legal_name ?? "—",
      title: d.answers?.title_en ?? d.answers?.title_de ?? null,
    }));

  return (
    <>
      <PageHeader title={t.hackathon.teamsTitle} description={t.hackathon.teamsLead} />
      <TeamsView
        rows={(data ?? []) as HackTeamRow[]}
        openChallenges={openChallenges}
        locale={locale}
        t={t.hackathon}
        rpcMessages={t.rpc}
      />
    </>
  );
}
