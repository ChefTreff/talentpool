"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDay, formatRange } from "@/lib/tz";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  applyToSession,
  cancelRegistration,
  confirmApplication,
  registerForSession,
  withdrawApplication,
  type TalentResult,
} from "./actions";
import {
  type MyApplication,
  type ProgrammeLabels,
  type ProgrammeSession,
  type SessionQuestion,
} from "./types";

type Strings = Record<string, string>;

/** Ein Chip pro Bewerbungsstand — Farbe nie allein, der Text trägt die Aussage. */
const STATUS_TONE: Record<string, BadgeTone> = {
  applied: "neutral",
  shortlisted: "neutral",
  accepted: "success",
  confirmed: "success",
  promoted: "success",
  attended: "success",
  waitlisted: "warning",
  declined: "error",
  expired: "error",
  no_show: "error",
  withdrawn: "neutral",
};

export function ProgrammeView({
  sessions,
  days,
  stages,
  applications,
  registrations,
  questions,
  timezones,
  labels,
  locale,
  t,
  common,
  rpcMessages,
}: {
  sessions: ProgrammeSession[];
  days: string[];
  stages: { id: string; name: string }[];
  applications: MyApplication[];
  registrations: { session_id: string; status: string }[];
  questions: SessionQuestion[];
  timezones: Record<string, string>;
  labels: ProgrammeLabels;
  locale: Locale;
  t: Strings;
  common: { cancel: string; close: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [day, setDay] = useState<string | "all">(days[0] ?? "all");
  const [stage, setStage] = useState("");
  const [format, setFormat] = useState("");
  const [language, setLanguage] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [applyFor, setApplyFor] = useState<ProgrammeSession | null>(null);
  const [collision, setCollision] = useState<string | null>(null);

  const dateLocale = locale === "en" ? "en-GB" : "de-DE";
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  const appBySession = useMemo(
    () => new Map(applications.map((a) => [a.session_id, a])),
    [applications],
  );
  const regBySession = useMemo(
    () =>
      new Map(
        registrations
          .filter((r) => r.status !== "cancelled")
          .map((r) => [r.session_id, r.status]),
      ),
    [registrations],
  );
  const questionsBySession = useMemo(() => {
    const m = new Map<string, SessionQuestion[]>();
    for (const q of questions) {
      const list = m.get(q.session_id) ?? [];
      list.push(q);
      m.set(q.session_id, list);
    }
    return m;
  }, [questions]);

  const title = (s: ProgrammeSession) =>
    (locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? s.title_en ?? "—";
  const description = (s: ProgrammeSession) =>
    (locale === "en" ? s.description_en : s.description_de) ??
    s.description_de ??
    s.description_en ??
    "";
  const tz = (s: ProgrammeSession) => timezones[s.event_id] ?? "Europe/Berlin";

  const visible = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (day === "all" || s.day_date === day) &&
          (!stage || s.stage_id === stage) &&
          (!format || s.format === format) &&
          (!language || s.language === language),
      ),
    [day, format, language, sessions, stage],
  );

  const formatOptions = useMemo(
    () =>
      [...new Set(sessions.map((s) => s.format).filter(Boolean))].map((f) => ({
        value: f as string,
        label: labels.format[f as string] ?? (f as string),
      })),
    [labels.format, sessions],
  );

  // Eine Kollision meldet nur `confirm_application`; `onConfirm` hat dafür den
  // eigenen Weg (es braucht die Bewerbung, nicht das RPC-Detail).
  function handle<T>(res: TalentResult<T>, okText: string, onOk?: (data: T) => void) {
    if (res.ok) {
      toast("success", okText);
      onOk?.(res.data);
      router.refresh();
      return;
    }
    toast("error", message(res.key));
  }

  function onRegister(s: ProgrammeSession) {
    startTransition(async () => {
      const res = await registerForSession(s.session_id);
      if (res.ok) {
        toast(
          "success",
          res.data.status === "waitlisted" ? t.onWaitlist : t.registered,
        );
        router.refresh();
        return;
      }
      toast("error", message(res.key));
    });
  }

  function onCancelRegistration(s: ProgrammeSession) {
    startTransition(async () => {
      handle(await cancelRegistration(s.session_id), t.registrationCancelled);
    });
  }

  function onWithdraw(app: MyApplication) {
    startTransition(async () => {
      handle(await withdrawApplication(app.id), t.withdrawn);
    });
  }

  function onConfirm(app: MyApplication, replace = false) {
    startTransition(async () => {
      const res = await confirmApplication(app.id, replace);
      if (res.ok) {
        setCollision(null);
        toast("success", t.confirmed);
        router.refresh();
        return;
      }
      if (res.key === "collision") {
        setCollision(app.id);
        return;
      }
      toast("error", message(res.key));
    });
  }

  /** Bewerben: ohne Fragen sofort, sonst über das Modal. */
  function onApply(s: ProgrammeSession) {
    const qs = questionsBySession.get(s.session_id) ?? [];
    if (qs.length === 0) {
      startTransition(async () => {
        handle(await applyToSession(s.session_id, {}, false), t.applied);
      });
      return;
    }
    setApplyFor(s);
  }

  const openSession = visible.find((s) => s.session_id === openId) ?? null;
  const collisionApp = applications.find((a) => a.id === collision) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Tagwahl */}
      <div className="flex flex-wrap gap-1" role="group" aria-label={t.day}>
        {days.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={day === d}
            onClick={() => setDay(d)}
            className={cn(
              "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold",
              day === d
                ? "bg-accent-soft text-accent-deep"
                : "text-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            {formatDay(d, dateLocale)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={day === "all"}
          onClick={() => setDay("all")}
          className={cn(
            "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold",
            day === "all"
              ? "bg-accent-soft text-accent-deep"
              : "text-muted hover:bg-surface-hover hover:text-ink",
          )}
        >
          {t.allDays}
        </button>
      </div>

      {/* Filter */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.stage} htmlFor="f-stage">
          <Select
            id="f-stage"
            value={stage}
            placeholder={t.allStages}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(e) => setStage(e.target.value)}
          />
        </Field>
        <Field label={t.format} htmlFor="f-format">
          <Select
            id="f-format"
            value={format}
            placeholder={t.allFormats}
            options={formatOptions}
            onChange={(e) => setFormat(e.target.value)}
          />
        </Field>
        <Field label={t.language} htmlFor="f-language">
          <Select
            id="f-language"
            value={language}
            placeholder={t.allLanguages}
            options={Object.entries(labels.language).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </Field>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t.noMatchTitle} description={t.noMatchBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((s) => {
            const app = appBySession.get(s.session_id);
            const reg = regBySession.get(s.session_id);
            return (
              <Card as="li" key={s.session_id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="ct-help flex flex-wrap items-center gap-2">
                      {s.start_at && s.end_at && (
                        <span className="tabular-nums">
                          {formatRange(s.start_at, s.end_at, tz(s))}
                        </span>
                      )}
                      {s.stage_name && <span>· {s.stage_name}</span>}
                      {s.room && <span>· {s.room}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenId(s.session_id)}
                      className="mt-1 block text-left"
                    >
                      <span className="ct-h3 text-ink hover:underline">{title(s)}</span>
                    </button>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.format && <Badge>{labels.format[s.format] ?? s.format}</Badge>}
                      {s.language && (
                        <Badge>{labels.language[s.language] ?? s.language}</Badge>
                      )}
                      {s.access_mode && s.access_mode !== "open" && (
                        <Badge tone="accent">
                          {labels.accessMode[s.access_mode] ?? s.access_mode}
                        </Badge>
                      )}
                      {app && (
                        <Badge tone={STATUS_TONE[app.status] ?? "neutral"}>
                          {labels.applicationStatus[app.status] ?? app.status}
                        </Badge>
                      )}
                      {reg && <Badge tone="success">{t.registeredShort}</Badge>}
                    </div>
                  </div>
                  <SessionAction
                    session={s}
                    application={app}
                    registered={Boolean(reg)}
                    pending={pending}
                    t={t}
                    onApply={() => onApply(s)}
                    onRegister={() => onRegister(s)}
                    onCancelRegistration={() => onCancelRegistration(s)}
                    onConfirm={() => app && onConfirm(app)}
                    onWithdraw={() => app && onWithdraw(app)}
                    onOpen={() => setOpenId(s.session_id)}
                  />
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      {/* Detail */}
      {openSession && (
        <Drawer
          open
          onClose={() => setOpenId(null)}
          closeLabel={common.close}
          title={title(openSession)}
          footer={
            <SessionAction
              session={openSession}
              application={appBySession.get(openSession.session_id)}
              registered={regBySession.has(openSession.session_id)}
              pending={pending}
              t={t}
              onApply={() => onApply(openSession)}
              onRegister={() => onRegister(openSession)}
              onCancelRegistration={() => onCancelRegistration(openSession)}
              onConfirm={() => {
                const a = appBySession.get(openSession.session_id);
                if (a) onConfirm(a);
              }}
              onWithdraw={() => {
                const a = appBySession.get(openSession.session_id);
                if (a) onWithdraw(a);
              }}
              onOpen={() => {}}
            />
          }
        >
          <div className="flex flex-col gap-3">
            <div className="ct-help">
              {openSession.start_at && openSession.end_at && (
                <div className="tabular-nums">
                  {openSession.day_date && `${formatDay(openSession.day_date, dateLocale)}, `}
                  {formatRange(openSession.start_at, openSession.end_at, tz(openSession))}
                </div>
              )}
              {openSession.stage_name && <div>{openSession.stage_name}</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {openSession.format && (
                <Badge>{labels.format[openSession.format] ?? openSession.format}</Badge>
              )}
              {openSession.language && (
                <Badge>{labels.language[openSession.language] ?? openSession.language}</Badge>
              )}
              {openSession.access_mode && (
                <Badge tone="accent">
                  {labels.accessMode[openSession.access_mode] ?? openSession.access_mode}
                </Badge>
              )}
            </div>
            {description(openSession) && (
              <p className="whitespace-pre-line">{description(openSession)}</p>
            )}
            {openSession.capacity != null && (
              <p className="ct-help">
                {t.capacity}: {openSession.capacity}
              </p>
            )}
            {openSession.application_deadline && (
              <p className="ct-help">
                {t.deadline}:{" "}
                {new Intl.DateTimeFormat(dateLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(openSession.application_deadline))}
              </p>
            )}
            {openSession.ticket_required && <p className="ct-help">{t.ticketNote}</p>}
          </div>
        </Drawer>
      )}

      {/* Bewerbungs-Modal mit den Fragen der Session */}
      {applyFor && (
        <ApplyDialog
          session={applyFor}
          questions={questionsBySession.get(applyFor.session_id) ?? []}
          locale={locale}
          t={t}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setApplyFor(null)}
          onSubmit={(answers, consentShare) => {
            startTransition(async () => {
              const res = await applyToSession(
                applyFor.session_id,
                answers,
                consentShare,
              );
              if (res.ok) {
                setApplyFor(null);
                toast("success", t.applied);
                router.refresh();
                return;
              }
              toast("error", message(res.key));
            });
          }}
        />
      )}

      {/* Kollision beim Bestätigen */}
      {collisionApp && (
        <ConfirmDialog
          title={t.collisionTitle}
          body={t.collisionBody}
          confirmLabel={t.collisionReplace}
          cancelLabel={common.cancel}
          onCancel={() => setCollision(null)}
          onConfirm={() => onConfirm(collisionApp, true)}
        />
      )}
    </div>
  );
}

/** Eine primäre Aktion pro Karte — welche, entscheidet `access_mode` und Status. */
function SessionAction({
  session,
  application,
  registered,
  pending,
  t,
  onApply,
  onRegister,
  onCancelRegistration,
  onConfirm,
  onWithdraw,
  onOpen,
}: {
  session: ProgrammeSession;
  application?: MyApplication;
  registered: boolean;
  pending: boolean;
  t: Strings;
  onApply: () => void;
  onRegister: () => void;
  onCancelRegistration: () => void;
  onConfirm: () => void;
  onWithdraw: () => void;
  onOpen: () => void;
}) {
  const deadlinePassed =
    session.application_deadline != null &&
    new Date(session.application_deadline) < new Date();

  if (session.access_mode === "open") {
    return (
      <Button variant="secondary" size="sm" onClick={onOpen}>
        {t.attend}
      </Button>
    );
  }

  if (session.access_mode === "registration") {
    return registered ? (
      <Button variant="ghost" size="sm" disabled={pending} onClick={onCancelRegistration}>
        {t.cancelRegistration}
      </Button>
    ) : (
      <Button size="sm" disabled={pending || deadlinePassed} onClick={onRegister}>
        {deadlinePassed ? t.deadlineOver : t.register}
      </Button>
    );
  }

  // Bewerbung
  if (!application) {
    return (
      <Button size="sm" disabled={pending || deadlinePassed} onClick={onApply}>
        {deadlinePassed ? t.deadlineOver : t.apply}
      </Button>
    );
  }
  if (application.status === "accepted" || application.status === "promoted") {
    return (
      <Button size="sm" disabled={pending} onClick={onConfirm}>
        {t.confirmSpot}
      </Button>
    );
  }
  if (["applied", "shortlisted", "waitlisted", "confirmed"].includes(application.status)) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={onWithdraw}>
        {t.withdraw}
      </Button>
    );
  }
  // Zurückgezogen oder abgelaufen ist kein Endzustand: `apply_to_session`
  // erlaubt genau aus diesen beiden Ständen eine neue Bewerbung.
  if (application.status === "withdrawn" || application.status === "expired") {
    return (
      <Button size="sm" disabled={pending || deadlinePassed} onClick={onApply}>
        {deadlinePassed ? t.deadlineOver : t.applyAgain}
      </Button>
    );
  }
  return null;
}

function ApplyDialog({
  session,
  questions,
  locale,
  t,
  cancelLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  session: ProgrammeSession;
  questions: SessionQuestion[];
  locale: Locale;
  t: Strings;
  cancelLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (answers: Record<string, string>, consentShare: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consentShare, setConsentShare] = useState(false);

  const missing = questions.filter((q) => q.required && !(answers[q.key] ?? "").trim());

  return (
    <Modal onCancel={onCancel} label={t.applyTitle}>
      <h2 className="ct-h3">{t.applyTitle}</h2>
      <p className="ct-help mt-1">
        {(locale === "en" ? session.title_en : session.title_de) ?? session.title_de}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {questions.map((q) => {
          const id = `q-${q.key}`;
          const set = (value: string) =>
            setAnswers((a) => ({ ...a, [q.key]: value }));
          return (
            <Field
              key={q.key}
              label={q.label}
              htmlFor={id}
              hint={q.help ?? undefined}
              required={q.required}
              requiredLabel={t.required}
            >
              {q.type === "select" && q.options ? (
                <Select
                  id={id}
                  value={answers[q.key] ?? ""}
                  placeholder={t.choose}
                  options={q.options.map((o) => ({
                    value: o.value,
                    label:
                      (locale === "en" ? o.label_en : o.label_de) ?? o.label_de ?? o.value,
                  }))}
                  onChange={(e) => set(e.target.value)}
                />
              ) : q.type === "boolean" ? (
                // Ja/Nein als Auswahl statt Häkchen: „nicht beantwortet" und
                // „nein" sind zwei verschiedene Antworten, das Häkchen kennt nur eine.
                <Select
                  id={id}
                  value={answers[q.key] ?? ""}
                  placeholder={t.choose}
                  options={[
                    { value: "true", label: t.yes },
                    { value: "false", label: t.no },
                  ]}
                  onChange={(e) => set(e.target.value)}
                />
              ) : q.type === "long_text" || q.type === "textarea" ? (
                <Textarea
                  id={id}
                  rows={4}
                  value={answers[q.key] ?? ""}
                  onChange={(e) => set(e.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  type={q.type === "url" ? "url" : q.type === "number" ? "number" : "text"}
                  value={answers[q.key] ?? ""}
                  onChange={(e) => set(e.target.value)}
                />
              )}
            </Field>
          );
        })}

        <label className="flex items-start gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={consentShare}
            onChange={(e) => setConsentShare(e.target.checked)}
            className="mt-1 size-4"
          />
          <span>{t.consentShare}</span>
        </label>
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          disabled={pending || missing.length > 0}
          onClick={() => onSubmit(answers, consentShare)}
        >
          {t.submitApplication}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onCancel={onCancel} label={title}>
      <h2 className="ct-h3">{title}</h2>
      <p className="ct-help mt-2">{body}</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** `<dialog showModal>` — Fokusfalle und Escape kommen vom Browser. */
function Modal({
  label,
  onCancel,
  children,
}: {
  label: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      aria-label={label}
      onCancel={onCancel}
      className="w-full max-w-[560px] rounded-ct-lg border bg-surface p-6 text-ink backdrop:bg-navy/40"
    >
      {children}
    </dialog>
  );
}
