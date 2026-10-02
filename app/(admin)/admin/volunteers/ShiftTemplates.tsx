"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { hhmm, lengthKind, templateHours, WARN_FROM_HOURS } from "@/lib/volunteers/schichten";
import { applyShiftTemplates, deleteShiftTemplate, saveShiftTemplate } from "./actions";
import type { ShiftTemplate, VolunteerDay } from "./types";

type Strings = Record<string, string>;

type Draft = {
  id: string;
  area: string;
  position: string;
  weekday: string;
  start_time: string;
  end_time: string;
  capacity: string;
  overbook: string;
  location: string;
  briefing_md: string;
  active: boolean;
};

/**
 * Schicht-Vorlagen (VOL-002/S3): einmal je Bereich und Position anlegen, dann auf die gewählten
 * Tage anwenden. Bereits angelegte Schichten bleiben unberührt (idempotent); Ende vor Beginn heißt
 * Folgetag. Zeiten gelten in der Ortszeit des Events. Blöcke ab 8 Stunden bekommen einen Hinweis.
 */
export function ShiftTemplates({
  templates,
  days,
  areas,
  locale,
  t,
  common,
  rpcMessages,
}: {
  templates: ShiftTemplate[];
  days: VolunteerDay[];
  areas: Record<string, string>;
  locale: string;
  t: Strings;
  common: { cancel: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<ShiftTemplate | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [chosenDays, setChosenDays] = useState<string[]>([]);
  const [area, setArea] = useState("");

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  /** 2024-01-01 war ein Montag: so entstehen die Wochentagsnamen in der Sprache der Oberfläche. */
  const weekdayName = (n: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, n)));
  const dayLabel = (d: VolunteerDay) => (locale === "en" ? d.label_en : d.label_de) ?? d.day_date;
  const shown = templates.filter((x) => !area || x.area === area);
  const usedAreas = [...new Set(templates.map((x) => x.area))].sort();

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    start(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function onSave() {
    if (!draft) return;
    if (!draft.area || !draft.position.trim() || !draft.start_time || !draft.end_time) {
      toast("error", message("fields_required"));
      return;
    }
    const data: Record<string, unknown> = {
      area: draft.area,
      position: draft.position.trim(),
      weekday: draft.weekday ? Number(draft.weekday) : null,
      start_time: draft.start_time,
      end_time: draft.end_time,
      capacity: Number(draft.capacity) || 1,
      overbook: Number(draft.overbook) || 0,
      location: draft.location.trim() || null,
      briefing_md: draft.briefing_md.trim() || null,
      active: draft.active,
    };
    if (draft.id) data.id = draft.id;
    start(async () => {
      const res = await saveShiftTemplate(data);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.tplSaved);
      setDraft(null);
      router.refresh();
    });
  }

  function onApply() {
    start(async () => {
      const res = await applyShiftTemplates(selected, chosenDays);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.tplApplied.replace("{n}", String(res.data.created)));
      router.refresh();
    });
  }

  const openDraft = (x?: ShiftTemplate) =>
    setDraft(
      x
        ? {
            id: x.id,
            area: x.area,
            position: x.position,
            weekday: x.weekday ? String(x.weekday) : "",
            start_time: hhmm(x.start_time),
            end_time: hhmm(x.end_time),
            capacity: String(x.capacity),
            overbook: String(x.overbook),
            location: x.location ?? "",
            briefing_md: x.briefing_md ?? "",
            active: x.active,
          }
        : {
            id: "",
            area: area || Object.keys(areas)[0] || "",
            position: "",
            weekday: "",
            start_time: "09:00",
            end_time: "13:00",
            capacity: "1",
            overbook: "0",
            location: "",
            briefing_md: "",
            active: true,
          },
    );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t.tplTitle} description={t.tplLead} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.area} htmlFor="t-area" className="w-56">
            <Select
              id="t-area"
              value={area}
              placeholder={t.allAreas}
              options={usedAreas.map((a) => ({ value: a, label: areas[a] ?? a }))}
              onChange={(e) => setArea(e.target.value)}
            />
          </Field>
          <Button disabled={pending} onClick={() => openDraft()}>
            {t.tplNew}
          </Button>
        </div>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <p className="ct-help">{t.tplNone}</p>
        </Card>
      ) : (
        <Card>
          <ul className="flex flex-col">
            {shown.map((x) => {
              const hours = templateHours(x.start_time, x.end_time);
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-3 first:border-t-0">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    aria-label={`${areas[x.area] ?? x.area} ${x.position}`}
                    checked={selected.includes(x.id)}
                    disabled={!x.active}
                    onChange={() => setSelected((s) => toggle(s, x.id))}
                  />
                  <span className="ct-label">{areas[x.area] ?? x.area}</span>
                  <span>{x.position}</span>
                  {x.weekday && <Badge tone="neutral">{weekdayName(x.weekday)}</Badge>}
                  <span className="ct-help tabular-nums">
                    {hhmm(x.start_time)}–{hhmm(x.end_time)} · {hours.toLocaleString(locale)} h · {x.capacity}{" "}
                    {t.tplSeats}
                  </span>
                  {hours >= WARN_FROM_HOURS && <Badge tone="warning">{t.tplLong}</Badge>}
                  {lengthKind(hours) === "short" && <Badge tone="neutral">{t.tplShort}</Badge>}
                  {!x.active && <Badge tone="neutral">{t.inactive}</Badge>}
                  {x.used > 0 && <span className="ct-help">{t.tplUsed.replace("{n}", String(x.used))}</span>}
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => openDraft(x)}>
                      {t.edit}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeleting(x)}>
                      {t.remove}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {templates.length > 0 && (
        <Card>
          <CardHeader title={t.tplApplyTitle} description={t.tplApplyLead} />
          <div className="flex flex-wrap gap-4">
            {days.map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={chosenDays.includes(d.id)}
                  onChange={() => setChosenDays((s) => toggle(s, d.id))}
                />
                <span>{dayLabel(d)}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={pending || selected.length === 0 || chosenDays.length === 0} onClick={onApply}>
              {t.tplApply}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => setSelected(shown.filter((x) => x.active).map((x) => x.id))}
            >
              {t.tplSelectAll}
            </Button>
            <span className="ct-help">
              {t.tplSelected.replace("{n}", String(selected.length)).replace("{d}", String(chosenDays.length))}
            </span>
          </div>
        </Card>
      )}

      {draft && (
        <Modal label={draft.id ? t.tplEdit : t.tplNew} onCancel={() => setDraft(null)}>
          <h2 className="ct-h3">{draft.id ? t.tplEdit : t.tplNew}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label={t.area} htmlFor="tp-area">
              <Select
                id="tp-area"
                value={draft.area}
                options={Object.entries(areas).map(([value, label]) => ({ value, label }))}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
            </Field>
            <Field label={t.position} htmlFor="tp-pos">
              <Input id="tp-pos" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
            </Field>
            <Field label={t.tplWeekday} htmlFor="tp-wd" hint={t.tplWeekdayHint}>
              <Select
                id="tp-wd"
                value={draft.weekday}
                placeholder={t.tplEveryDay}
                options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: weekdayName(n) }))}
                onChange={(e) => setDraft({ ...draft, weekday: e.target.value })}
              />
            </Field>
            <Field label={t.start} htmlFor="tp-start">
              <Input id="tp-start" type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
            </Field>
            <Field label={t.end} htmlFor="tp-end" hint={t.tplEndHint}>
              <Input id="tp-end" type="time" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
            </Field>
            <Field label={t.capacity} htmlFor="tp-cap">
              <Input id="tp-cap" type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
            </Field>
            <Field label={t.overbook} htmlFor="tp-over" hint={t.overbookHint}>
              <Input id="tp-over" type="number" min={0} value={draft.overbook} onChange={(e) => setDraft({ ...draft, overbook: e.target.value })} />
            </Field>
            <Field label={t.location} htmlFor="tp-loc">
              <Input id="tp-loc" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </Field>
            <label className="ct-label flex items-center gap-2 self-end text-ink">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              {t.activeShift}
            </label>
            <Field label={t.briefing} htmlFor="tp-brief" className="md:col-span-2">
              <Textarea id="tp-brief" rows={3} value={draft.briefing_md} onChange={(e) => setDraft({ ...draft, briefing_md: e.target.value })} />
            </Field>
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={pending} onClick={onSave}>
              {common.save}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setDraft(null)}>
              {common.cancel}
            </Button>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={t.tplDeleteTitle}
          body={t.tplDeleteBody.replace("{name}", `${areas[deleting.area] ?? deleting.area} · ${deleting.position}`)}
          confirmLabel={t.remove}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const x = deleting;
            setDeleting(null);
            setSelected((s) => s.filter((id) => id !== x.id));
            run(deleteShiftTemplate(x.id), t.tplDeleted);
          }}
        />
      )}
    </div>
  );
}
