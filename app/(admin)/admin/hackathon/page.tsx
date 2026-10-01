import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamsView } from "@/app/(hackathon)/hackathon/teams/TeamsView";
import type { HackChallenge, HackOpenChallenge, HackTeamRow, LeaderboardRow } from "@/app/(hackathon)/hackathon/types";
import { ApplicationsTable, type AdminApplication } from "./ApplicationsTable";
import { ChallengeTracks } from "./ChallengeTracks";
import { DatasetUpload } from "@/components/hackathon/DatasetUpload";
import { abgabeUrls, datasetUrl, type AbgabeZeile, type DatasetTarget } from "@/lib/hackathon/datensatz-server";
import { AbgabeDateien, type AbgabeDatei } from "@/components/hackathon/AbgabeDateien";
import { MetricResults } from "./MetricResults";

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

  const [{ data: apps }, { data: teams }, { data: open }, { data: challenges }, vocab] = await Promise.all([
    supabase.rpc("hack_applications_admin"),
    supabase.rpc("hack_admin_overview", { p_language: locale }),
    supabase.rpc("hack_open_challenges"),
    supabase.rpc("hack_challenges", { p_language: locale }),
    loadVocabMap(supabase, locale),
  ]);
  const trackLabels = vgroup(vocab, "hack_track");
  // HACK-011: Abgabe-Dateien aller Teams (das Hack-Team liest alle).
  const { data: abgabeRows } = await supabase.rpc("hack_submission_files");
  const abgabeZeilen = (abgabeRows ?? []) as AbgabeZeile[];
  const abgabeLinks = await abgabeUrls(supabase, abgabeZeilen);
  const abgaben = new Map<string, AbgabeDatei[]>();
  for (const z of abgabeZeilen) {
    abgaben.set(z.team_id, [...(abgaben.get(z.team_id) ?? []), { file_id: z.file_id, filename: z.filename, size_bytes: z.size_bytes, late: z.late, url: abgabeLinks.get(z.storage_path) ?? null }]);
  }
  const teamNamen = new Map(((teams ?? []) as HackTeamRow[]).map((r) => [r.team_id, r.team_name]));
  // HACK-012: Datensatz je freigegebener Challenge (Hack-Team pflegt alle).
  const { data: targetRows } = await supabase.rpc("hack_dataset_targets", { p_language: locale });
  const datensaetze = await Promise.all(
    ((targetRows ?? []) as DatasetTarget[]).map(async (d) => ({
      ...d,
      url: d.storage_path && d.filename ? await datasetUrl(supabase, d.storage_path, d.filename) : null,
    })),
  );
  // HACK-009: Werte je Metrik-Challenge zum Bestätigen.
  const metrikChallenges = ((challenges ?? []) as HackChallenge[]).filter((c) => c.judging_mode === "metric");
  const boards = await Promise.all(
    metrikChallenges.map(async (c) => {
      const { data: lb } = await supabase.rpc("hack_leaderboard", { p_challenge_id: c.id });
      return { challenge: c, rows: (lb ?? []) as LeaderboardRow[] };
    }),
  );


  return (
    <>
      <PageHeader word={t.admin.words.hackathon} title={tt.title} description={tt.lead} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={tt.appsTitle} description={tt.appsLead} />
          <ApplicationsTable
            rows={(apps ?? []) as AdminApplication[]}
            labels={{
              skills: vgroup(vocab, "hack_skill"),
              tracks: trackLabels,
              studyFields: vgroup(vocab, "study_field"),
              profileSkills: vgroup(vocab, "skill"),
            }}
            t={tt}
            rpcMessages={t.rpc}
          />
        </Card>
        <Card>
          <CardHeader title={tt.tracksTitle} description={tt.tracksLead} />
          <ChallengeTracks
            rows={(challenges ?? []) as HackChallenge[]}
            trackLabels={trackLabels}
            t={tt}
            rpcMessages={t.rpc}
          />
        </Card>
        {boards.length > 0 && (
          <Card>
            <CardHeader title={tt.metricTitle} description={tt.metricLead} />
            <div className="flex flex-col gap-6">
              {boards.map((b) => (
                <MetricResults
                  key={b.challenge.id}
                  title={b.challenge.title}
                  metricLabel={b.challenge.metric_label ?? t.hackathon.metric}
                  rows={b.rows}
                  locale={locale}
                  t={tt}
                  th={t.hackathon}
                  rpcMessages={t.rpc}
                />
              ))}
            </div>
          </Card>
        )}
        {datensaetze.length > 0 && (
          <Card>
            <CardHeader title={tt.datasetsTitle} description={tt.datasetsLead} />
            <div className="flex flex-col gap-6">
              {datensaetze.map((d) => (
                <section key={d.challenge_id} className="flex flex-col gap-2">
                  <h3 className="ct-h3">
                    {d.title}
                    {d.org_name && <span className="ct-help"> · {d.org_name}</span>}
                  </h3>
                  <DatasetUpload
                    challengeId={d.challenge_id}
                    current={d.filename && d.uploaded_at ? { filename: d.filename, size_bytes: d.size_bytes, uploaded_at: d.uploaded_at, url: d.url } : null}
                    dateLocale={locale}
                    t={t.hackDataset}
                  />
                </section>
              ))}
            </div>
          </Card>
        )}
        {abgaben.size > 0 && (
          <Card>
            <CardHeader title={tt.submissionsTitle} description={tt.submissionsLead} />
            <div className="flex flex-col gap-6">
              {[...abgaben.entries()].map(([teamId, dateien]) => (
                <section key={teamId} className="flex flex-col gap-2">
                  <h3 className="ct-h3">{teamNamen.get(teamId) ?? teamId}</h3>
                  <AbgabeDateien teamId={teamId} dateien={dateien} editierbar={false} dateLocale={locale} t={t.hackathon} />
                </section>
              ))}
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title={tt.teamsTitle} description={tt.teamsLead} />
          <TeamsView
            rows={(teams ?? []) as HackTeamRow[]}
            openChallenges={(open ?? []) as HackOpenChallenge[]}
            trackLabels={trackLabels}
            locale={locale}
            t={t.hackathon}
            rpcMessages={t.rpc}
          />
        </Card>
      </div>
    </>
  );
}
