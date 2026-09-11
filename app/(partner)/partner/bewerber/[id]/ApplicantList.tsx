"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { decideApplication } from "../../actions";
import { APPLICATION_DECISIONS, type PartnerApplication } from "../../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  applied: "neutral",
  shortlisted: "accent",
  accepted: "success",
  confirmed: "success",
  waitlisted: "warning",
  declined: "error",
  withdrawn: "neutral",
  expired: "neutral",
};

/** Profilfelder in fester Reihenfolge — was leer ist, fällt weg. */
const PROFILE_FIELDS = [
  "occupation_status",
  "career_level",
  "employer_name",
  "university",
  "study_field",
  "city",
] as const;

export function ApplicantList({
  applications,
  statusLabels,
  canDecide,
  dateLocale,
  t,
  rpcMessages,
}: {
  applications: PartnerApplication[];
  statusLabels: Record<string, string>;
  canDecide: boolean;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });

  function onDecide(a: PartnerApplication, status: string) {
    setBusy(a.id);
    startTransition(async () => {
      const res = await decideApplication(a.id, status);
      setBusy(null);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.decided);
      router.refresh();
    });
  }

  return (
    <ul className="flex flex-col gap-3">
      {applications.map((a) => {
        // Ohne Einwilligung liefert die RPC weder Name noch Antworten. Die
        // Zeile bleibt trotzdem stehen — sonst zählte die Liste anders als
        // die Kennzahlen, und der Partner wüsste nicht, dass es sie gibt.
        const hidden = !a.consent_share;
        const profileEntries = PROFILE_FIELDS.map(
          (key) => [key, a.profile?.[key] ?? null] as const,
        ).filter(([, value]) => value);

        return (
          <Card as="li" key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[260px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ct-label text-ink">
                    {a.display_name ?? t.hiddenName}
                  </span>
                  <Badge tone={TONE[a.status] ?? "neutral"}>
                    {statusLabels[a.status] ?? a.status}
                  </Badge>
                  {a.rank != null && <span className="ct-help">#{a.rank}</span>}
                </div>
                <p className="ct-help mt-1">
                  {t.appliedOn} {dateTime.format(new Date(a.created_at))}
                  {a.decided_at && ` · ${t.decidedOn} ${dateTime.format(new Date(a.decided_at))}`}
                </p>

                {hidden ? (
                  <p className="ct-help mt-2">{t.hiddenBody}</p>
                ) : (
                  <>
                    {profileEntries.length > 0 && (
                      <dl className="ct-help mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {profileEntries.map(([key, value]) => (
                          <div key={key} className="flex gap-1">
                            <dt className="font-semibold">{t[`profile_${key}`] ?? key}:</dt>
                            <dd>{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {a.profile?.linkedin_url && (
                      <a
                        className="ct-link mt-1 inline-block"
                        href={a.profile.linkedin_url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        LinkedIn
                      </a>
                    )}
                    {a.answers && Object.keys(a.answers).length > 0 && (
                      <dl className="ct-help mt-2 flex flex-col gap-1">
                        {Object.entries(a.answers).map(([key, value]) => (
                          <div key={key}>
                            <dt className="font-semibold">{key}</dt>
                            <dd className="whitespace-pre-line">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </>
                )}
              </div>

              {canDecide && (
                <div className="flex w-full max-w-[300px] flex-wrap gap-2">
                  {APPLICATION_DECISIONS.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={status === "accepted" ? "primary" : "secondary"}
                      disabled={pending || a.status === status}
                      onClick={() => onDecide(a, status)}
                    >
                      {busy === a.id && pending ? "…" : (t[`decide_${status}`] ?? status)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </ul>
  );
}
