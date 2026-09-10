"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { approveSubmission, rejectSubmission } from "../actions";

type Strings = Record<string, string>;

/** Zeile aus `pending_submissions()`. */
export type PendingSubmission = {
  id: string;
  session_id: string;
  event_id: string;
  session_title_de: string | null;
  session_title_en: string | null;
  session_description_de: string | null;
  session_description_en: string | null;
  session_language: string | null;
  publish_status: string | null;
  start_at: string | null;
  stage_name: string | null;
  speaker_profile_id: string | null;
  speaker_name: string | null;
  /** Was der Speaker eingereicht hat — in **einer** Sprache. */
  title: string | null;
  description: string | null;
  topics: string[] | null;
  language: string | null;
  notes: string | null;
  created_at: string;
};

type Draft = {
  language: string;
  title_de: string;
  title_en: string;
  description_de: string;
  description_en: string;
  note: string;
};

/**
 * Was nach der Freigabe in der Session stünde, wenn niemand etwas ändert.
 * Dieselbe Regel wie in `approve_session_content`: die eingereichte Sprache
 * entscheidet, welche Seite überschrieben wird; die andere bleibt stehen.
 */
function draftFor(s: PendingSubmission, language: string): Draft {
  const de = language === "de";
  return {
    language,
    title_de: (de ? s.title : s.session_title_de) ?? "",
    title_en: (de ? s.session_title_en : s.title) ?? "",
    description_de: (de ? s.description : s.session_description_de) ?? "",
    description_en: (de ? s.session_description_en : s.description) ?? "",
    note: "",
  };
}

/**
 * Geschrieben wird nur die Seite, in der eingereicht wurde — die andere bleibt
 * stehen, auch wenn sie leer ist. Genau die geschriebene darf deshalb nicht
 * leer sein; alles andere wäre strenger als die RPC und würde eine ganz
 * normale Freigabe blockieren.
 */
function writtenTitle(d: Draft): string {
  return d.language === "de" ? d.title_de : d.title_en;
}

export function SubmissionQueue({
  submissions,
  languages,
  publishStatus,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  submissions: PendingSubmission[];
  languages: Record<string, string>;
  publishStatus: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [askReject, setAskReject] = useState<PendingSubmission | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const draft = (s: PendingSubmission) =>
    drafts[s.id] ?? draftFor(s, s.language ?? s.session_language ?? "de");
  const patch = (s: PendingSubmission, part: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [s.id]: { ...draft(s), ...part } }));

  function onApprove(s: PendingSubmission) {
    const d = draft(s);
    startTransition(async () => {
      const res = await approveSubmission(s.id, {
        title_de: d.title_de,
        title_en: d.title_en,
        description_de: d.description_de,
        description_en: d.description_en,
        language: d.language,
        review_note: d.note,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.approved);
      router.refresh();
    });
  }

  function onReject(s: PendingSubmission) {
    const d = draft(s);
    startTransition(async () => {
      setAskReject(null);
      const res = await rejectSubmission(s.id, d.note);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.rejected);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {submissions.map((s) => {
        const d = draft(s);
        const sessionTitle =
          s.session_title_de || s.session_title_en || t.untitledSession;
        return (
          <Card key={s.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[280px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ct-h3 text-ink">{sessionTitle}</span>
                  {s.publish_status && (
                    <Badge>{publishStatus[s.publish_status] ?? s.publish_status}</Badge>
                  )}
                </div>
                <p className="ct-help mt-1">
                  {s.speaker_name || common.none}
                  {s.stage_name && ` · ${s.stage_name}`}
                  {s.start_at && ` · ${dateTime.format(new Date(s.start_at))}`}
                </p>
                <p className="ct-help">
                  {t.submittedOn} {dateTime.format(new Date(s.created_at))}
                </p>
              </div>
            </div>

            {/* Was eingereicht wurde — unveränderlich, damit man vergleichen kann. */}
            <section className="mt-3 rounded-ct-md border bg-surface-hover p-3">
              <h3 className="ct-label text-ink">
                {t.submitted} · {languages[s.language ?? ""] ?? s.language ?? common.none}
              </h3>
              <p className="ct-help mt-1 font-semibold text-ink">
                {s.title || common.none}
              </p>
              {s.description && (
                <p className="ct-help mt-1 whitespace-pre-line">{s.description}</p>
              )}
              {(s.topics?.length ?? 0) > 0 && (
                <p className="ct-help mt-1">
                  {t.topics}: {s.topics?.join(" · ")}
                </p>
              )}
              {s.notes && (
                <p className="ct-help mt-1">
                  {t.speakerNote}: {s.notes}
                </p>
              )}
            </section>

            {/* Was in der Session landet. Vorbelegt mit dem, was die RPC ohne
                Zutun schreiben würde — hier ist es noch änderbar. */}
            <section className="mt-3">
              <h3 className="ct-label text-ink">{t.willBecome}</h3>
              <p className="ct-help mb-3">{t.willBecomeHint}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.fieldTitleDe} htmlFor={`tde-${s.id}`}>
                  <Input
                    id={`tde-${s.id}`}
                    value={d.title_de}
                    onChange={(e) => patch(s, { title_de: e.target.value })}
                  />
                </Field>
                <Field label={t.fieldTitleEn} htmlFor={`ten-${s.id}`}>
                  <Input
                    id={`ten-${s.id}`}
                    value={d.title_en}
                    onChange={(e) => patch(s, { title_en: e.target.value })}
                  />
                </Field>
                <Field label={t.fieldDescriptionDe} htmlFor={`dde-${s.id}`}>
                  <Textarea
                    id={`dde-${s.id}`}
                    rows={4}
                    value={d.description_de}
                    onChange={(e) => patch(s, { description_de: e.target.value })}
                  />
                </Field>
                <Field label={t.fieldDescriptionEn} htmlFor={`den-${s.id}`}>
                  <Textarea
                    id={`den-${s.id}`}
                    rows={4}
                    value={d.description_en}
                    onChange={(e) => patch(s, { description_en: e.target.value })}
                  />
                </Field>
                <Field label={t.fieldLanguage} htmlFor={`lang-${s.id}`}>
                  <Select
                    id={`lang-${s.id}`}
                    value={d.language}
                    options={Object.entries(languages).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(e) => patch(s, { language: e.target.value })}
                  />
                </Field>
                <Field label={t.note} htmlFor={`note-${s.id}`} hint={t.noteHint}>
                  <Input
                    id={`note-${s.id}`}
                    value={d.note}
                    onChange={(e) => patch(s, { note: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={pending || writtenTitle(d).trim() === ""}
                  onClick={() => onApprove(s)}
                >
                  {t.approve}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || d.note.trim() === ""}
                  onClick={() => setAskReject(s)}
                >
                  {t.reject}
                </Button>
              </div>
              {writtenTitle(d).trim() === "" && (
                <p className="ct-help mt-2">{t.titleRequired}</p>
              )}
              {d.note.trim() === "" && <p className="ct-help mt-1">{t.rejectNeedsNote}</p>}
            </section>
          </Card>
        );
      })}

      {askReject && (
        <ConfirmDialog
          title={t.rejectTitle}
          body={t.rejectBody}
          detail={<p className="ct-label">{draft(askReject).note}</p>}
          confirmLabel={t.reject}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskReject(null)}
          onConfirm={() => onReject(askReject)}
        />
      )}
    </div>
  );
}
