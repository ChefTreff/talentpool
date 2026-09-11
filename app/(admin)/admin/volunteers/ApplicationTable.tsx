"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { setVolunteerStatus } from "./actions";
import { VOLUNTEER_STATUS, type VolunteerDay, type VolunteerRow } from "./types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  applied: "accent",
  accepted: "success",
  declined: "neutral",
  withdrawn: "neutral",
};

export function ApplicationTable({
  rows,
  days,
  areas,
  shirtSizes,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  rows: VolunteerRow[];
  days: VolunteerDay[];
  /** Vokabular `volunteer_area` — leer, solange die Liste 2027 fehlt. */
  areas: Record<string, string>;
  shirtSizes: Record<string, string>;
  locale: string;
  dateLocale: string;
  t: Strings;
  common: { none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [only, setOnly] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, { status: string; note: string }>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const date = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const dayLabel = (id: string) => {
    const d = days.find((x) => x.id === id);
    if (!d) return id.slice(0, 8);
    return (locale === "en" ? d.label_en : d.label_de) ?? d.day_date;
  };
  const state = (r: VolunteerRow) => draft[r.profile_id] ?? { status: r.status, note: "" };

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (only && r.status !== only) return false;
      if (!needle) return true;
      return [r.display_name, r.email, r.buddy_note, ...(r.areas ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, filter, only]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }, [rows]);

  function save(r: VolunteerRow) {
    const s = state(r);
    startTransition(async () => {
      const res = await setVolunteerStatus(r.profile_id, s.status, s.note);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.saved);
      setDraft((d) => {
        const next = { ...d };
        delete next[r.profile_id];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t.search} htmlFor="v-search" className="max-w-xs">
          <Input id="v-search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </Field>
        <Field label={t.colStatus} htmlFor="v-only" className="w-48">
          <Select
            id="v-only"
            value={only}
            placeholder={t.allStatuses}
            options={VOLUNTEER_STATUS.map((s) => ({
              value: s,
              label: `${t[`status_${s}`] ?? s} (${counts[s] ?? 0})`,
            }))}
            onChange={(e) => setOnly(e.target.value)}
          />
        </Field>
        <p className="ct-help pb-2">
          {shown.length} / {rows.length}
        </p>
      </div>

      <Table>
        <Thead>
          <Th>{t.colPerson}</Th>
          <Th>{t.colPrefs}</Th>
          <Th numeric>{t.colShifts}</Th>
          <Th>{t.colStatus}</Th>
          <Th aria-label={t.colAction} />
        </Thead>
        <Tbody>
          {shown.map((r) => {
            const s = state(r);
            const note = typeof r.availability?.note === "string" ? r.availability.note : null;
            return (
              <Tr key={r.profile_id}>
                <Td>
                  <span className="ct-label text-ink">{r.display_name || common.none}</span>
                  <div className="ct-help">{r.email ?? common.none}</div>
                  <div className="ct-help">
                    {t.appliedOn} {date.format(new Date(r.applied_at))}
                    {r.shirt_size && ` · ${shirtSizes[r.shirt_size] ?? r.shirt_size}`}
                  </div>
                </Td>
                <Td className="text-muted">
                  {(r.areas ?? []).length > 0 && (
                    <div>{(r.areas ?? []).map((a) => areas[a] ?? a).join(", ")}</div>
                  )}
                  {(r.day_prefs ?? []).length > 0 && (
                    <div className="ct-help">{(r.day_prefs ?? []).map(dayLabel).join(", ")}</div>
                  )}
                  {note && <div className="ct-help">{note}</div>}
                  {r.buddy_note && (
                    <div className="ct-help">
                      {t.buddy}: {r.buddy_note}
                    </div>
                  )}
                </Td>
                <Td numeric className="tabular-nums">
                  {r.shifts_confirmed}/{r.shifts_assigned + r.shifts_confirmed}
                </Td>
                <Td>
                  <Badge tone={TONE[r.status] ?? "neutral"}>
                    {t[`status_${r.status}`] ?? r.status}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-end gap-2">
                    <Select
                      aria-label={t.colStatus}
                      className="w-36"
                      value={s.status}
                      options={VOLUNTEER_STATUS.map((x) => ({
                        value: x,
                        label: t[`status_${x}`] ?? x,
                      }))}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [r.profile_id]: { ...state(r), status: e.target.value },
                        }))
                      }
                    />
                    <Input
                      aria-label={t.note}
                      className="w-44"
                      placeholder={t.notePlaceholder}
                      value={s.note}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [r.profile_id]: { ...state(r), note: e.target.value },
                        }))
                      }
                    />
                    <Button size="sm" disabled={pending} onClick={() => save(r)}>
                      {common.save}
                    </Button>
                  </div>
                  {/* Zusage und Absage gehen als Mail raus — das soll niemand
                      aus Versehen auslösen. */}
                  {(s.status === "accepted" || s.status === "declined") &&
                    s.status !== r.status && (
                      <p className="ct-help mt-1">{t.sendsMail}</p>
                    )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </div>
  );
}
