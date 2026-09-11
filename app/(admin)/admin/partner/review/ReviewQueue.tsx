"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/partner/file-rules";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { reviewDeliverable } from "../actions";
import type { ReviewItem } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  submitted: "accent",
  overdue: "warning",
  rejected: "error",
  accepted: "success",
};

export function ReviewQueue({
  items,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  items: ReviewItem[];
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const note = (id: string) => notes[id] ?? "";
  const label = (d: ReviewItem) =>
    (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;

  function decide(item: ReviewItem, accepted: boolean) {
    startTransition(async () => {
      const res = await reviewDeliverable(item.id, accepted, note(item.id));
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", accepted ? t.accepted : t.rejected);
      router.refresh();
    });
  }

  /** Vorschau über eine signierte URL — der Bucket bleibt privat. */
  async function open(path: string) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from("partner-assets")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast("error", t.openFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <Card key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[280px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ct-label text-ink">{item.org_name ?? common.none}</span>
                <span className="ct-h3 text-ink">{label(item)}</span>
                <Badge tone={TONE[item.status] ?? "neutral"}>
                  {t[`status_${item.status}`] ?? item.status}
                </Badge>
              </div>
              <p className="ct-help mt-1">
                {item.submitted_at && `${t.submittedOn} ${dateTime.format(new Date(item.submitted_at))}`}
                {item.submitted_by_name && ` · ${item.submitted_by_name}`}
                {item.due_at && ` · ${t.dueOn} ${dateTime.format(new Date(item.due_at))}`}
              </p>
              {item.review_note && (
                <p className="ct-help mt-1 text-error-ink">
                  {t.lastNote}: {item.review_note}
                </p>
              )}

              {item.assets.length > 0 && (
                <ul className="ct-help mt-2 flex flex-col gap-1">
                  {item.assets.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => open(a.storage_path)}
                        className="ct-link text-left"
                      >
                        {a.filename ?? a.storage_path.split("/").pop()}
                      </button>
                      {a.size_bytes != null && <span>{formatBytes(a.size_bytes)}</span>}
                      {a.mime && <span>{a.mime}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {item.answers && Object.keys(item.answers).length > 0 && (
                <dl className="ct-help mt-2 flex flex-col gap-0.5">
                  {Object.entries(item.answers).map(([key, value]) => (
                    <div key={key} className="flex flex-wrap gap-1">
                      <dt className="font-semibold">{key}:</dt>
                      <dd className="whitespace-pre-line">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className="flex w-full max-w-[320px] flex-col gap-2">
              <Field label={t.note} htmlFor={`n-${item.id}`} hint={t.noteHint}>
                <Input
                  id={`n-${item.id}`}
                  value={note(item.id)}
                  onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending} onClick={() => decide(item, true)}>
                  {t.accept}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  // `review_deliverable` verlangt bei einer Ablehnung einen
                  // Grund (22023 `note_required`) — also erst gar nicht anbieten.
                  disabled={pending || note(item.id).trim() === ""}
                  onClick={() => decide(item, false)}
                >
                  {t.reject}
                </Button>
              </div>
              {note(item.id).trim() === "" && <p className="ct-help">{t.rejectNeedsNote}</p>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
