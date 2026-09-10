"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRange } from "@/lib/tz";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { decideApplication, promoteWaitlist, releaseDecisions } from "../actions";
import { DECIDABLE, DECISIONS, type OverviewRow, type QueueRow } from "../types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  applied: "neutral",
  shortlisted: "accent",
  accepted: "success",
  promoted: "success",
  confirmed: "success",
  attended: "success",
  waitlisted: "warning",
  declined: "error",
  expired: "error",
  no_show: "error",
  withdrawn: "neutral",
};

export function QueueView({
  session,
  rows,
  timezone,
  questionLabels,
  statusLabels,
  profileLabels,
  vocabProfile,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  session: OverviewRow;
  rows: QueueRow[];
  timezone: string;
  questionLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  profileLabels: Record<string, string>;
  /** Labels für Profilwerte, die aus dem Vokabular kommen. */
  vocabProfile: Record<string, Record<string, string>>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [askRelease, setAskRelease] = useState(false);
  const [promoteCount, setPromoteCount] = useState("1");

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const waitlisted = rows.filter((r) => r.status === "waitlisted").length;
  const openCount = rows.filter((r) => r.status === "applied" || r.status === "shortlisted").length;

  function onDecide(row: QueueRow, status: string) {
    const raw = ranks[row.id];
    const rank = raw != null && raw.trim() !== "" ? Number(raw) : null;
    startTransition(async () => {
      const res = await decideApplication(
        session.session_id,
        row.id,
        status,
        Number.isFinite(rank) ? rank : null,
      );
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.decided);
      router.refresh();
    });
  }

  function onRelease() {
    startTransition(async () => {
      const res = await releaseDecisions(session.session_id);
      setAskRelease(false);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", `${t.releasedToast} (${res.data.accepted})`);
      router.refresh();
    });
  }

  function onPromote() {
    const count = Math.max(1, Number(promoteCount) || 1);
    startTransition(async () => {
      const res = await promoteWaitlist(session.session_id, count);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", `${t.promotedToast} (${res.data.promoted})`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Kopf: Eckdaten und die beiden Aktionen, die die ganze Session betreffen */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="ct-help flex flex-wrap items-center gap-x-4 gap-y-1">
            {session.start_at && session.end_at && (
              <span className="tabular-nums">
                {formatRange(session.start_at, session.end_at, timezone)}
              </span>
            )}
            {session.capacity != null && (
              <span>
                {t.capacity}: {session.capacity}
              </span>
            )}
            {session.application_deadline && (
              <span>
                {t.deadline}: {dateTime.format(new Date(session.application_deadline))}
              </span>
            )}
            <span>
              {t.colOpen}: {openCount}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {session.released ? (
              <Badge tone="success">{t.released}</Badge>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => setAskRelease(true)}>
                {t.release}
              </Button>
            )}
            {waitlisted > 0 && (
              <div className="flex items-center gap-1">
                <label className="ct-help" htmlFor="promote-count">
                  {t.promote}
                </label>
                <Input
                  id="promote-count"
                  type="number"
                  min={1}
                  max={waitlisted}
                  value={promoteCount}
                  onChange={(e) => setPromoteCount(e.target.value)}
                  className="w-16"
                />
                <Button size="sm" variant="secondary" disabled={pending} onClick={onPromote}>
                  {t.promoteAction}
                </Button>
              </div>
            )}
          </div>
        </div>
        {!session.released && (
          <p className="ct-help mt-3">{t.notReleasedHint}</p>
        )}
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={t.queueEmptyTitle} description={t.queueEmptyBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <Card as="li" key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ct-h3 text-ink">
                      {row.display_name ?? t.hiddenName}
                    </span>
                    <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
                      {statusLabels[row.status] ?? row.status}
                    </Badge>
                    {row.rank != null && <Badge>{`${t.rank} ${row.rank}`}</Badge>}
                    {!row.consent_share && <Badge tone="neutral">{t.notShared}</Badge>}
                  </div>

                  <div className="ct-help mt-1 flex flex-wrap gap-x-4">
                    <span>
                      {t.appliedOn} {dateTime.format(new Date(row.created_at))}
                    </span>
                    {row.decided_at && (
                      <span>
                        {t.decidedOn} {dateTime.format(new Date(row.decided_at))}
                      </span>
                    )}
                    {row.confirm_by && (
                      <span>
                        {t.confirmBy} {dateTime.format(new Date(row.confirm_by))}
                      </span>
                    )}
                  </div>

                  {row.display_name === null && row.answers === null && (
                    <p className="ct-help mt-2">{t.maskedHint}</p>
                  )}

                  <Profile
                    profile={row.profile}
                    labels={profileLabels}
                    vocab={vocabProfile}
                  />
                  <Answers answers={row.answers} labels={questionLabels} t={t} />
                </div>

                <div className="flex flex-col items-end gap-2">
                  <label className="ct-help flex items-center gap-1" htmlFor={`rank-${row.id}`}>
                    {t.rank}
                    <Input
                      id={`rank-${row.id}`}
                      type="number"
                      min={1}
                      value={ranks[row.id] ?? (row.rank != null ? String(row.rank) : "")}
                      onChange={(e) =>
                        setRanks((r) => ({ ...r, [row.id]: e.target.value }))
                      }
                      className="w-16"
                    />
                  </label>
                  <div className="flex flex-wrap justify-end gap-1">
                    {DECISIONS.map((d) => (
                      <Button
                        key={d}
                        size="sm"
                        variant={d === "accepted" ? "primary" : "secondary"}
                        disabled={pending || !DECIDABLE.includes(row.status) || row.status === d}
                        onClick={() => onDecide(row, d)}
                      >
                        {statusLabels[d] ?? d}
                      </Button>
                    ))}
                  </div>
                  {!DECIDABLE.includes(row.status) && (
                    <p className="ct-help">{t.notDecidable}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}

      {askRelease && (
        <ConfirmDialog
          title={t.releaseTitle}
          body={t.releaseBody}
          confirmLabel={t.release}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskRelease(false)}
          onConfirm={onRelease}
        />
      )}
    </div>
  );
}

/** Profilzeile: nur gefüllte Felder, Werte aus dem Vokabular übersetzt. */
function Profile({
  profile,
  labels,
  vocab,
}: {
  profile: Record<string, string> | null;
  labels: Record<string, string>;
  vocab: Record<string, Record<string, string>>;
}) {
  const entries = Object.entries(profile ?? {}).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <dl className="ct-help mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-1">
          <dt className="font-semibold">{labels[key] ?? key}:</dt>
          <dd>{vocab[key]?.[value] ?? value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Antworten stehen aufgeklappt hinter einem Klick — die Liste bleibt lesbar. */
function Answers({
  answers,
  labels,
  t,
}: {
  answers: Record<string, string> | null;
  labels: Record<string, string>;
  t: Strings;
}) {
  const entries = Object.entries(answers ?? {}).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="ct-help cursor-pointer font-semibold">
        {t.answers} ({entries.length})
      </summary>
      <dl className="mt-2 flex flex-col gap-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="ct-label">{labels[key] ?? key}</dt>
            <dd className="whitespace-pre-line text-[14px]">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
