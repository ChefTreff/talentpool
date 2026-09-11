"use client";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = { assigned: "accent", confirmed: "success" };

export type LeadShift = {
  id: string;
  event_day_id: string | null;
  area: string;
  position: string;
  start_at: string;
  end_at: string;
  location: string | null;
  briefing_md: string | null;
  capacity: number;
  overbook: number;
  taken: number;
  people: { name: string | null; status: "assigned" | "confirmed" }[];
};

/**
 * Die eigenen Schichten einer Bereichsleitung.
 *
 * Bewusst wenig: Namen und ob jemand bestätigt hat. Bewerbungen,
 * Mailadressen und Geburtsdaten bleiben beim Team — die RPC gibt sie gar
 * nicht erst heraus.
 */
export function LeadShifts({
  shifts,
  areas,
  dayLabels,
  dateLocale,
  timeZone,
  t,
  common,
}: {
  shifts: LeadShift[];
  areas: Record<string, string>;
  dayLabels: Record<string, string>;
  dateLocale: string;
  timeZone: string;
  t: Strings;
  common: { none: string };
}) {
  const time = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone });

  return (
    <div className="flex flex-col gap-4">
      {shifts.map((s) => {
        const confirmed = s.people.filter((p) => p.status === "confirmed").length;
        return (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="ct-h3 text-ink">{areas[s.area] ?? s.area}</span>
              <span className="ct-label text-muted">{s.position}</span>
              <Badge tone={confirmed === s.people.length && s.people.length > 0 ? "success" : "accent"}>
                {confirmed}/{s.people.length} {t.confirmedOf}
              </Badge>
            </div>
            <p className="ct-help mt-1">
              {s.event_day_id ? (dayLabels[s.event_day_id] ?? "") : ""} ·{" "}
              {time.format(new Date(s.start_at))}–{time.format(new Date(s.end_at))}
              {s.location && ` · ${s.location}`}
            </p>
            {s.briefing_md && (
              <p className="ct-help mt-2 whitespace-pre-line border-l-2 border-border pl-3">
                {s.briefing_md}
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-1">
              {s.people.map((p, i) => (
                <li key={`${s.id}-${i}`} className="flex items-center gap-2">
                  <Badge tone={TONE[p.status] ?? "neutral"}>
                    {t[`lead_${p.status}`] ?? p.status}
                  </Badge>
                  <span className="text-[15px] text-ink">{p.name || common.none}</span>
                </li>
              ))}
              {s.people.length === 0 && <li className="ct-help">{t.leadNobody}</li>}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
