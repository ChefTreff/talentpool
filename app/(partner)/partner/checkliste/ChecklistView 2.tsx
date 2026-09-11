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
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { registerPartnerAsset, submitDeliverable } from "../actions";
import { safeFileName, BUCKET } from "../upload";
import type { Deliverable, DeliverableAsset, PartnerOverview } from "../types";

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
  common,
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
  common: { save: string; cancel: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
    const note = (answers[d.id] ?? "").trim();
    if (note === "") {
      toast("error", message("answers_required"));
      return;
    }
    startTransition(async () => {
      const res = await submitDeliverable(d.id, [], { note });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
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
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.sku ?? "global"} aria-labelledby={`g-${group.sku ?? "global"}`}>
          <h2 id={`g-${group.sku ?? "global"}`} className="ct-h3 mb-1 text-ink">
            {group.label}
          </h2>
          {group.sku && <p className="ct-help mb-3">{group.sku}</p>}
          <ul className="flex flex-col gap-3">
            {group.items.map((d) => {
              const overdue = isOverdue(d);
              const editable = canEdit && EDITABLE.has(d.status);
              const rules: FileRules = d.file_rules;
              return (
                <Card as="li" key={d.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[260px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ct-label text-ink">{label(d)}</span>
                        <Badge tone={overdue ? "warning" : (TONE[d.status] ?? "neutral")}>
                          {overdue && d.status !== "overdue"
                            ? t.status_overdue
                            : (t[`status_${d.status}`] ?? d.status)}
                        </Badge>
                        {!d.required && <span className="ct-help">{t.optional}</span>}
                      </div>
                      {description(d) && <p className="ct-help mt-1">{description(d)}</p>}
                      {d.due_at && (
                        <p className={overdue ? "mt-1 text-[13px] leading-5 text-error-ink" : "ct-help mt-1"}>
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
                        <p className="mt-1 text-[13px] leading-5 text-error-ink">
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
                        <ul className="ct-help mt-2 flex flex-col gap-1">
                          {d.assets.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onDownload(a)}
                                className="ct-link text-left"
                              >
                                {a.filename ?? a.storage_path.split("/").pop()}
                              </button>
                              <span className="tabular-nums">v{a.version}</span>
                              {a.size_bytes != null && (
                                <span>{formatBytes(a.size_bytes)}</span>
                              )}
                              <span>{dateTime.format(new Date(a.created_at))}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {d.type === "form" && d.status !== "open" && d.answers?.note != null && (
                        <p className="ct-help mt-2 whitespace-pre-line">
                          {String(d.answers.note)}
                        </p>
                      )}
                    </div>

                    <div className="flex w-full max-w-[320px] flex-col gap-2">
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
                          <Field
                            label={d.assets.length > 0 ? t.uploadNew : t.upload}
                            htmlFor={`f-${d.id}`}
                            hint={t.uploadHint
                              .replace("{allowed}", (rules?.ext ?? []).map((e) => `.${e}`).join(", "))
                              .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
                          >
                            <input
                              id={`f-${d.id}`}
                              type="file"
                              accept={acceptAttribute(rules)}
                              disabled={uploading !== null || pending}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) void onUpload(d, file);
                              }}
                              className="text-[14px]"
                            />
                          </Field>
                          {uploading === d.id && <p className="ct-help">{t.uploading}</p>}
                        </>
                      ) : d.type === "form" ? (
                        <>
                          <Field label={t.answer} htmlFor={`a-${d.id}`} hint={t.answerHint}>
                            <Textarea
                              id={`a-${d.id}`}
                              rows={4}
                              value={answers[d.id] ?? ""}
                              onChange={(e) =>
                                setAnswers((prev) => ({ ...prev, [d.id]: e.target.value }))
                              }
                            />
                          </Field>
                          <Button
                            size="sm"
                            disabled={pending || (answers[d.id] ?? "").trim() === ""}
                            onClick={() => onSubmitForm(d)}
                          >
                            {t.submit}
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="ct-help">
                            {d.type === "booking" ? t.bookingHint : t.infoHint}
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => onSubmitSimple(d)}
                          >
                            {t.markDone}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
