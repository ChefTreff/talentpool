import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import type { PartnerSession } from "../types";

export const dynamic = "force-dynamic";

/** Sessions der Organisation mit Bewerbungsverfahren. */
export default async function PartnerApplicantsPage() {
  await requireArea("partner", "/partner/bewerber");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("partner_sessions", { p_org_id: current.org_id }),
    loadVocabMap(supabase, locale),
  ]);
  const sessions = (rows ?? []) as PartnerSession[];
  const formats = vgroup(vocab, "session_format");

  const dateTime = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const title = (s: PartnerSession) =>
    (locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? s.title_en ?? "—";

  return (
    <>
      <PageHeader title={t.partnerApplicants.title} description={t.partnerApplicants.lead} />
      {sessions.length === 0 ? (
        <EmptyState
          title={t.partnerApplicants.emptyTitle}
          description={t.partnerApplicants.emptyBody}
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {sessions.map((s) => (
            <Card as="li" key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[260px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ct-h3 text-ink">{title(s)}</span>
                    {s.format && <Badge>{formats[s.format] ?? s.format}</Badge>}
                  </div>
                  <p className="ct-help mt-1">
                    {s.stage_name}
                    {s.start_at && ` · ${dateTime.format(new Date(s.start_at))}`}
                    {s.capacity != null && ` · ${s.capacity} ${t.partnerApplicants.seats}`}
                  </p>
                  {s.application_deadline && (
                    <p className="ct-help">
                      {t.partnerApplicants.deadline}{" "}
                      {dateTime.format(new Date(s.application_deadline))}
                    </p>
                  )}
                  <dl className="ct-help mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {(
                      [
                        ["total", s.counts.total],
                        ["applied", s.counts.applied],
                        ["shortlisted", s.counts.shortlisted],
                        ["accepted", s.counts.accepted],
                        ["waitlisted", s.counts.waitlisted],
                        ["declined", s.counts.declined],
                      ] as const
                    )
                      .filter(([, n]) => n > 0)
                      .map(([key, n]) => (
                        <div key={key} className="flex gap-1">
                          <dt className="font-semibold">
                            {t.partnerApplicants[`count_${key}` as keyof typeof t.partnerApplicants] ?? key}:
                          </dt>
                          <dd className="tabular-nums">{n}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <Link href={`/partner/bewerber/${s.id}`} className="ct-link">
                    {t.partnerApplicants.open}
                  </Link>
                  <span className="ct-help">
                    {s.released
                      ? t.partnerApplicants.released
                      : t.partnerApplicants.notReleased}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
