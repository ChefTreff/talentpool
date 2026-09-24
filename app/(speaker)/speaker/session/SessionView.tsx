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
import { ConfirmDialog } from "@/components/ui/Modal";
import { KalenderKnoepfe } from "@/components/ui/KalenderKnoepfe";
import {
  deleteAsset,
  registerAsset,
  saveSessionTech,
  setSlidesRelease,
  submitSessionContent,
} from "./actions";
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
  /** Welche Folien gerade zum Entfernen anstehen (SPK-028). */
  const [loeschen, setLoeschen] = useState<SpeakerAsset | null>(null);

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

  /**
   * Folien entfernen (SPK-028, Konrad 21.09.: „Außerdem sollte man Slides
   * wieder löschen könnne").
   *
   * Mit Rückfrage: eine hochgeladene Präsentation ist Arbeit, und ein
   * versehentlicher Klick liesse sich nicht zurücknehmen. Die Datenbank lässt
   * die vorige Fassung nachrücken — wer Version 3 entfernt, steht danach mit
   * Version 2 da und nicht ohne Präsentation.
   */
  function onDelete(asset: SpeakerAsset) {
    startTransition(async () => {
      const res = await deleteAsset(asset.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      setLoeschen(null);
      toast("success", t.slidesDeleted);
      router.refresh();
    });
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

  // Der Upload noch einmal ganz oben (SPK-028, Konrad 21.09.: „Ich würde gern
  // den Button für den Upload der Präsentation nochmal oben zeigen").
  //
  // **Nur bei genau einer Session.** Wer zwei Auftritte hat, müsste bei einem
  // Knopf ohne Überschrift raten, für welchen er gilt — dann ist der Knopf im
  // jeweiligen Abschnitt der ehrlichere Weg.
  const einzige = sessions.length === 1 ? sessions[0] : null;

  return (
    <div className="flex flex-col gap-6">
      {einzige && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="ct-label text-ink">{t.presentationTitle}</p>
            <p className="ct-help mt-1">{t.uploadHint}</p>
          </div>
          <FileButton
            label={t.uploadChoose}
            uploadLabel={t.uploadAction}
            changeLabel={t.uploadChange}
            accept=".pdf,.ppt,.pptx,.key"
            disabled={uploading === einzige.session_id}
            onFile={(file) => onUpload(einzige, file)}
          />
        </Card>
      )}

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
          onDelete={setLoeschen}
          onSubmitted={() => router.refresh()}
          toast={toast}
        />
      ))}

      {loeschen && (
        <ConfirmDialog
          title={t.deleteSlidesTitle}
          body={t.deleteSlidesBody}
          detail={`${loeschen.filename ?? loeschen.storage_path.split("/").pop()} · v${loeschen.version}`}
          confirmLabel={t.deleteSlides}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setLoeschen(null)}
          onConfirm={() => onDelete(loeschen)}
        />
      )}
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
  onDelete,
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
  onDelete: (asset: SpeakerAsset) => void;
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
    topics: submission?.topics ?? [],
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
        topics: draft.topics,
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
    // Konrad, 21.09.: „Ist aktuell noch sehr unübersichtlich … ich möchte
    // klarere Abgrenzungen der einzelnen Teilbereiche der Seite." Vorher stand
    // alles in **einer** Karte, getrennt nur durch Linien und `h3`. Jetzt trägt
    // jeder Teilbereich eine eigene Karte mit eigener Überschrift und eigenem
    // Anker — die Grenze ist damit sichtbar und anspringbar (SPK-043).
    <div className="flex flex-col gap-6">
    <Card id="slot" className="scroll-mt-20 border-accent p-6">
      <header>
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
              es nichts einzutragen. Seit QS-043 dieselben drei Zeichen wie auf
              der Übersicht; vorher stand hier nur der Apple-Weg als Textlink.
              Zeichen statt Knopf: die Seite hat ihre primäre Aktion schon im
              Einreichen. */}
          {session.start_at && (
            <KalenderKnoepfe
              beschriftung="sichtbar"
              termin={{
                titel: finalTitle ?? t.untitled,
                start: new Date(session.start_at),
                ende: session.end_at ? new Date(session.end_at) : null,
                ort: [session.stage_name, session.room].filter(Boolean).join(", ") || null,
              }}
              ics={`/api/speaker/kalender?session=${session.session_id}`}
              t={{ add: t.calendarAdd, google: t.calGoogle, outlook: t.calOutlook, apple: t.calApple }}
            />
          )}
        </div>
        <h2 className="ct-h2 mt-1 text-ink">{finalTitle ?? t.untitled}</h2>
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
    </Card>

    <Card id="inhalt" className="scroll-mt-20 p-6">
      <h2 className="ct-h2 mb-4 text-ink">{t.sectionContent}</h2>
      {/* Eingereicht vs. final — nebeneinander, damit man den Unterschied sieht. */}
      <div className="grid gap-4 sm:grid-cols-2">
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
                <p className="ct-help mt-1">
                  {submission.topics.map((k) => labels.topics?.[k] ?? k).join(" · ")}
                </p>
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
            {/* Mehrfachauswahl statt Freitext (SPK-027, Konrad 21.09.). Die
                Liste ist dieselbe, die wir für die Talks setzen; sie steht im
                Vokabular `session_topic` und wird im Admin gepflegt.
                Kästchen statt einer Mehrfachliste: siebzehn Einträge in einem
                `<select multiple>` sind auf dem Telefon nicht zu bedienen,
                und was ausgewählt ist, sieht man dort auch nicht. */}
            <fieldset className="sm:col-span-2">
              <legend className="ct-label text-ink">{t.fieldTopics}</legend>
              <p className="ct-help mt-1">{t.fieldTopicsHint}</p>
              <div className="mt-2 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(labels.topics ?? {}).map(([key, label]) => (
                  <label key={key} className="flex min-h-11 items-center gap-2 ct-small text-ink">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={draft.topics.includes(key)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          topics: e.target.checked
                            ? [...d.topics, key]
                            : d.topics.filter((k) => k !== key),
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
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

    </Card>

      {/* Präsentation */}
    <Card id="praesentation" className="scroll-mt-20 p-6">
      <div>
        <h2 className="ct-h2 mb-1 text-ink">{t.presentationTitle}</h2>
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
                  {/* Die Assistenz lädt hoch, entfernt aber nicht: was weg
                      ist, ist weg, und das entscheidet die Speakerin. */}
                  {!isAssistant && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => onDelete(a)}
                    >
                      {t.deleteSlides}
                    </Button>
                  )}
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
    </Card>

      <TechSection
        session={session}
        labels={labels}
        t={t}
        common={common}
        message={message}
        toast={toast}
      />
    </div>
  );
}

