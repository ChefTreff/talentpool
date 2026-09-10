"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDay, formatRange } from "@/lib/tz";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  cancelRegistration,
  confirmApplication,
  withdrawApplication,
  type TalentResult,
} from "../actions";
import type {
  MyApplication,
  MyRegistration,
  ParticipationLabels,
  ParticipationSession,
} from "./types";

type Strings = Record<string, string>;

/** Farbe nie allein — der Wortlaut trägt die Aussage (Design-Briefing §5). */
const STATUS_TONE: Record<string, BadgeTone> = {
  applied: "neutral",
  shortlisted: "neutral",
  accepted: "success",
  promoted: "success",
  confirmed: "success",
  attended: "success",
  waitlisted: "warning",
  declined: "error",
  expired: "error",
  no_show: "error",
  withdrawn: "neutral",
  cancelled: "neutral",
  no_response: "neutral",
};

/** Stände, aus denen heraus eine Bewerbung noch zurückgezogen werden kann. */
const WITHDRAWABLE = ["applied", "shortlisted", "waitlisted", "accepted", "promoted", "confirmed"];

/** Was noch offen ist: weder entschieden noch beendet. */
const PENDING = ["applied", "shortlisted"];

type Pending =
  | { kind: "collision"; application: MyApplication; conflicting: string[] }
  | { kind: "withdraw"; application: MyApplication }
  | { kind: "cancel"; registration: MyRegistration };

