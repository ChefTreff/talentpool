import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap } from "@/lib/vocab";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamsView } from "@/app/(hackathon)/hackathon/teams/TeamsView";
import type { HackTeamRow } from "@/app/(hackathon)/hackathon/types";
import { ApplicationsTable, type AdminApplication } from "./ApplicationsTable";

export const dynamic = "force-dynamic";

/**
 * Hackathon im Admin (ADM-055, „Admin-Vollständigkeit“ und „Admin zuerst“).
 *
 * Bisher gab es Challenges freigeben und Teams verteilen nur in der
 * Teilnehmer-App (`/hackathon/teams`) — dort bleibt es als Ergänzung für das
 * Hackathon-Team, die Arbeit geschieht hier. Neu: die Bewerbungen mit
 * Entscheidung. Rechte: Abschnitt `hackathon` (admin, area_lead_hackathon,
 * hackathon_team); dieselbe Regel prüft `is_hack_team()` in jeder RPC.
 */
export default async function AdminHackathonPage() {
  await requireAdminSection("hackathon", "/admin/hackathon");
  const { locale, t } = await getI18n();
  const tt = t.adminHackathon as unknown as Record<string, string>;
  const supabase = await createSupabaseServerClient();

  const [{ data: apps }, { data: teams }, { data: open }, vocab] = await Promise.all([
    supabase.rpc("hack_applications_admin"),
    supabase.rpc("hack_admin_overview", { p_language: locale }),
    supabase.rpc("hack_open_challenges"),
    loadVocabMap(supabase, locale),
  ]);

  const skillLabels: Record<string, string> = {};
  for (const [k, v] of vocab) if (k.startsWith("hack_skill:")) skillLabels[k.slice("hack_skill:".length)] = v;

  return (
    <>
      <PageHeader word={t.admin.words.hackathon} title={tt.title} description={tt.lead} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={tt.appsTitle} description={tt.appsLead} />
          <ApplicationsTable
            rows={(apps ?? []) as AdminApplication[]}
            skillLabels={skillLabels}
            t={tt}
            rpcMessages={t.rpc}
          />
        </Card>
        <Card>
          <CardHeader title={tt.teamsTitle} description={tt.teamsLead} />
          <TeamsView
            rows={(teams ?? []) as HackTeamRow[]}
            openChallenges={((open ?? []) as { deliverable_id: string; org_name: string; title: string | null }[]).map((c) => ({
              deliverable_id: c.deliverable_id,
              org_name: c.org_name,
              title: c.title,
            }))}
            locale={locale}
            t={t.hackathon}
            rpcMessages={t.rpc}
          />
        </Card>
      </div>
    </>
  );
}
