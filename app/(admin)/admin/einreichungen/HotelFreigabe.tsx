"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { confirmBooking, declineBooking } from "../actions";
import type { AdminBooking, AdminQuota } from "../hospitality/HospitalityAdmin";

type Strings = Record<string, string>;

/** Eine offene Buchung mit dem Kontingent, in dem sie liegt. */
export type OffeneBuchung = AdminBooking & {
  quota: Pick<AdminQuota, "quota_id" | "kind" | "tier" | "label_de" | "label_en" | "location">;
};

const TONE: Record<string, BadgeTone> = {
  requested: "accent",
  waitlisted: "warning",
};

/**
 * Hotelbuchungen, die auf eine Entscheidung warten (ADM-072): angefragt oder auf
 * der Warteliste. Bestätigen oder ablehnen — dieselben Aktionen wie früher im
 * Kontingent unter `/admin/hospitality`, dort steht jetzt nur noch die Liste.
 *
 * Ablehnen verlangt eine Anmerkung (der Speaker bekommt sie), Bestätigen nimmt
 * sie mit, wenn eine da ist.
 */
export function HotelFreigabe({
  buchungen,
  locale,
  dateLocale,
  t,
  detailLabels,
  common,
  rpcMessages,
}: {
  buchungen: OffeneBuchung[];
  locale: Locale;
  dateLocale: string;
  /** `admin.hospitality` */
  t: Strings;
  /** `t.speaker` — liefert die `detail_*`-Feldnamen der Buchung. */
  detailLabels: Strings;
  common: { none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  // Die Angaben in `details` sind reine Kalendertage — in UTC formatiert, sonst
  // rutscht der 15. westlich von Greenwich auf den 14.
  const bareDate = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeZone: "UTC" });
  const detailLabel = (key: string) => detailLabels[`detail_${key}`] ?? key;
  const detailValue = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? bareDate.format(new Date(`${value}T00:00:00Z`)) : value;
  const quotaName = (q: OffeneBuchung["quota"]) =>
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

  return (
    <ul className="flex flex-col gap-3">
      {buchungen.map((b) => (
        <Card as="li" key={b.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ct-h3 text-ink">{b.speaker_name || common.none}</span>
                <Badge tone={TONE[b.status] ?? "neutral"}>{t[`booking_${b.status}`] ?? b.status}</Badge>
                <span className="ct-help">
                  {t.guests}: {b.guests}
                </span>
              </div>
              <p className="ct-help mt-1">
                {quotaName(b.quota)}
                {b.quota.location ? ` · ${b.quota.location}` : ""}
                {` · ${t[`kind_${b.quota.kind}`] ?? b.quota.kind}`}
              </p>
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
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={t.teamNote}
                className="w-45"
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
          </div>
        </Card>
      ))}
    </ul>
  );
}