export function MeineView({
  applications,
  registrations,
  sessions,
  timezones,
  ticketedEvents,
  labels,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  applications: MyApplication[];
  registrations: MyRegistration[];
  sessions: Record<string, ParticipationSession | undefined>;
  timezones: Record<string, string>;
  /** Events, für die die Person selbst ein gültiges Ticket hat. */
  ticketedEvents: string[];
  labels: ParticipationLabels;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [ask, setAsk] = useState<Pending | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  const byId = useMemo(
    () => new Map(applications.map((a) => [a.id, a])),
    [applications],
  );

  const title = (sessionId: string) => {
    const s = sessions[sessionId];
    if (!s) return null;
    return (locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? s.title_en ?? "—";
  };

  function handle(res: TalentResult<unknown>, okText: string) {
    if (res.ok) {
      setAsk(null);
      toast("success", okText);
      router.refresh();
      return;
    }
    toast("error", message(res.key));
  }

  function onConfirm(application: MyApplication, replace = false) {
    startTransition(async () => {
      const res = await confirmApplication(application.id, replace);
      if (!res.ok && res.key === "collision") {
        // `detail` trägt die IDs der kollidierenden Bewerbungen — daraus wird
        // im Dialog der Name der Session, die freigegeben würde.
        setAsk({
          kind: "collision",
          application,
          conflicting: (res.detail ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        });
        return;
      }
      handle(res, t.confirmedToast);
    });
  }

  function onWithdraw(application: MyApplication) {
    startTransition(async () => {
      handle(await withdrawApplication(application.id), t.withdrawnToast);
    });
  }

  function onCancel(registration: MyRegistration) {
    startTransition(async () => {
      handle(await cancelRegistration(registration.session_id), t.cancelledToast);
    });
  }

  const programmeLink = (
    <ButtonLink href="/programm" variant="secondary" size="sm">
      {t.toProgramme}
    </ButtonLink>
  );

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="h-applications">
        <h2 id="h-applications" className="ct-h3 mb-3 text-ink">
          {t.applications}
        </h2>
        {applications.length === 0 ? (
          <EmptyState
            title={t.emptyApplicationsTitle}
            description={t.emptyApplicationsBody}
            action={programmeLink}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {applications.map((a) => (
              <ApplicationCard
                key={a.id}
                application={a}
                session={sessions[a.session_id]}
                title={title(a.session_id)}
                statusLabel={labels.applicationStatus[a.status] ?? a.status}
                timezones={timezones}
                needsTicket={
                  sessions[a.session_id]?.ticket_required === true &&
                  !ticketedEvents.includes(sessions[a.session_id]?.event_id ?? "")
                }
                dateLocale={dateLocale}
                pending={pending}
                t={t}
                onConfirm={() => onConfirm(a)}
                onWithdraw={() => setAsk({ kind: "withdraw", application: a })}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-registrations">
        <h2 id="h-registrations" className="ct-h3 mb-3 text-ink">
          {t.registrations}
        </h2>
        {registrations.length === 0 ? (
          <EmptyState
            title={t.emptyRegistrationsTitle}
            description={t.emptyRegistrationsBody}
            action={programmeLink}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {registrations.map((r) => (
              <Card as="li" key={r.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <SessionLine
                      session={sessions[r.session_id]}
                      timezones={timezones}
                      dateLocale={dateLocale}
                    />
                    <p className="ct-h3 mt-1 text-ink">
                      {title(r.session_id) ?? common.none}
                    </p>
                    {!sessions[r.session_id] && (
                      <p className="ct-help mt-1">{t.sessionHidden}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                        {labels.registrationStatus[r.status] ?? r.status}
                      </Badge>
                    </div>
                    {r.status === "waitlisted" && (
                      <p className="ct-help mt-2">{t.waitlistNote}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setAsk({ kind: "cancel", registration: r })}
                  >
                    {t.cancelRegistration}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {ask?.kind === "collision" && (
        <ConfirmDialog
          title={t.collisionTitle}
          body={t.collisionBody}
          detail={
            ask.conflicting.length > 0 && (
              <>
                <p className="ct-label">{t.collisionAffected}</p>
                <ul className="ct-help mt-1 list-disc pl-5">
                  {ask.conflicting.map((id) => {
                    const other = byId.get(id);
                    return (
                      <li key={id}>
                        {(other && title(other.session_id)) ?? common.none}
                      </li>
                    );
                  })}
                </ul>
              </>
            )
          }
          confirmLabel={t.collisionReplace}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAsk(null)}
          onConfirm={() => onConfirm(ask.application, true)}
        />
      )}

      {ask?.kind === "withdraw" && (
        <ConfirmDialog
          title={t.withdrawTitle}
          body={t.withdrawBody}
          confirmLabel={t.withdraw}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAsk(null)}
          onConfirm={() => onWithdraw(ask.application)}
        />
      )}

      {ask?.kind === "cancel" && (
        <ConfirmDialog
          title={t.cancelTitle}
          body={t.cancelBody}
          confirmLabel={t.cancelRegistration}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAsk(null)}
          onConfirm={() => onCancel(ask.registration)}
        />
      )}
    </div>
  );
}

function ApplicationCard({
  application,
  session,
  title,
  statusLabel,
  timezones,
  needsTicket,
  dateLocale,
  pending,
  t,
  onConfirm,
  onWithdraw,
}: {
  application: MyApplication;
  session: ParticipationSession | undefined;
  title: string | null;
  statusLabel: string;
  timezones: Record<string, string>;
  needsTicket: boolean;
  dateLocale: string;
  pending: boolean;
  t: Strings;
  onConfirm: () => void;
  onWithdraw: () => void;
}) {
  const confirmable =
    application.status === "accepted" || application.status === "promoted";
  const deadlinePassed =
    application.confirm_by != null && new Date(application.confirm_by) < new Date();

  return (
    <Card as="li" className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <SessionLine session={session} timezones={timezones} dateLocale={dateLocale} />
          <p className="ct-h3 mt-1 text-ink">{title ?? "—"}</p>
          {!session && <p className="ct-help mt-1">{t.sessionHidden}</p>}

          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[application.status] ?? "neutral"}>{statusLabel}</Badge>
          </div>

          {PENDING.includes(application.status) && (
            <p className="ct-help mt-2">{t.pendingNote}</p>
          )}
          {application.status === "waitlisted" && (
            <p className="ct-help mt-2">{t.waitlistNote}</p>
          )}

          {/* Die Bestätigungsfrist ist der Grund, warum diese Seite existiert —
              sie steht deshalb im Klartext an der Bewerbung, nicht nur in der Mail. */}
          {confirmable && application.confirm_by && (
            <p className={deadlinePassed ? "ct-help mt-2 text-error-ink" : "ct-help mt-2"}>
              {deadlinePassed ? t.confirmByPassed : `${t.confirmBy} `}
              {!deadlinePassed && (
                <time dateTime={application.confirm_by} className="tabular-nums">
                  {new Intl.DateTimeFormat(dateLocale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(application.confirm_by))}
                </time>
              )}
            </p>
          )}
          {confirmable && needsTicket && (
            <p className="ct-help mt-1 text-warning-ink">{t.ticketNote}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          {confirmable && (
            <Button size="sm" disabled={pending || deadlinePassed} onClick={onConfirm}>
              {t.confirmSpot}
            </Button>
          )}
          {WITHDRAWABLE.includes(application.status) && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={onWithdraw}>
              {t.withdraw}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Zeit, Bühne, Raum — leer, solange die Session nicht veröffentlicht ist. */
function SessionLine({
  session,
  timezones,
  dateLocale,
}: {
  session: ParticipationSession | undefined;
  timezones: Record<string, string>;
  dateLocale: string;
}) {
  if (!session) return null;
  const tz = timezones[session.event_id] ?? "Europe/Berlin";
  return (
    <div className="ct-help flex flex-wrap items-center gap-2">
      {session.day_date && <span>{formatDay(session.day_date, dateLocale)}</span>}
      {session.start_at && session.end_at && (
        <span className="tabular-nums">
          {formatRange(session.start_at, session.end_at, tz)}
        </span>
      )}
      {session.stage_name && <span>· {session.stage_name}</span>}
      {session.room && <span>· {session.room}</span>}
    </div>
  );
}
