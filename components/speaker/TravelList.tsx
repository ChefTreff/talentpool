"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { cn } from "@/components/ui/cn";
import { SuchFeld } from "@/components/ui/SuchFeld";

type Strings = Record<string, string>;

/** Eine Zeile aus `speaker_travel_list()`. */
export type TravelRow = {
  profile_id: string;
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  organization_name: string | null;
  pipeline_status: string;
  owner_person_id: string | null;
  owner_name: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_mode: string | null;
  arrival_ref: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_mode: string | null;
  departure_ref: string | null;
  needs_pickup: boolean;
  note: string | null;
  hotel_label: string | null;
  updated_at: string | null;
};

/**
 * Wer kommt wann. Dieselbe Liste für die Lead-Person und für den
 * Admin-Bereich — wer welche Zeilen sieht, entscheidet die Datenbank
 * (`can_manage_speaker`), nicht die Oberfläche.
 *
 * Gefiltert wird im Browser: die Liste ist auch bei 200 Speakern klein genug,
 * und ein Filter, der die Seite neu lädt, fühlt sich bei einer Ankunftsliste
 * falsch an — man springt zwischen den Tagen hin und her.
 *
 * Standard ist **nach Ankunft sortiert**: das ist die Frage, mit der man auf
 * diese Seite kommt.
 */
export function TravelList({
  rows,
  modes,
  pipelineLabels,
  dateLocale,
  t,
  common,
}: {
  rows: TravelRow[];
  modes: Record<string, string>;
  pipelineLabels: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { choose: string; none: string };
}) {
  const [tag, setTag] = useState("");
  const [mittel, setMittel] = useState("");
  const [nurAbholung, setNurAbholung] = useState(false);
  const [nurOffen, setNurOffen] = useState(false);
  const [suche, setSuche] = useState("");

  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const wochentag = new Intl.DateTimeFormat(dateLocale, { weekday: "short", day: "2-digit", month: "2-digit" });

  /** Alle Tage, an denen jemand an- oder abreist — die Filterleiste baut sich daraus. */
  const tage = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.arrival_date) set.add(r.arrival_date);
      if (r.departure_date) set.add(r.departure_date);
    }
    return [...set].sort();
  }, [rows]);

  const name = (r: TravelRow) =>
    [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return rows.filter((r) => {
      if (tag && r.arrival_date !== tag && r.departure_date !== tag) return false;
      if (mittel && r.arrival_mode !== mittel && r.departure_mode !== mittel) return false;
      if (nurAbholung && !r.needs_pickup) return false;
      // „Noch offen" heisst: kein Ankunftstag eingetragen. Das ist die Liste,
      // hinter der man hinterhertelefoniert.
      if (nurOffen && r.arrival_date !== null) return false;
      if (q) {
        const hay = [name(r), r.organization_name, r.owner_name, r.arrival_ref, r.departure_ref]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tag, mittel, nurAbholung, nurOffen, suche]);

  const offen = rows.filter((r) => r.arrival_date === null).length;
  const zeit = (v: string | null) => (v ? v.slice(0, 5) : null);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="ct-label text-ink">{t.filterDay}</span>
            <Select
              value={tag}
              placeholder={t.allDays}
              options={tage.map((d) => ({
                value: d,
                label: wochentag.format(new Date(`${d}T12:00:00`)),
              }))}
              onChange={(e) => setTag(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ct-label text-ink">{t.filterMode}</span>
            <Select
              value={mittel}
              placeholder={t.allModes}
              options={Object.entries(modes).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setMittel(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="ct-label text-ink">{t.filterSearch}</span>
            <SuchFeld
              value={suche}
              placeholder={t.filterSearchHint}
              onChange={(e) => setSuche(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={nurAbholung}
              onChange={(e) => setNurAbholung(e.target.checked)}
            />
            <span className="ct-small">{t.onlyPickup}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={nurOffen}
              onChange={(e) => setNurOffen(e.target.checked)}
            />
            <span className="ct-small">{t.onlyOpen}</span>
          </label>
          <span className="ct-help ml-auto tabular-nums">
            {t.shown.replace("{n}", String(gefiltert.length)).replace("{total}", String(rows.length))}
            {offen > 0 && ` · ${t.openCount.replace("{n}", String(offen))}`}
          </span>
        </div>
      </Card>

      {gefiltert.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">{t.colPerson}</th>
                  <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">{t.colArrival}</th>
                  <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">{t.colDeparture}</th>
                  <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">{t.colHotel}</th>
                  <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">{t.colOwner}</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((r) => (
                  <tr
                    key={r.profile_id}
                    className={cn(
                      "border-b border-l-2 align-top last:border-b-0",
                      // Ohne Ankunftstag ist die Zeile die Arbeit, nicht das
                      // Ergebnis — sie hebt sich ab.
                      r.arrival_date === null
                        ? "border-l-warning-ink bg-warning-soft/40"
                        : "border-l-transparent",
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="ct-label text-ink">{name(r)}</span>
                      <span className="ct-help block">
                        {[r.job_title, r.organization_name].filter(Boolean).join(" · ") || "—"}
                      </span>
                      <span className="ct-help block">
                        {pipelineLabels[r.pipeline_status] ?? r.pipeline_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.arrival_date ? (
                        <>
                          <span className="ct-small tabular-nums text-ink">
                            {datum.format(new Date(`${r.arrival_date}T12:00:00`))}
                            {zeit(r.arrival_time) && ` · ${zeit(r.arrival_time)}`}
                          </span>
                          <span className="ct-help block">
                            {[modes[r.arrival_mode ?? ""] ?? r.arrival_mode, r.arrival_ref]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </span>
                          {r.needs_pickup && (
                            <span className="mt-1 inline-block">
                              <Badge tone="accent">{t.pickup}</Badge>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="ct-help">{t.notYet}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.departure_date ? (
                        <>
                          <span className="ct-small tabular-nums text-ink">
                            {datum.format(new Date(`${r.departure_date}T12:00:00`))}
                            {zeit(r.departure_time) && ` · ${zeit(r.departure_time)}`}
                          </span>
                          <span className="ct-help block">
                            {[modes[r.departure_mode ?? ""] ?? r.departure_mode, r.departure_ref]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </span>
                        </>
                      ) : (
                        <span className="ct-help">{t.notYet}</span>
                      )}
                    </td>
                    <td className="ct-small px-4 py-3 text-muted">{r.hotel_label ?? common.none}</td>
                    <td className="ct-small px-4 py-3 text-muted">
                      {r.owner_name || common.none}
                      {r.note && <span className="ct-help block">{r.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
