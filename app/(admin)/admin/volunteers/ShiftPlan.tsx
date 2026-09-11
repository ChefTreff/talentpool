"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { assignShift, saveShift, unassignShift } from "./actions";
import {
  candidatesFor,
  freeSeats,
  shiftTotals,
  type ShiftRow,
  type VolunteerDay,
  type VolunteerRow,
} from "./types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  assigned: "accent",
  confirmed: "success",
  waitlisted: "warning",
  no_show: "error",
  declined: "neutral",
};

type Draft = {
  id: string;
  event_day_id: string;
  area: string;
  position: string;
  start_at: string;
  end_at: string;
  capacity: string;
  overbook: string;
  location: string;
  briefing_md: string;
  active: boolean;
};

/** `datetime-local` will „YYYY-MM-DDTHH:MM" in Ortszeit der Edition. */
function toLocalInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Zurück in eine echte Zeit: der Browser des Teams steht nicht zwingend in
 * der Zone der Edition. Wir bilden den Zeitpunkt als UTC, messen den Versatz
 * der Zielzone und rechnen ihn heraus.
 */
function fromLocalInput(value: string, timeZone: string): string | null {
  if (!value) return null;
  const naive = new Date(`${value}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const shown = new Date(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(naive)
      .replace(" ", "T") + "Z",
  );
  return new Date(naive.getTime() * 2 - shown.getTime()).toISOString();
}

export function ShiftPlan({
  shifts,
  volunteers,
  days,
  areas,
  timeZone,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  shifts: ShiftRow[];
  volunteers: VolunteerRow[];
  days: VolunteerDay[];
  areas: Record<string, string>;
  timeZone: string;
  locale: string;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState("");
  const [area, setArea] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const time = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone });
  const dayName = (id: string | null) => {
    const d = days.find((x) => x.id === id);
    if (!d) return t.noDay;
    return (locale === "en" ? d.label_en : d.label_de) ?? d.day_date;
  };

  const shown = useMemo(
    () =>
      shifts.filter(
        (s) => (!day || s.event_day_id === day) && (!area || s.area === area),
      ),
    [shifts, day, area],
  );
  const totals = useMemo(() => shiftTotals(shown), [shown]);
  const usedAreas = useMemo(() => [...new Set(shifts.map((s) => s.area))].sort(), [shifts]);

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

  function emptyDraft(): Draft {
    return {
      id: "",
      event_day_id: day || days[0]?.id || "",
      area: area || Object.keys(areas)[0] || "",
      position: "",
      start_at: "",
      end_at: "",
      capacity: "1",
      overbook: "0",
      location: "",
      briefing_md: "",
      active: true,
    };
  }

  function editDraft(s: ShiftRow): Draft {
    return {
      id: s.id,
      event_day_id: s.event_day_id ?? "",
      area: s.area,
      position: s.position,
      start_at: toLocalInput(s.start_at, timeZone),
      end_at: toLocalInput(s.end_at, timeZone),
      capacity: String(s.capacity),
      overbook: String(s.overbook),
      location: s.location ?? "",
      briefing_md: s.briefing_md ?? "",
      active: s.active,
    };
  }

  function onSaveShift() {
    if (!draft) return;
    const start = fromLocalInput(draft.start_at, timeZone);
    const end = fromLocalInput(draft.end_at, timeZone);
    if (!draft.area || !draft.position.trim() || !start || !end) {
      toast("error", message("fields_required"));
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast("error", t.endBeforeStart);
      return;
    }
    const data: Record<string, unknown> = {
      area: draft.area,
      position: draft.position.trim(),
      start_at: start,
      end_at: end,
      capacity: Number(draft.capacity) || 0,
      overbook: Number(draft.overbook) || 0,
      location: draft.location.trim() || null,
      briefing_md: draft.briefing_md.trim() || null,
      active: draft.active,
      event_day_id: draft.event_day_id || null,
    };
    if (draft.id) data.id = draft.id;
    startTransition(async () => {
      const res = await saveShift(data);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.shiftSaved);
      setDraft(null);
      router.refresh();
    });
  }

  if (Object.keys(areas).length === 0) {
    return (
      <Card>
        <CardHeader title={t.noAreasTitle} description={t.noAreasBody} />
        <p className="ct-help">{t.noAreasHint}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.day} htmlFor="s-day" className="w-56">
            <Select
              id="s-day"
              value={day}
              placeholder={t.allDays}
              options={days.map((d) => ({
                value: d.id,
                label: (locale === "en" ? d.label_en : d.label_de) ?? d.day_date,
              }))}
              onChange={(e) => setDay(e.target.value)}
            />
          </Field>
          <Field label={t.area} htmlFor="s-area" className="w-56">
            <Select
              id="s-area"
              value={area}
              placeholder={t.allAreas}
              options={usedAreas.map((a) => ({ value: a, label: areas[a] ?? a }))}
              onChange={(e) => setArea(e.target.value)}
            />
          </Field>
          <Button disabled={pending} onClick={() => setDraft(emptyDraft())}>
            {t.newShift}
          </Button>
        </div>
        <p className="ct-help mt-3">
          {totals.shifts} {t.shifts} · {totals.taken}/{totals.seats} {t.seatsTaken} ·{" "}
          {totals.open} {t.seatsOpen}
          {totals.waitlisted > 0 && ` · ${totals.waitlisted} ${t.onWaitlist}`}
        </p>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <p className="ct-help">{t.noShifts}</p>
        </Card>
      ) : (
        shown.map((s) => {
          const free = freeSeats(s);
          const options = candidatesFor(s, volunteers);
          return (
            <Card key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ct-h3 text-ink">{areas[s.area] ?? s.area}</span>
                    <span className="ct-label text-muted">{s.position}</span>
                    {!s.active && <Badge tone="neutral">{t.inactive}</Badge>}
                    <Badge tone={free > 0 ? "warning" : "success"}>
                      {s.taken}/{s.capacity + s.overbook}
                    </Badge>
                    {s.waitlisted > 0 && (
                      <Badge tone="neutral">
                        {s.waitlisted} {t.onWaitlist}
                      </Badge>
                    )}
                  </div>
                  <p className="ct-help mt-1">
                    {dayName(s.event_day_id)} · {time.format(new Date(s.start_at))}–
                    {time.format(new Date(s.end_at))}
                    {s.location && ` · ${s.location}`}
                    {s.overbook > 0 && ` · ${t.overbookBy} ${s.overbook}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setDraft(editDraft(s))}
                >
                  {t.edit}
                </Button>
              </div>

              <ul className="mt-3 flex flex-col gap-1">
                {s.people.map((p) => (
                  <li key={p.assignment_id} className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[p.status] ?? "neutral"}>
                      {t[`assign_${p.status}`] ?? p.status}
                    </Badge>
                    <span className="text-[15px] text-ink">{p.name || common.none}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(unassignShift(p.assignment_id), t.removed)}
                    >
                      {t.remove}
                    </Button>
                  </li>
                ))}
                {s.people.length === 0 && <li className="ct-help">{t.nobodyYet}</li>}
              </ul>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label={t.addPerson} htmlFor={`p-${s.id}`}>
                  <Select
                    id={`p-${s.id}`}
                    className="w-64"
                    value={pick[s.id] ?? ""}
                    placeholder={options.length ? t.choosePerson : t.noCandidates}
                    disabled={options.length === 0}
                    options={options.map((v) => ({
                      value: v.person_id,
                      label: `${v.display_name || v.email || v.person_id.slice(0, 8)}`,
                    }))}
                    onChange={(e) => setPick((p) => ({ ...p, [s.id]: e.target.value }))}
                  />
                </Field>
                <Button
                  size="sm"
                  disabled={pending || !pick[s.id]}
                  onClick={() =>
                    run(assignShift(s.id, pick[s.id]), free > 0 ? t.assigned : t.waitlisted)
                  }
                >
                  {free > 0 ? t.assign : t.putOnWaitlist}
                </Button>
                {free <= 0 && <p className="ct-help">{t.fullHint}</p>}
              </div>
            </Card>
          );
        })
      )}

      {draft && (
        <Modal label={draft.id ? t.editShift : t.newShift} onCancel={() => setDraft(null)}>
          <h2 className="ct-h3">{draft.id ? t.editShift : t.newShift}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label={t.area} htmlFor="d-area">
              <Select
                id="d-area"
                value={draft.area}
                options={Object.entries(areas).map(([value, label]) => ({ value, label }))}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
            </Field>
            <Field label={t.position} htmlFor="d-pos">
              <Input
                id="d-pos"
                value={draft.position}
                onChange={(e) => setDraft({ ...draft, position: e.target.value })}
              />
            </Field>
            <Field label={t.day} htmlFor="d-day">
              <Select
                id="d-day"
                value={draft.event_day_id}
                placeholder={t.noDay}
                options={days.map((d) => ({
                  value: d.id,
                  label: (locale === "en" ? d.label_en : d.label_de) ?? d.day_date,
                }))}
                onChange={(e) => setDraft({ ...draft, event_day_id: e.target.value })}
              />
            </Field>
            <Field label={t.location} htmlFor="d-loc">
              <Input
                id="d-loc"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
            </Field>
            <Field label={t.start} htmlFor="d-start" hint={timeZone}>
              <Input
                id="d-start"
                type="datetime-local"
                value={draft.start_at}
                onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
              />
            </Field>
            <Field label={t.end} htmlFor="d-end" hint={timeZone}>
              <Input
                id="d-end"
                type="datetime-local"
                value={draft.end_at}
                onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
              />
            </Field>
            <Field label={t.capacity} htmlFor="d-cap">
              <Input
                id="d-cap"
                type="number"
                min={0}
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
              />
            </Field>
            <Field label={t.overbook} htmlFor="d-over" hint={t.overbookHint}>
              <Input
                id="d-over"
                type="number"
                min={0}
                value={draft.overbook}
                onChange={(e) => setDraft({ ...draft, overbook: e.target.value })}
              />
            </Field>
            <Field label={t.briefing} htmlFor="d-brief" className="md:col-span-2">
              <Textarea
                id="d-brief"
                rows={3}
                value={draft.briefing_md}
                onChange={(e) => setDraft({ ...draft, briefing_md: e.target.value })}
              />
            </Field>
            <label className="ct-label flex items-center gap-2 text-ink">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              {t.activeShift}
            </label>
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={pending} onClick={onSaveShift}>
              {common.save}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setDraft(null)}>
              {common.cancel}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
