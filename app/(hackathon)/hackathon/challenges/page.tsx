import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { ChipLink } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { HackChallenge, LeaderboardRow } from "../types";
import { Leaderboard } from "../Leaderboard";
import { WunschprofilAnzeige } from "@/components/hackathon/WunschprofilAnzeige";
import type { Wunschprofil } from "@/lib/hackathon/wunschprofil";

export const dynamic = "force-dynamic";

/**
 * Alle Challenges zum Lesen. **Keine Wahl** — verteilt wird von uns (E5);
 * die Liste beantwortet nur „was gibt es dieses Jahr".
 *
 * HACK-008: Filter nach Track als Reiter in der Adresse (`?track=`), damit ein
 * geteilter Link denselben Ausschnitt zeigt. Reiter erscheinen nur für Tracks,
 * in denen es eine Challenge gibt.
 */
export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  await requireArea("hackathon", "/hackathon/challenges");
  const { locale, t } = await getI18n("en");
  const { track } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data }, vocab, { data: profilRows }] = await Promise.all([
    supabase.rpc("hack_challenges", { p_language: locale }),
    loadVocabMap(supabase, locale),
    supabase.rpc("hack_challenge_profiles", { p_language: locale }),
  ]);
  // Wunschprofil je Challenge (HACK-015).
  const profile = new Map(((profilRows ?? []) as Wunschprofil[]).map((p) => [p.challenge_id, p]));
  const studyFields = vgroup(vocab, "study_field");
  const skillLabels = vgroup(vocab, "skill");
  const alle = (data ?? []) as HackChallenge[];
  // Leaderboard je Metrik-Challenge (HACK-009); es sind wenige Challenges.
  const boards = new Map<string, LeaderboardRow[]>(
    await Promise.all(
      alle
        .filter((c) => c.judging_mode === "metric")
        .map(async (c) => {
          const { data: lb } = await supabase.rpc("hack_leaderboard", { p_challenge_id: c.id });
          return [c.id, (lb ?? []) as LeaderboardRow[]] as const;
        }),
    ),
  );
  const trackLabels = vgroup(vocab, "hack_track");
  const tracks = Object.keys(trackLabels).filter((k) => alle.some((c) => c.track === k));
  const aktiv = track && tracks.includes(track) ? track : null;
  const rows = aktiv ? alle.filter((c) => c.track === aktiv) : alle;
  const reiter: { key: string | null; label: string }[] = [
    { key: null, label: t.hackathon.trackAll },
    ...tracks.map((k) => ({ key: k, label: trackLabels[k] })),
  ];

  return (
    <>
      <PageHeader title={t.hackathon.challengesTitle} description={t.hackathon.challengesLead} />
      {tracks.length > 0 && (
        <nav className="mb-4 flex flex-wrap gap-1" aria-label={t.hackathon.track}>
          {reiter.map((r) => (
            <ChipLink
              key={r.key ?? "alle"}
              href={r.key ? `/hackathon/challenges?track=${encodeURIComponent(r.key)}` : "/hackathon/challenges"}
              aktiv={r.key === aktiv}
            >
              {r.label}
            </ChipLink>
          ))}
        </nav>
      )}
      {alle.length === 0 ? (
        <EmptyState title={t.hackathon.challengesEmpty} description={t.hackathon.challengesEmptyBody} />
      ) : rows.length === 0 ? (
        <EmptyState title={t.hackathon.challengesTrackEmpty} description={t.hackathon.challengesEmptyBody} />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((c) => (
            <Card key={c.id}>
              <CardHeader ebene="h3" title={c.title} description={c.org_name ?? undefined} />
              <div className="flex flex-col gap-2">
                {c.description && <p className="leading-6">{c.description}</p>}
                {c.prizes && (
                  <p>
                    <span className="ct-label">{t.hackathon.prizes}: </span>
                    <span className="text-muted">{c.prizes}</span>
                  </p>
                )}
                {c.resources && (
                  <p>
                    <span className="ct-label">{t.hackathon.resources}: </span>
                    <span className="text-muted">{c.resources}</span>
                  </p>
                )}
                {(c.mentors ?? []).length > 0 && (
                  <p>
                    <span className="ct-label">{t.hackathon.mentors}: </span>
                    <span className="text-muted">{(c.mentors ?? []).join(" · ")}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {c.track && <Badge tone="accent">{trackLabels[c.track] ?? c.track}</Badge>}
                  <Badge tone="neutral">
                    {c.judging_mode === "metric"
                      ? t.hackathon.judgingMetric.replace("{metric}", c.metric_label ?? t.hackathon.metric)
                      : t.hackathon.judgingJury}
                  </Badge>
                  <Badge>{t.hackathon.teamsOn.replace("{n}", String(c.teams))}</Badge>
                  {c.judging_mode !== "metric" && (c.criteria ?? []).map((k) => (
                    <Badge key={k.key} tone="neutral">
                      {k.label} · {k.weight} %
                    </Badge>
                  ))}
                </div>
                {profile.get(c.id) && (
                  <WunschprofilAnzeige
                    profil={profile.get(c.id)!}
                    studyFields={studyFields}
                    skills={skillLabels}
                    title={t.hackathon.wishTitle}
                  />
                )}
                {c.judging_mode === "metric" && (
                  <section aria-label={t.hackathon.leaderboardTitle} className="mt-2 flex flex-col gap-2">
                    <h3 className="ct-label">{t.hackathon.leaderboardTitle}</h3>
                    <Leaderboard
                      rows={boards.get(c.id) ?? []}
                      metricLabel={c.metric_label ?? t.hackathon.metric}
                      locale={locale}
                      t={t.hackathon}
                    />
                  </section>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
