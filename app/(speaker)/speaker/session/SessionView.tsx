"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRange } from "@/lib/tz";
import type { Locale } from "@/lib/i18n/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { FileButton } from "@/components/ui/FileButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { registerAsset, saveSessionTech, setSlidesRelease, submitSessionContent } from "./actions";
import { TitelAssistent } from "./TitelAssistent";
import {
  BUCKET,
  MAX_TECH_CHARS,
  MAX_UPLOAD_BYTES,
  PRESENTATION_MIME,
  TECH_FIELDS,
  safeFileName,
  type MySession,
  type PresentationWindow,
  type SpeakerAsset,
} from "./types";

type Strings = Record<string, string>;

const SUBMISSION_TONE: Record<string, BadgeTone> = {
  submitted: "accent",
  approved: "success",
  rejected: "error",
  superseded: "neutral",
};
const TECH_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  checked: "success",
  issue: "error",
};

export function SessionView({
  profileId,
  editionId,
  isAssistant,
  slidesConsent,
  sessions,
  assets,
  windows,
  labels,
  locale,
  dateLocale,
  t,
  assistant,
  common,
  rpcMessages,
}: {
  profileId: string;
  editionId: string;
  isAssistant: boolean;
  slidesConsent: boolean;
  sessions: MySession[];
  assets: SpeakerAsset[];
  windows: Record<string, PresentationWindow | null>;
  labels: Record<string, Record<string, string>>;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  /** Texte des Titel-Assistenten (SPK-012) — eigener Block, `t` bleibt flach. */
  assistant: Strings;
  common: { cancel: string; choose: string; none: string; required: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  /**
   * Der Upload geht direkt in den Bucket, nicht durch den Server. Der Pfad ist
   * vorgeschrieben — `<edition>/<profil>/presentation/<uuid>-<datei>` —, die
   * Storage-Policy prüft ihn, und `register_speaker_asset` prüft ihn noch
   * einmal. Erst nach beidem steht die Datei in der Liste.
   */
  async function onUpload(session: MySession, file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast("error", t.uploadTooBig);
      return;
    }
    if (file.type && !PRESENTATION_MIME.includes(file.type)) {
      toast("error", t.uploadWrongType);
      return;
    }
    setUploading(session.session_id);
    try {
      const supabase = createSupabaseBrowserClient();
      const name = safeFileName(file.name);
      const path = `${editionId}/${profileId}/presentation/${crypto.randomUUID()}-${name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) {
        toast("error", `${t.uploadFailed} (${error.message})`);
        return;
      }
      const res = await registerAsset({
        profileId,
        kind: "presentation",
        storagePath: path,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size,
        sessionId: session.session_id,
      });
      if (!res.ok) {
        // Die Datei liegt dann verwaist im Bucket; sie wieder zu löschen wäre
        // der zweite Fehlerfall. Lieber melden und das Team aufräumen lassen.
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast(
        "success",
        res.data.late
          ? `${t.uploadDone} · ${t.uploadLate}`
          : `${t.uploadDone} (v${res.data.version})`,
      );
      router.refresh();
    } finally {
      setUploading(null);
    }
  }

  async function onDownload(asset: SpeakerAsset) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(asset.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast("error", t.downloadFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function onSlides(asset: SpeakerAsset, release: boolean) {
    startTransition(async () => {
      const res = await setSlidesRelease(asset.id, release);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.saved);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {sessions.map((session) => (
        <SessionCard
          key={session.session_id}
          session={session}
          assets={assets.filter(
            (a) => a.kind === "presentation" && a.session_id === session.session_id,
          )}
          window={windows[session.session_id] ?? null}
          isAssistant={isAssistant}
          slidesConsent={slidesConsent}
          uploading={uploading === session.session_id}
          pending={pending}
          labels={labels}
          locale={locale}
          dateTime={dateTime}
          t={t}
          assistant={assistant}
          common={common}
          message={message}
          onUpload={onUpload}
          onDownload={onDownload}
          onSlides={onSlides}
          onSubmitted={() => router.refresh()}
          toast={toast}
        />
      ))}
    </div>
  );
}

function SessionCard({
  session,
  assets,
  window: presentationWindow,
  isAssistant,
  slidesConsent,
  uploading,
  pending,
  labels,
  locale,
  dateTime,
  t,
  assistant,
  common,
  message,
  onUpload,
  onDownload,
  onSlides,
  onSubmitted,
  toast,
}: {
  session: MySession;
  assets: SpeakerAsset[];
  window: PresentationWindow | null;
  isAssistant: boolean;
  slidesConsent: boolean;
  uploading: boolean;
  pending: boolean;
  labels: Record<string, Record<string, string>>;
  locale: Locale;
  dateTime: Intl.DateTimeFormat;
  t: Strings;
  /** Texte des Titel-Assistenten — eigener Block, damit `t` flach bleibt. */
  assistant: Strings;
  common: { cancel: string; choose: string; none: string; required: string; save: string };
  message: (key: string) => string;
  onUpload: (session: MySession, file: File) => void;
  onDownload: (asset: SpeakerAsset) => void;
  onSlides: (asset: SpeakerAsset, release: boolean) => void;
  onSubmitted: () => void;
  toast: (tone: "success" | "error", text: string) => void;
}) {
  const [saving, startSaving] = useTransition();
  const submission = session.latest_submission;
  const finalTitle =
    (locale === "en" ? session.title_en : session.title_de) ??
    session.title_de ??
    session.title_en;
  const finalDescription =
    (locale === "en" ? session.description_en : session.description_de) ??
    session.description_de ??
    session.description_en;

  const [draft, setDraft] = useState({
    title: submission?.title ?? finalTitle ?? "",
    description: submission?.description ?? finalDescription ?? "",
    topics: (submission?.topics ?? []).join(", "),
    language: submission?.language ?? session.language ?? "",
    notes: submission?.notes ?? "",
  });

  const due = presentationWindow?.effective_due ?? null;
  const lateNow = presentationWindow?.late_now === true;

  function onSubmit() {
    startSaving(async () => {
      const res = await submitSessionContent(session.session_id, {
        title: draft.title,
        description: draft.description,
        topics: draft.topics
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        language: draft.language,
        notes: draft.notes,
      });
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.submitDone);
      onSubmitted();
    });
  }

  return (
    <Card className="p-6">
      <header className="mb-4">
        <div className="ct-help flex flex-wrap items-center gap-x-3">
          {session.start_at && session.end_at ? (
            <span className="tabular-nums">
              {formatRange(session.start_at, session.end_at, session.timezone ?? "Europe/Berlin")}
            </span>
          ) : (
            <span>{t.slotPending}</span>
          )}
          {session.stage_name && <span>· {session.stage_name}</span>}
          {session.room && <span>· {session.room}</span>}
          {/* Der Termin zum Mitnehmen (SPK-014). Nur mit Slot — ohne Zeit gibt
              es nichts einzutragen. Ein einfacher Link, kein Knopf: die Seite
              hat ihre primäre Aktion schon im Einreichen. */}
          {session.start_at && (
            <a
              className="ct-link"
              href={`/api/speaker/kalender?session=${session.session_id}`}
            >
              {t.calendarAdd}
            </a>
          )}
        </div>
        <h2 className="ct-h3 mt-1 text-ink">{finalTitle ?? t.untitled}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {session.format && (
            <Badge>{labels.format[session.format] ?? session.format}</Badge>
          )}
          {session.publish_status && (
            <Badge tone={session.publish_status === "published" ? "success" : "neutral"}>
              {labels.publishStatus[session.publish_status] ?? session.publish_status}
            </Badge>
          )}
          {session.speaker_role && <Badge>{session.speaker_role}</Badge>}
        </div>
        {session.co_speakers && session.co_speakers.length > 0 && (
          <p className="ct-help mt-2">
            {t.coSpeakers}:{" "}
            {session.co_speakers
              .map((c) => [c.first_name, c.last_name].filter(Boolean).join(" "))
              .join(", ")}
          </p>
        )}
      </header>

      {/* Eingereicht vs. final — nebeneinander, damit man den Unterschied sieht. */}
      <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        <div>
          <h3 className="ct-label mb-1 text-ink">{t.submitted}</h3>
          {submission ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={SUBMISSION_TONE[submission.status] ?? "neutral"}>
                  {t[`submission_${submission.status}`] ?? submission.status}
                </Badge>
                <span className="ct-help tabular-nums">
                  {dateTime.format(new Date(submission.created_at))}
                </span>
              </div>
              <p className="font-semibold">{submission.title}</p>
              {submission.description && (
                <p className="ct-help mt-1 whitespace-pre-line">{submission.description}</p>
              )}
              {submission.topics && submission.topics.length > 0 && (
                <p className="ct-help mt-1">{submission.topics.join(" · ")}</p>
              )}
              {submission.review_note && (
                <p className="ct-help mt-2">
                  {t.reviewNote}: {submission.review_note}
                </p>
              )}
            </>
          ) : (
            <p className="ct-help">{t.nothingSubmitted}</p>
          )}
        </div>
        <div>
          <h3 className="ct-label mb-1 text-ink">{t.finalVersion}</h3>
          {finalTitle ? (
            <>
              <p className="font-semibold">{finalTitle}</p>
              {finalDescription && (
                <p className="ct-help mt-1 whitespace-pre-line">{finalDescription}</p>
              )}
              {session.language && (
                <p className="ct-help mt-1">
                  {labels.language[session.language] ?? session.language}
                </p>
              )}
            </>
          ) : (
            <p className="ct-help">{t.noFinalYet}</p>
          )}
        </div>
      </div>

      {/* Einreichen */}
      <div className="mt-6 border-t pt-4">
        <h3 className="ct-label mb-3 text-ink">{t.submitTitle}</h3>
        <div className="flex flex-col gap-4">
          <Field
            label={t.fieldSessionTitle}
            htmlFor={`title-${session.session_id}`}
            required
            requiredLabel={common.required}
          >
            <Input
              id={`title-${session.session_id}`}
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldSessionDescription} htmlFor={`desc-${session.session_id}`}>
            <Textarea
              id={`desc-${session.session_id}`}
              rows={4}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.fieldTopics}
              htmlFor={`topics-${session.session_id}`}
              hint={t.fieldTopicsHint}
            >
              <Input
                id={`topics-${session.session_id}`}
                value={draft.topics}
                onChange={(e) => setDraft((d) => ({ ...d, topics: e.target.value }))}
              />
            </Field>
            <Field label={t.fieldSessionLanguage} htmlFor={`lang-${session.session_id}`}>
              <Select
                id={`lang-${session.session_id}`}
                value={draft.language}
                placeholder={common.choose}
                options={["de", "en", "mixed"].map((v) => ({
                  value: v,
                  label: labels.language[v] ?? v,
                }))}
                onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t.fieldNotes} htmlFor={`notes-${session.session_id}`} hint={t.fieldNotesHint}>
            <Textarea
              id={`notes-${session.session_id}`}
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </Field>
          <div>
            <Button onClick={onSubmit} loading={saving} disabled={draft.title.trim() === ""}>
              {t.submitAction}
            </Button>
          </div>
        </div>

        {/* Der Assistent steht **unter** dem Formular, nicht davor: wer schon
            weiss, wie sein Vortrag heisst, soll nicht an einer Hilfe
            vorbeischreiben müssen (SPK-012). */}
        <TitelAssistent
          format={session.format ?? null}
          language={locale === "de" ? "de" : "en"}
          t={assistant}
          onUebernehmen={(v) =>
            setDraft((d) => ({
              ...d,
              title: v.titel || d.title,
              description: v.beschreibung || d.description,
            }))
          }
        />
      </div>

      {/* Präsentation */}
      <div className="mt-6 border-t pt-4">
        <h3 className="ct-label mb-1 text-ink">{t.presentationTitle}</h3>
        <p className="ct-help">
          {due ? `${t.deadline}: ${dateTime.format(new Date(due))}` : t.deadlineUnknown}
          {lateNow && ` — ${t.deadlinePassedHint}`}
        </p>
        <p className="ct-help mt-1">{t.uploadHint}</p>

        {/* Der gemeinsame Baustein statt eines rohen Dateifelds (QS-025) —
            genau die Stelle, an der es Konrad aufgefallen ist. Als Knopf
            erkennbar, und Hochladen ist ein eigener Schritt. */}
        <FileButton
          className="mt-3"
          label={t.uploadChoose}
          uploadLabel={t.uploadAction}
          changeLabel={t.uploadChange}
          accept=".pdf,.ppt,.pptx,.key"
          disabled={uploading}
          onFile={(file) => onUpload(session, file)}
        />
        {uploading && <p className="ct-help mt-1">{t.uploading}</p>}

        {assets.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {assets.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-ct-md border p-3"
              >
                <div className="min-w-0">
                  <p className="ct-label">
                    {a.filename ?? a.storage_path.split("/").pop()}{" "}
                    <span className="ct-help">v{a.version}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {a.is_current && <Badge tone="success">{t.currentVersion}</Badge>}
                    {a.late && <Badge tone="warning">{t.lateBadge}</Badge>}
                    <Badge tone={TECH_TONE[a.tech_check_status] ?? "neutral"}>
                      {t[`tech_${a.tech_check_status}`] ?? a.tech_check_status}
                    </Badge>
                    {a.slides_release && <Badge tone="accent">{t.slidesReleased}</Badge>}
                  </div>
                  {a.tech_check_note && <p className="ct-help mt-1">{a.tech_check_note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Summit Slides entscheidet nur der Speaker, nicht die Assistenz. */}
                  {!isAssistant && a.is_current && (
                    <label className="flex items-center gap-2 ct-help">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={a.slides_release}
                        disabled={pending || (!slidesConsent && !a.slides_release)}
                        onChange={(e) => onSlides(a, e.target.checked)}
                      />
                      {t.slidesRelease}
                    </label>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => onDownload(a)}>
                    {t.download}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isAssistant && !slidesConsent && assets.length > 0 && (
          <p className="ct-help mt-2">{t.slidesConsentMissing}</p>
        )}
      </div>

      {/* Technik (SPK-018). Sie steht **unter dem Slot**, nicht im Profil:
          was auf der Bühne gebraucht wird, hängt am Auftritt, nicht am
          Menschen. `speaker_profile.tech_rider` bleibt nur Vorbelegung. */}
      <TechSection
        session={session}
        t={t}
        common={common}
        message={message}
        toast={toast}
      />
    </Card>
  );
}

/**
 * Die Technik-Ansage des Speakers.
 *
 * Fünf feste Felder, alle Freitext (Konrads Entscheidung vom 17.09.). Was hier
 * steht, ist die **Ansage**; was die Regie daraus disponiert, steht im
 * Regieplan und wird hier nicht angezeigt — sonst wüsste niemand mehr, welche
 * der beiden Angaben gilt.
 *
 * Die Assistenz darf schreiben: sie pflegt den Auftritt mit, und eine
 * Mikrofonwahl ist keine Angabe, die nur der Person selbst gehört.
 */
function TechSection({
  session,
  t,
  common,
  message,
  toast,
}: {
  session: MySession;
  t: Strings;
  common: { cancel: string; choose: string; none: string; required: string; save: string };
  message: (key: string) => string;
  toast: (tone: "success" | "error", text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [tech, setTech] = useState<Record<string, string>>(() =>
    Object.fromEntries(TECH_FIELDS.map((f) => [f.key, session.tech?.[f.key] ?? ""])),
  );

  const zuLang = TECH_FIELDS.some((f) => (tech[f.key] ?? "").length > MAX_TECH_CHARS);
  const geaendert = TECH_FIELDS.some(
    (f) => (tech[f.key] ?? "").trim() !== (session.tech?.[f.key] ?? ""),
  );

  function onSave() {
    start(async () => {
      const res = await saveSessionTech(
        session.session_id,
        Object.fromEntries(TECH_FIELDS.map((f) => [f.key, (tech[f.key] ?? "").trim()])),
      );
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.techSaved);
    });
  }

  return (
    <div className="mt-6 border-t pt-4">
      <h3 className="ct-label mb-1 text-ink">{t.techTitle}</h3>
      <p className="ct-help">{t.techLead}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {TECH_FIELDS.map((f) => {
          const id = `${session.session_id}-${f.key}`;
          const wert = tech[f.key] ?? "";
          const ueber = wert.length > MAX_TECH_CHARS;
          return (
            <Field
              key={f.key}
              label={t[`tech_${f.key}`] ?? f.key}
              htmlFor={id}
              hint={ueber ? t.techTooLong : t[`tech_${f.key}_hint`]}
              className={f.lines === 2 ? "sm:col-span-2" : undefined}
            >
              {f.lines === 2 ? (
                <Textarea
                  id={id}
                  rows={2}
                  value={wert}
                  onChange={(e) => setTech((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={id}
                  value={wert}
                  onChange={(e) => setTech((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </Field>
          );
        })}
      </div>

      <Button className="mt-4" disabled={!geaendert || zuLang} loading={pending} onClick={onSave}>
        {common.save}
      </Button>
    </div>
  );
}
