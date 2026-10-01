import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { cn } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { HackChallenge } from "../types";

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
  const [{ data }, vocab] = await Promise.all([
    supabase.rpc("hack_challenges", { p_language: locale }),
    loadVocabMap(supabase, locale),
  ]);
  const alle = (data ?? []) as HackChallenge[];
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
            <Link
              key={r.key ?? "alle"}
              href={r.key ? `/hackathon/challenges?track=${encodeURIComponent(r.key)}` : "/hackathon/challenges"}
              aria-current={r.key === aktiv ? "page" : undefined}
              className={cn(
                "rounded-ct-sm px-2.5 py-1.5 ct-label transition-colors",
                r.key === aktiv
                  ? "bg-accent-soft text-accent-deep"
                  : "text-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              {r.label}
            </Link>
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
              <CardHeader title={c.title} description={c.org_name ?? undefined} />
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
                  <Badge>{t.hackathon.teamsOn.replace("{n}", String(c.teams))}</Badge>
                  {(c.criteria ?? []).map((k) => (
                    <Badge key={k.key} tone="neutral">
                      {k.label} · {k.weight} %
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
