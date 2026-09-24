"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { CheckMark } from "@/components/ui/CheckMark";
import { useToast } from "@/components/ui/Toast";
import { setEventAppStep } from "./actions";

export type Schritt = { key: string; title: string; body: string; important?: boolean };

/** Stand eines Schritts, wie ihn `my_org_steps` liefert. */
export type SchrittStand = { key: string; done_at: string | null; done_by_name: string | null };

type Strings = Record<string, string>;

/**
 * Die Schritte in der Event-App — Archetyp A (Liste), mit Haken.
 *
 * Der Haken ist eine **Selbstauskunft**: was jemand in Swapcard getan hat,
 * sehen wir nicht, es gibt keine Schnittstelle dafür. Konrad hat das am 14.09.
 * entschieden — „die Partner wissen ja, wann sie etwas erledigt haben" — und
 * genau so steht es auch über der Liste. Er landet in der Datenbank, damit die
 * Produktion sieht, wo jemand hängt, statt einzeln nachzufragen.
 *
 * Details klappen auf, genau eine Zeile gleichzeitig — dieselbe Regel wie in
 * der Checkliste.
 */
export function Schritte({
  orgId,
  editionId,
  steps,
  stand,
  canEdit,
  dateLocale,
  t,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  steps: Schritt[];
  stand: SchrittStand[];
  canEdit: boolean;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [offen, setOffen] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const standOf = (key: string) => stand.find((s) => s.key === key) ?? null;
  const erledigt = stand.filter((s) => s.done_at !== null).length;

  function toggle(key: string, done: boolean) {
    startTransition(async () => {
      const res = await setEventAppStep(orgId, editionId, key, done);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.stepSaved);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="schritte">
      <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
        <h2 id="schritte" className="ct-h2 text-ink">
          {t.stepsTitle}
        </h2>
        <span className="ct-help ml-auto tabular-nums">
          {t.stepsLead.replace("{done}", String(erledigt)).replace("{total}", String(steps.length))}
        </span>
      </div>
      {/* Der Satz gehört über die Liste, nicht in eine Fussnote: sonst liest
          sich ein Haken wie eine Prüfung, die wir gar nicht machen können. */}
      <p className="ct-help mb-2">{t.stepsHint}</p>

      <Card className="p-0">
        <ul className="flex flex-col">
          {steps.map((s, i) => {
            const auf = offen === s.key;
            const st = standOf(s.key);
            const done = st?.done_at != null;
            const hakenLabel = done ? t.stepUnmark : t.stepMark;
            return (
              <li key={s.key} className="border-b last:border-b-0">
                <div
                  className={
                    "flex items-center gap-3 border-l-2 py-2.5 pr-4 pl-4 transition-colors hover:bg-surface-hover " +
                    (s.important && !done
                      ? "border-l-accent bg-accent-soft/40"
                      : "border-l-transparent")
                  }
                >
                  {canEdit ? (
                    <button
                      type="button"
                      aria-pressed={done}
                      disabled={pending}
                      onClick={() => toggle(s.key, !done)}
                      // 44 px Ziel um den 20-px-Haken herum, ohne die Zeile
                      // aufzublähen: der Knopf ist quadratisch, der Haken sitzt
                      // mittig.
                      className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-ct-sm p-3 transition-colors hover:bg-surface-hover disabled:opacity-60"
                    >
                      <CheckMark done={done} label={hakenLabel} />
                    </button>
                  ) : (
                    <CheckMark done={done} label={done ? t.stepDoneShort : t.stepOpenShort} />
                  )}

                  <button
                    type="button"
                    aria-expanded={auf}
                    aria-controls={`s-${s.key}`}
                    onClick={() => setOffen(auf ? null : s.key)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span aria-hidden className="ct-help shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <span className={done ? "ct-small text-muted" : "ct-label text-ink"}>
                      {s.title}
                    </span>
                    <svg
                      viewBox="0 0 12 12"
                      className={`ml-1 h-3 w-3 shrink-0 text-muted transition-transform ${auf ? "rotate-90" : ""}`}
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M4.5 3 7.5 6 4.5 9" />
                    </svg>
                  </button>

                  {/* Zweite Spalte wie in der Checkliste — hier steht nicht die
                      Frist, sondern wann es gemeldet wurde. */}
                  <span className="hidden w-40 shrink-0 text-right sm:block">
                    {st?.done_at ? (
                      <span className="ct-small tabular-nums text-muted">
                        {t.stepDone.replace("{date}", datum.format(new Date(st.done_at)))}
                      </span>
                    ) : (
                      <span className="ct-help">—</span>
                    )}
                  </span>
                </div>

                {auf && (
                  <div id={`s-${s.key}`} className="border-t bg-canvas px-4 py-4 sm:pl-14">
                    <p className="ct-small leading-6">{s.body}</p>
                    {st?.done_at && (
                      <p className="ct-help mt-2">
                        {t.stepDone.replace("{date}", datum.format(new Date(st.done_at)))}
                        {st.done_by_name ? ` · ${st.done_by_name}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
