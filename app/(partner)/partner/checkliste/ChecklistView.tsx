"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptAttribute,
  checkFileRules,
  formatBytes,
  type FileRules,
} from "@/lib/partner/file-rules";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { registerPartnerAsset, submitDeliverable } from "../actions";
import { safeFileName, BUCKET } from "../upload";
import type { AnswerField, Deliverable, DeliverableAsset, PartnerOverview } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  open: "neutral",
  submitted: "accent",
  accepted: "success",
  rejected: "error",
  overdue: "warning",
};

/** Status, in denen die Partnerseite noch etwas tun kann (wie `submit_deliverable`). */
const EDITABLE = new Set(["open", "rejected", "overdue"]);

export type ChecklistGroup = {
  /** `null` = gilt für alle, unabhängig von einer Leistung. */
  sku: string | null;
  label: string;
  items: Deliverable[];
};

export function ChecklistView({
  orgId,
  editionId,
  groups,
  booth,
  canEdit,
  locale,
  dateLocale,
  t,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  groups: ChecklistGroup[];
  booth: PartnerOverview["booth"];
  canEdit: boolean;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  /** Welche Zeile ist aufgeklappt. Genau eine — sonst ist es wieder eine Wand. */
  const [offen, setOffen] = useState<string | null>(null);
  // Antworten je Pflicht: der Schlüssel ist das Feld aus `answers_schema`,
  // ohne Schema steht alles unter `note`.
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  // In der Zeile nur das Datum: die Uhrzeit interessiert erst im Detail, und
  // eine Spalte, die umbricht, ist keine Spalte mehr.
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const label = (d: Deliverable) =>
    (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;
  const description = (d: Deliverable) =>
    (locale === "en" ? d.description_en : d.description_de) ?? d.description_de;

  /**
   * Überfällig färbt der Client mit, solange das Housekeeping den Status noch
   * nicht nachgezogen hat — eingereicht werden darf trotzdem (Kontrakt B4).
   */
  const isOverdue = (d: Deliverable) =>
    d.status === "overdue" ||
    (EDITABLE.has(d.status) && d.due_at !== null && new Date(d.due_at) < new Date());

  /**
   * Im Kennzeichen steht, was zu tun ist. „Zurückgewiesen" wiegt schwerer als
   * „überfällig": die Rückmeldung ist der Grund, warum es noch offen ist. Das
   * Datum darunter bleibt rot.
   */
  const badgeStatus = (d: Deliverable) =>
    d.status === "open" && isOverdue(d) ? "overdue" : d.status;

  const answerOf = (d: Deliverable, key: string) => answers[d.id]?.[key] ?? "";
  const setAnswer = (d: Deliverable, key: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [d.id]: { ...(prev[d.id] ?? {}), [key]: value } }));
  const fieldLabel = (f: AnswerField) =>
    (locale === "en" ? f.label_en : f.label_de) ?? f.label_de ?? f.key;

  /** Alle Pflichtfelder gefüllt? Die RPC prüft es noch einmal. */
  function formComplete(d: Deliverable): boolean {
    const schema = d.answers_schema;
    if (!schema) return answerOf(d, "note").trim() !== "";
    return schema
      .filter((f) => f.required)
      // `boolean` gilt als beantwortet, sobald angehakt ist; alles andere
      // braucht einen Wert.
      .every((f) =>
        f.type === "boolean" ? answerOf(d, f.key) === "true" : answerOf(d, f.key).trim() !== "",
      );
  }

  /** Antworten so formen, wie die Felder es vorgeben (Zahl, Wahrheitswert …). */
  function answerPayload(d: Deliverable): Record<string, unknown> {
    const schema = d.answers_schema;
    if (!schema) return { note: answerOf(d, "note").trim() };
    const out: Record<string, unknown> = {};
    for (const f of schema) {
      const raw = answerOf(d, f.key);
      if (f.type === "boolean") out[f.key] = raw === "true";
      else if (raw.trim() === "") continue;
      else if (f.type === "number") out[f.key] = Number(raw);
      else out[f.key] = raw.trim();
    }
    return out;
  }

  async function onUpload(d: Deliverable, file: File) {
    const rules: FileRules = d.file_rules;
    const bad = checkFileRules(file, rules);
    if (bad) {
      const allowed = (rules?.ext ?? []).map((e) => `.${e}`).join(", ");
      toast(
        "error",
        bad.reason === "size"
          ? t.uploadTooBig.replace("{max}", bad.detail)
          : t.uploadWrongType.replace("{allowed}", allowed).replace("{got}", bad.detail),
      );
      return;
    }
    setUploading(d.id);
    try {
      const supabase = createSupabaseBrowserClient();
      // Die Art im Pfad ist der Schlüssel der Pflicht — dieselbe Regel prüft
      // die Storage-Policy und danach `register_partner_asset` noch einmal.
      const path = `${editionId}/${orgId}/${d.key}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (up.error) {
        toast("error", `${t.uploadFailed} (${up.error.message})`);
        return;
      }
      const reg = await registerPartnerAsset({
        orgId,
        kind: d.key,
        storagePath: path,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size,
        deliverableId: d.id,
      });
      if (!reg.ok) {
        // Die Datei bleibt verwaist im Bucket; sie hier zu löschen wäre der
        // zweite Fehlerfall. Lieber melden und aufräumen lassen.
        toast("error", message(reg.key) + (reg.detail ? ` (${reg.detail})` : ""));
        return;
      }
      const sub = await submitDeliverable(d.id, [reg.data.id]);
      if (!sub.ok) {
        toast("error", message(sub.key) + (sub.detail ? ` (${sub.detail})` : ""));
        return;
      }
      toast("success", t.submitted.replace("{v}", String(reg.data.version)));
      router.refresh();
    } finally {
      setUploading(null);
    }
  }

  function onSubmitSimple(d: Deliverable) {
    startTransition(async () => {
      const res = await submitDeliverable(d.id, [], {});
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.markedDone);
      router.refresh();
    });
  }

  function onSubmitForm(d: Deliverable) {
    if (!formComplete(d)) {
      toast("error", message("answers_required"));
      return;
    }
    startTransition(async () => {
      const res = await submitDeliverable(d.id, [], answerPayload(d));
      if (!res.ok) {
        // `answers_incomplete` nennt das fehlende Feld im Detail — den
        // Schlüssel übersetzen wir in die Beschriftung, die danebensteht.
        const field = d.answers_schema?.find((f) => f.key === res.detail);
        toast(
          "error",
          message(res.key) +
            (field ? ` (${fieldLabel(field)})` : res.detail ? ` (${res.detail})` : ""),
        );
        return;
      }
      toast("success", t.markedDone);
      router.refresh();
    });
  }

  async function onDownload(asset: DeliverableAsset) {
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

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.sku ?? "global"} aria-labelledby={`g-${group.sku ?? "global"}`}>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 id={`g-${group.sku ?? "global"}`} className="ct-h3 text-ink">
              {group.label}
            </h2>
            {group.sku && <span className="ct-help">{group.sku}</span>}
            <span className="ct-help ml-auto tabular-nums">
              {t.groupDone
                .replace("{done}", String(group.items.filter((d) => badgeStatus(d) === "accepted").length))
                .replace("{total}", String(group.items.length))}
            </span>
          </div>

          {/* Eine Liste, keine Kartenwand: Haken links, Aufgabe in der Mitte,
              Frist rechts. Details stehen erst beim Aufklappen da — vorher
              erschlug die Seite mit allem auf einmal und man erkannte nicht,
              dass es eine Checkliste ist (Konrads Befund). */}
          <Card className="p-0">
            <ul className="flex flex-col">
              {group.items.map((d) => {
                const overdue = isOverdue(d);
                const editable = canEdit && EDITABLE.has(d.status);
                const rules: FileRules = d.file_rules;
                const status = badgeStatus(d);
                const erledigt = status === "accepted";
                const auf = offen === d.id;
                return (
                  <li key={d.id} className="border-b last:border-b-0">
                    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover">
                      <Haken done={erledigt} label={erledigt ? t.doneLabel : t.openLabel} />

                      <button
                        type="button"
                        aria-expanded={auf}
                        aria-controls={`d-${d.id}`}
                        onClick={() => setOffen(auf ? null : d.id)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className={erledigt ? "ct-label text-muted" : "ct-label text-ink"}>
                          {label(d)}
                        </span>
                        {!d.required && <span className="ct-help">{t.optional}</span>}
                        <svg
                          viewBox="0 0 12 12"
                          className={`ml-1 h-3 w-3 shrink-0 text-muted transition-transform ${auf ? "rotate-90" : ""}`}
                          aria-hidden
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        >
                          <path d="M4.5 3 7.5 6 4.5 9" />
                        </svg>
                      </button>

                      {/* Eigene Spalte, wie Konrad es wollte: die Frist ist das
                          zweite, wonach man in einer Checkliste schaut. */}
                      <span className="hidden w-[160px] shrink-0 text-right sm:block">
                        {d.due_at ? (
                          <span className={overdue ? "ct-help tabular-nums text-error-ink" : "ct-help tabular-nums"}>
                            {dateOnly.format(new Date(d.due_at))}
                          </span>
                        ) : (
                          <span className="ct-help">—</span>
                        )}
                      </span>

                      <Badge tone={TONE[status] ?? "neutral"}>{t[`status_${status}`] ?? status}</Badge>
                    </div>

                    {auf && (
                      <div id={`d-${d.id}`} className="flex flex-col gap-4 border-t bg-canvas px-4 py-4 sm:flex-row sm:px-14">
                        <div className="min-w-0 flex-1">
                          {description(d) && <p className="ct-small leading-6">{description(d)}</p>}
                          {d.due_at && (
                            <p className={overdue ? "mt-2 ct-help text-error-ink" : "mt-2 ct-help"}>
                              {t.dueOn} {dateTime.format(new Date(d.due_at))}
                              {overdue && ` · ${t.stillPossible}`}
                            </p>
                          )}
                          {d.submitted_at && (
                            <p className="ct-help mt-1">
                              {t.submittedOn} {dateTime.format(new Date(d.submitted_at))}
                            </p>
                          )}
                          {d.review_note && (
                            <p className="mt-1 ct-help leading-5 text-error-ink">
                              {t.reviewNote}: {d.review_note}
                            </p>
                          )}

                          {/* Rückwand: die Maße gehören neben den Upload. */}
                          {d.key === "backdrop_print" && (
                            <p className="ct-help mt-2">
                              {booth?.backdrop_w_mm && booth?.backdrop_h_mm
                                ? t.backdropSize
                                    .replace("{w}", String(booth.backdrop_w_mm))
                                    .replace("{h}", String(booth.backdrop_h_mm))
                                : t.backdropSizeSoon}
                            </p>
                          )}

                          {d.assets.length > 0 && (
                            <ul className="ct-help mt-3 flex flex-col gap-1">
                              {d.assets.map((a) => (
                                <li key={a.id} className="flex flex-wrap items-center gap-2">
                                  <button type="button" onClick={() => onDownload(a)} className="ct-link text-left">
                                    {a.filename ?? a.storage_path.split("/").pop()}
                                  </button>
                                  <span className="tabular-nums">v{a.version}</span>
                                  {a.size_bytes != null && <span>{formatBytes(a.size_bytes)}</span>}
                                  <span>{dateTime.format(new Date(a.created_at))}</span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {d.type === "form" &&
                            d.status !== "open" &&
                            Object.keys(d.answers ?? {}).length > 0 && (
                              <dl className="ct-help mt-3 flex flex-col gap-0.5">
                                {Object.entries(d.answers).map(([key, value]) => {
                                  const field = d.answers_schema?.find((f) => f.key === key);
                                  return (
                                    <div key={key} className="flex flex-wrap gap-1">
                                      <dt className="font-semibold">{field ? fieldLabel(field) : key}:</dt>
                                      <dd className="whitespace-pre-line">
                                        {typeof value === "boolean" ? (value ? t.yes : t.no) : String(value)}
                                      </dd>
                                    </div>
                                  );
                                })}
                              </dl>
                            )}
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:max-w-[320px]">
                          {!editable ? (
                            <p className="ct-help">
                              {d.status === "submitted"
                                ? t.waitingForReview
                                : d.status === "accepted"
                                  ? t.nothingToDo
                                  : t.noRights}
                            </p>
                          ) : d.type === "upload" ? (
                            <>
                              <FileButton
                                label={d.assets.length > 0 ? t.uploadNew : t.upload}
                                accept={acceptAttribute(rules)}
                                disabled={uploading !== null || pending}
                                hint={t.uploadHint
                                  .replace("{allowed}", (rules?.ext ?? []).map((e) => `.${e}`).join(", "))
                                  .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
                                onFile={(file) => void onUpload(d, file)}
                              />
                              {uploading === d.id && <p className="ct-help">{t.uploading}</p>}
                            </>
                          ) : d.type === "form" ? (
                            <>
                              {(d.answers_schema ?? []).length > 0 ? (
                                d.answers_schema!.map((f) => (
                                  <Field
                                    key={f.key}
                                    label={fieldLabel(f)}
                                    htmlFor={`a-${d.id}-${f.key}`}
                                    required={f.required}
                                    requiredLabel={t.requiredLabel}
                                  >
                                    {f.type === "textarea" ? (
                                      <Textarea
                                        id={`a-${d.id}-${f.key}`}
                                        rows={4}
                                        value={answerOf(d, f.key)}
                                        onChange={(e) => setAnswer(d, f.key, e.target.value)}
                                      />
                                    ) : f.type === "select" ? (
                                      <Select
                                        id={`a-${d.id}-${f.key}`}
                                        value={answerOf(d, f.key)}
                                        placeholder={t.choose}
                                        options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                                        onChange={(e) => setAnswer(d, f.key, e.target.value)}
                                      />
                                    ) : f.type === "boolean" ? (
                                      <input
                                        id={`a-${d.id}-${f.key}`}
                                        type="checkbox"
                                        className="h-5 w-5"
                                        checked={answerOf(d, f.key) === "true"}
                                        onChange={(e) => setAnswer(d, f.key, e.target.checked ? "true" : "false")}
                                      />
                                    ) : (
                                      <Input
                                        id={`a-${d.id}-${f.key}`}
                                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                                        value={answerOf(d, f.key)}
                                        onChange={(e) => setAnswer(d, f.key, e.target.value)}
                                      />
                                    )}
                                  </Field>
                                ))
                              ) : (
                                <Field label={t.answer} htmlFor={`a-${d.id}-note`} hint={t.answerHint}>
                                  <Textarea
                                    id={`a-${d.id}-note`}
                                    rows={4}
                                    value={answerOf(d, "note")}
                                    onChange={(e) => setAnswer(d, "note", e.target.value)}
                                  />
                                </Field>
                              )}
                              <Button size="sm" disabled={pending || !formComplete(d)} onClick={() => onSubmitForm(d)}>
                                {t.submit}
                              </Button>
                            </>
                          ) : d.fulfilled_by_sku ? (
                            <p className="ct-help">{t.fulfilledByShop}</p>
                          ) : (
                            <>
                              <p className="ct-help">{d.type === "booking" ? t.bookingHint : t.infoHint}</p>
                              <Button size="sm" variant="secondary" disabled={pending} onClick={() => onSubmitSimple(d)}>
                                {t.markDone}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

/**
 * Der Haken links in der Zeile. Zustand in Form **und** Farbe: ein erledigter
 * Punkt trägt das Häkchen, ein offener einen leeren Ring — wer Farben nicht
 * unterscheidet, sieht den Unterschied trotzdem.
 */
function Haken({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      title={label}
      className={
        done
          ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-ink text-surface"
          : "h-5 w-5 shrink-0 rounded-full border-2 border-border-strong"
      }
    >
      {done && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
