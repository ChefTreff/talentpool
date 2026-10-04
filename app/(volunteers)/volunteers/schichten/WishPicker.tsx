"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { MAX_WISHES, shiftHours, WARN_FROM_HOURS } from "@/lib/volunteers/schichten";
import { setMyShiftWishes } from "../actions";
import type { WishableShift } from "../types";

type Strings = Record<string, string>;

/**
 * Wunschschichten (VOL-002, K-44): mindestens eine, höchstens fünf, die Reihenfolge der Auswahl ist
 * die Rangfolge. Gesehen werden nur Bereich, Position, Zeit und Ort — nie, wer sonst eingeteilt ist.
 * Zugeteilt wird im Team; ein Wunsch ist keine Zusage.
 */
export function WishPicker({
  shifts,
  areas,
  locale,
  dateLocale,
  timeZone,
  t,
  rpcMessages,
}: {
  shifts: WishableShift[];
  areas: Record<string, string>;
  locale: string;
  dateLocale: string;
  timeZone: string;
  t: Strings;
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string[]>(() =>
    shifts
      .filter((s) => s.wish_rank !== null)
      .sort((a, b) => (a.wish_rank ?? 0) - (b.wish_rank ?? 0))
      .map((s) => s.id),
  );
  const saved = useMemo(
    () =>
      shifts
        .filter((s) => s.wish_rank !== null)
        .sort((a, b) => (a.wish_rank ?? 0) - (b.wish_rank ?? 0))
        .map((s) => s.id)
        .join(","),
    [shifts],
  );

  const time = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone });
  const dayFmt = new Intl.DateTimeFormat(dateLocale, { weekday: "long", day: "2-digit", month: "2-digit", timeZone });
  const dayLabel = (s: WishableShift) =>
    (locale === "en" ? s.day_label_en : s.day_label_de) ?? dayFmt.format(new Date(s.start_at));

  const groups = useMemo(() => {
    const map = new Map<string, WishableShift[]>();
    for (const s of shifts) {
      const key = dayLabel(s);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, locale]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_WISHES ? p : [...p, id]));
  }

  function save() {
    start(async () => {
      const res = await setMyShiftWishes(picked);
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
        return;
      }
      toast("success", t.wishSaved);
      router.refresh();
    });
  }

  const dirty = picked.join(",") !== saved;

  return (
    <Card>
      <CardHeader ebene="h2" title={t.wishTitle} description={t.wishLead.replace("{max}", String(MAX_WISHES))} />
      {shifts.length === 0 ? (
        <p className="ct-help">{t.wishNone}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([label, list]) => (
            <section key={label} className="flex flex-col gap-1" aria-label={label}>
              <h3 className="ct-label">{label}</h3>
              <ul className="flex flex-col">
                {list.map((s) => {
                  const rank = picked.indexOf(s.id) + 1;
                  const full = picked.length >= MAX_WISHES && rank === 0;
                  return (
                    <li key={s.id} className="border-t py-2">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5"
                          checked={rank > 0}
                          disabled={pending || full}
                          onChange={() => toggle(s.id)}
                        />
                        <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="ct-label">{areas[s.area] ?? s.area}</span>
                          <span>{s.position}</span>
                          <span className="ct-help tabular-nums">
                            {time.format(new Date(s.start_at))}–{time.format(new Date(s.end_at))}
                          </span>
                          {s.location && <span className="ct-help">{s.location}</span>}
                          {shiftHours(s) >= WARN_FROM_HOURS && <Badge tone="warning">{t.wishLong}</Badge>}
                          {rank > 0 && <Badge tone="accent">{t.wishRank.replace("{n}", String(rank))}</Badge>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={pending || picked.length === 0 || !dirty} onClick={save}>
              {t.wishSave}
            </Button>
            <span className="ct-help">
              {picked.length === 0
                ? t.wishAtLeastOne
                : t.wishCount.replace("{n}", String(picked.length)).replace("{max}", String(MAX_WISHES))}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