/**
 * Die Technik-Ansage des Speakers.
 *
 * Seit dem 23.09. **zwei** Felder (SPK-029): das gewünschte Mikrofon als
 * Auswahl und ein Kurztext für alles Weitere. „Personen auf der Bühne",
 * „Präsentation und Medien" und „Mobiliar" sind raus — das weiß der Speaker
 * nicht, das disponieren die Stage Leads im Regieplan (LEAD-012).
 *
 * Was hier steht, ist die **Ansage**; was die Regie daraus macht, steht im
 * Regieplan und wird hier nicht angezeigt — sonst wüsste niemand mehr, welche
 * der beiden Angaben gilt.
 *
 * Die Assistenz darf schreiben: sie pflegt den Auftritt mit, und eine
 * Mikrofonwahl ist keine Angabe, die nur der Person selbst gehört.
 */
function TechSection({
  session,
  labels,
  t,
  common,
  message,
  toast,
}: {
  session: MySession;
  labels: Record<string, Record<string, string>>;
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
    <Card id="technik" className="scroll-mt-20 p-6">
      <h2 className="ct-h2 mb-1 text-ink">{t.techTitle}</h2>
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
              className={f.kind === "text" ? "sm:col-span-2" : undefined}
            >
              {f.kind === "select" ? (
                // Zwei sinnvolle Antworten, also eine Auswahl statt Freitext
                // (SPK-029). Was die Regie tatsächlich stellt, trägt sie
                // daneben in ihre eigene Zeile ein.
                <Select
                  id={id}
                  value={wert}
                  placeholder={common.choose}
                  options={Object.entries(
                    (labels[f.vocab ?? ""] ?? {}) as Record<string, string>,
                  ).map(([value, label]) => ({ value, label }))}
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
    </Card>
  );
}
