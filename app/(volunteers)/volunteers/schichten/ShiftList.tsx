"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { confirmShift, declineShift } from "../actions";
import type { MyShift } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  assigned: "accent",
  confirmed: "success",
  waitlisted: "warning",
  no_show: "error",
};

export function ShiftList({
  shifts,
  areas,
  locale,
  dateLocale,
  timeZone,
  t,
  common,
  rpcMessages,
}: {
  shifts: MyShift[];
  /** Vokabular `volunteer_area`; fehlt ein Schlüssel, steht der Schlüssel da. */
  areas: Record<string, string>;
  locale: string;
  dateLocale: string;
  /** Zeitzone der Edition — Schichten stehen in Ortszeit, nicht in Browserzeit. */
  timeZone: string;
  t: Strings;
  common: { cancel: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState<MyShift | null>(null);
  const [reason, setReason] = useState("");

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const day = new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone,
  });
  const time = new Intl.DateTimeFormat(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {shifts.map((s) => (
        <Card key={s.assignment_id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[260px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ct-h3 text-ink">{areas[s.area] ?? s.area}</span>
                <span className="ct-label text-muted">{s.position}</span>
                <Badge tone={TONE[s.status] ?? "neutral"}>
                  {t[`shift_${s.status}`] ?? s.status}
                </Badge>
              </div>
              <p className="ct-help mt-1">
                {(locale === "en" ? s.day_label_en : s.day_label_de) ?? day.format(new Date(s.start_at))}
                {" · "}
                {time.format(new Date(s.start_at))}–{time.format(new Date(s.end_at))}
                {s.location && ` · ${s.location}`}
                {s.lead_name && ` · ${t.leadLabel}: ${s.lead_name}`}
              </p>
              {s.briefing_md && (
                <p className="ct-help mt-2 whitespace-pre-line border-l-2 border-border pl-3">
                  {s.briefing_md}
                </p>
              )}
              {s.status === "waitlisted" && <p className="ct-help mt-2">{t.waitlistHint}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              {s.status === "assigned" && (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(confirmShift(s.assignment_id), t.confirmed)}
                >
                  {t.confirm}
                </Button>
              )}
              {s.status !== "no_show" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setAsking(s);
                    setReason("");
                  }}
                >
                  {t.decline}
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}

      {asking && (
        <ConfirmDialog
          title={t.declineTitle}
          body={t.declineBody}
          detail={
            <Field label={t.declineReason} htmlFor="d-reason" hint={t.declineReasonHint}>
              <Input id="d-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          }
          confirmLabel={t.decline}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const s = asking;
            setAsking(null);
            run(declineShift(s.assignment_id, reason), t.declined);
          }}
        />
      )}
    </div>
  );
}
