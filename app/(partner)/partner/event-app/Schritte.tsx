"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Fortschritt } from "@/components/ui/Fortschritt";
import { SchrittMarke, type SchrittZustand } from "@/components/ui/SchrittMarke";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { setEventAppStep } from "./actions";

export type Schritt = { key: string; title: string; body: string; important?: boolean };

/** Stand eines Schritts, wie ihn `my_org_steps` liefert. */
export type SchrittStand = { key: string; done_at: string | null; done_by_name: string | null };

type Strings = Record<string, string>;

/**
 * Die Schritte in der Event-App — als **Weg**, nicht als Liste (PART-074,
 * Konrad 24./25.09.: „noch etwas zu clean“ — „die soll gut aussehen“).
 *
 * Vorbild ist das Muster „Step by step navigation“ des GOV.UK Design System
 * für Abläufe mit festem Anfang und Ende: nummerierte Marken an einer
 * durchgehenden Linie, Details klappen auf. Die Marken sind das Sechseck der
 * Marke (`SchrittMarke`, wie in `StepBar`), die Linie wird von oben nach unten
 * voller — erledigte Strecke Akzent, offene grau. Der nächste offene Schritt
 * trägt die gefüllte Marke: dort geht es weiter.
 *
 * Der Haken ist eine **Selbstauskunft**: was jemand in Swapcard getan hat,
 * sehen wir nicht, es gibt keine Schnittstelle dafür. Konrad hat das am 14.09.
 * entschieden — „die Partner wissen ja, wann sie etwas erledigt haben" — und
 * genau so steht es auch über der Liste. Er landet in der Datenbank, damit die
 * Produktion sieht, wo jemand hängt, statt einzeln nachzufragen.
 *
 * Haken und Aufklappen sind je ein eigener Knopf; Details klappen auf, genau
 * einer gleichzeitig — dieselbe Regel wie in der Checkliste.
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

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const standOf = (key: string) => stand.find((s) => s.key === key) ?? null;
  const istErledigt = (key: string) => standOf(key)?.done_at != null;
  // Gezählt über die Schritte, nicht über den Stand: ein Haken zu einem
  // Schritt, den es nicht mehr gibt, darf die Zahl nicht über die Summe heben.
  const erledigt = steps.filter((s) => istErledigt(s.key)).length;
  const naechster = steps.find((s) => !istErledigt(s.key))?.key ?? null;
  const fortschritt = t.stepsLead.replace("{done}", String(erledigt)).replace("{total}", String(steps.length));
  // Der nächste offene Schritt ist beim Laden aufgeklappt: wer die Seite
  // öffnet, liest gleich, was jetzt zu tun ist (Führung statt Liste).
  const [offen, setOffen] = useState<string | null>(naechster);

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
      <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 id="schritte" className="ct-h2 text-ink">
          {t.stepsTitle}
        </h2>
        {/* Zahl und Balken — nie Balken ohne Zahl (Verbotsliste). */}
        <Fortschritt wert={erledigt} gesamt={steps.length} label={fortschritt} className="w-full sm:ml-auto sm:w-72" />
      </div>
      {/* Der Satz gehört über die Liste, nicht in eine Fussnote: sonst liest
          sich ein Haken wie eine Prüfung, die wir gar nicht machen können. */}
      <p className="ct-help mb-4">{t.stepsHint}</p>

      {/* Die eine Karte der Seite mit Akzent-Umriss (Talent-Muster): um sie
          geht es hier. */}
      <Card className="border-accent p-0">
        <ol className="flex flex-col py-2">
          {steps.map((s, i) => {
            const auf = offen === s.key;
            const st = standOf(s.key);
            const done = st?.done_at != null;
            const zustand: SchrittZustand = done ? "erledigt" : s.key === naechster ? "aktuell" : "offen";
            const hakenLabel = done ? t.stepUnmark : t.stepMark;
            const gemeldet = st?.done_at ? t.stepDone.replace("{date}", datum.format(new Date(st.done_at))) : null;
            return (
              <li key={s.key} className="relative">
                {/* Die Linie zur nächsten Marke. Sie beginnt unter dieser
                    Marke (Zeile 8 px + Knopf 2 px + Marke 40 px) und reicht
                    bis unter den oberen Rand der nächsten — so läuft sie auch
                    neben aufgeklappten Details weiter. Mitte = 16 px Rand +
                    halber 44-px-Knopf. */}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-9.5 top-12.5 -bottom-2.5 w-0.5 -translate-x-1/2",
                      done ? "bg-accent" : "bg-border",
                    )}
                  />
                )}
                <div className="flex items-center gap-3 py-2 pl-4 pr-4 sm:pr-6">
                  {canEdit ? (
                    <button
                      type="button"
                      aria-pressed={done}
                      disabled={pending}
                      onClick={() => toggle(s.key, !done)}
                      title={hakenLabel}
                      // 44 px Ziel um die 40-px-Marke: sie ist der Haken.
                      className="flex size-11 shrink-0 items-center justify-center rounded-ct-sm transition-colors hover:bg-surface-hover disabled:opacity-60"
                    >
                      <SchrittMarke nummer={i + 1} zustand={zustand} />
                      <span className="sr-only">{hakenLabel}</span>
                    </button>
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <SchrittMarke nummer={i + 1} zustand={zustand} />
                      <span className="sr-only">{done ? t.stepDoneShort : t.stepOpenShort}</span>
                    </span>
                  )}

                  <button
                    type="button"
                    aria-expanded={auf}
                    aria-controls={`s-${s.key}`}
                    onClick={() => setOffen(auf ? null : s.key)}
                    className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left"
                  >
                    {/* Der Pfeil hängt am letzten Wort, damit er bei langen
                        Titeln nicht allein in eine neue Zeile rutscht. */}
                    <span className={done ? "ct-small text-muted" : "ct-label text-ink"}>
                      {s.title}
                      <svg
                        viewBox="0 0 12 12"
                        className={`ml-1.5 inline-block h-3 w-3 text-muted transition-transform ${auf ? "rotate-90" : ""}`}
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path d="M4.5 3 7.5 6 4.5 9" />
                      </svg>
                    </span>
                    {/* „Wichtig“ als Wort, nicht nur als Farbe (Design-Regel 4). */}
                    {s.important && !done && <Badge tone="warning">{t.stepImportant}</Badge>}
                    {zustand === "aktuell" && <span className="sr-only">{t.stepCurrent}</span>}
                  </button>

                  {/* Zweite Spalte wie in der Checkliste — hier steht nicht die
                      Frist, sondern wann es gemeldet wurde. */}
                  <span className="hidden w-40 shrink-0 text-right sm:block">
                    {gemeldet ? (
                      <span className="ct-small tabular-nums text-muted">{gemeldet}</span>
                    ) : (
                      <span className="ct-help">—</span>
                    )}
                  </span>
                </div>

                {auf && (
                  // Eingerückt bis unter den Titel: 16 px Rand + 44 px Knopf + 12 px Abstand.
                  <div id={`s-${s.key}`} className="pb-4 pl-18 pr-4 sm:pr-6">
                    <p className="ct-small leading-6">{s.body}</p>
                    {gemeldet && (
                      <p className="ct-help mt-2">
                        {gemeldet}
                        {st?.done_by_name ? ` · ${st.done_by_name}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
