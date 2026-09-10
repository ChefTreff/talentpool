"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { confirmBooking, declineBooking, saveQuota } from "../actions";

type Strings = Record<string, string>;

export type AdminBooking = {
  id: string;
  status: string;
  guests: number;
  details: Record<string, string> | null;
  team_note: string | null;
  created_at: string;
  profile_id: string;
  speaker_name: string | null;
};

export type AdminQuota = {
  quota_id: string;
  kind: string;
  tier: string | null;
  label_de: string | null;
  label_en: string | null;
  location: string | null;
  capacity: number;
  used: number;
  waitlisted: number;
  active: boolean;
  window_from: string | null;
  window_to: string | null;
  bookings: AdminBooking[] | null;
};

const TONE: Record<string, BadgeTone> = {
  requested: "accent",
  confirmed: "success",
  waitlisted: "warning",
};

export function HospitalityAdmin({
  quotas,
  editions,
  tiers,
  locale,
  dateLocale,
  t,
  detailLabels,
  common,
  rpcMessages,
}: {
  quotas: AdminQuota[];
  editions: { id: string; name: string }[];
  tiers: Record<string, string>;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  /** `t.speaker` — liefert die `detail_*`-Feldnamen der Buchung. */
  detailLabels: Strings;
  common: { cancel: string; choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [capacity, setCapacity] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  // `window_from`/`window_to` sind echte Zeitpunkte, die Angaben in `details`
  // dagegen reine Kalendertage — die gehören in UTC formatiert, sonst rutscht
  // der 15. westlich von Greenwich auf den 14.
  const bareDate = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const detailLabel = (key: string) => detailLabels[`detail_${key}`] ?? key;
  const detailValue = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? bareDate.format(new Date(`${value}T00:00:00Z`)) : value;
  const label = (q: AdminQuota) =>
    (locale === "en" ? q.label_en : q.label_de) ?? q.label_de ?? "—";
  const note = (id: string) => notes[id] ?? "";

  function run(fn: Promise<{ ok: boolean; key?: string }>, okText: string) {
    startTransition(async () => {
      const res = (await fn) as { ok: boolean; key?: string };
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown"));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  function onCapacity(q: AdminQuota) {
    const value = Number(capacity[q.quota_id]);
    if (!Number.isInteger(value) || value < 0) {
      toast("error", t.capacityInvalid);
      return;
    }
    run(saveQuota({ id: q.quota_id, capacity: value }), t.quotaSaved);
  }

  function onActive(q: AdminQuota) {
    run(saveQuota({ id: q.quota_id, active: !q.active }), t.quotaSaved);
  }

  return (
    <div className="flex flex-col gap-4">
      {editions.length === 0 && <p className="ct-help">{t.noEdition}</p>}

      {quotas.map((q) => (
        <Card key={q.quota_id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ct-h3 text-ink">{label(q)}</span>
                <Badge>{t[`kind_${q.kind}`] ?? q.kind}</Badge>
                {q.tier && <Badge>{tiers[q.tier] ?? q.tier}</Badge>}
                {!q.active && <Badge tone="neutral">{t.inactive}</Badge>}
              </div>
              <p className="ct-help mt-1">
                {q.location}
                {q.window_from && q.window_to && (
                  <>
                    {" · "}
                    {dateOnly.format(new Date(q.window_from))} –{" "}
                    {dateOnly.format(new Date(q.window_to))}
                  </>
                )}
              </p>
              <p className="ct-help mt-1">
                {t.used}: {q.used} / {q.capacity}
                {q.waitlisted > 0 && ` · ${t.waitlisted}: ${q.waitlisted}`}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Field label={t.capacity} htmlFor={`cap-${q.quota_id}`}>
                <Input
                  id={`cap-${q.quota_id}`}
                  type="number"
                  min={0}
                  className="w-24"
                  value={capacity[q.quota_id] ?? String(q.capacity)}
                  onChange={(e) =>
                    setCapacity((c) => ({ ...c, [q.quota_id]: e.target.value }))
                  }
                />
              </Field>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => onCapacity(q)}>
                {common.save}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onActive(q)}>
                {q.active ? t.deactivate : t.activate}
              </Button>
            </div>
          </div>

          {(q.bookings ?? []).length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 border-t pt-3">
              {(q.bookings ?? []).map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-ct-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ct-label">{b.speaker_name || common.none}</span>
                      <Badge tone={TONE[b.status] ?? "neutral"}>
                        {t[`booking_${b.status}`] ?? b.status}
                      </Badge>
                      <span className="ct-help">
                        {t.guests}: {b.guests}
                      </span>
                    </div>
                    {b.details && (
                      <p className="ct-help mt-1">
                        {Object.entries(b.details)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${detailLabel(k)}: ${detailValue(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                    {b.team_note && (
                      <p className="ct-help mt-1">
                        {t.teamNote}: {b.team_note}
                      </p>
                    )}
                  </div>
                  {b.status !== "confirmed" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label={t.teamNote}
                        className="w-44"
                        value={note(b.id)}
                        onChange={(e) => setNotes((n) => ({ ...n, [b.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(confirmBooking(b.id, note(b.id)), t.bookingConfirmed)}
                      >
                        {t.confirm}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending || note(b.id).trim() === ""}
                        onClick={() => run(declineBooking(b.id, note(b.id)), t.bookingDeclined)}
                      >
                        {t.decline}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
