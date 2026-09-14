import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { HackChallenge } from "../types";

export const dynamic = "force-dynamic";

/**
 * Alle Challenges zum Lesen. **Keine Wahl** — verteilt wird von uns (E5);
 * die Liste beantwortet nur „was gibt es dieses Jahr".
 */
export default async function ChallengesPage() {
  await requireArea("hackathon", "/hackathon/challenges");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("hack_challenges", { p_language: locale });
  const rows = (data ?? []) as HackChallenge[];

  return (
    <>
      <PageHeader title={t.hackathon.challengesTitle} description={t.hackathon.challengesLead} />
      {rows.length === 0 ? (
        <EmptyState title={t.hackathon.challengesEmpty} description={t.hackathon.challengesEmptyBody} />
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
