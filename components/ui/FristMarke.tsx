"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn";

export type FristTexte = {
  /** Zeile über dem Datum, z. B. „Frist" oder „Datei bis". */
  label: string;
  /** „noch {n} Tage" */
  days: string;
  /** „noch {n} Stunden" */
  hours: string;
  /** Weniger als eine Stunde, z. B. „heute fällig". */
  soon: string;
  /** Frist verstrichen, z. B. „vorbei". */
  passed: string;
  /** Aufgabe erledigt, z. B. „erledigt". */
  done: string;
};

type Stand = "offen" | "bald" | "vorbei" | "erledigt";

/** Farbe **und** Wort je Stand (Design-Regel 4). Alle Paare gemessen ≥ 4,9:1. */
const TON: Record<Stand, string> = {
  offen: "bg-accent-soft text-accent-deep", // 5,65:1
  bald: "bg-warning-soft text-warning-ink", // 5,13:1
  vorbei: "bg-error-soft text-error-ink", // 5,00:1
  erledigt: "bg-success-soft text-success-ink", // 4,91:1
};

/** Ab weniger als sieben Tagen gilt eine Frist als bald. */
const BALD_MS = 7 * 24 * 3_600_000;

/**
 * Eine Frist in der Kopfzeile eines Abschnitts — rechts neben dem Titel, so
 * gross wie er (QS-044).
 *
 * Konrad, 24.09.: Fristen waren zu klein. An der Präsentation stand sie als
 * graue Hilfezeile unter dem Titel, an Rückwand, Branding und Challenge als
 * eigene Karte weiter unten — beides aus dem Blick, wenn man den Abschnitt
 * überfliegt. Jetzt gehört die Frist zum Kopf des Abschnitts, zu dem sie
 * gehört: rechtsbündig, das Datum in `.ct-h2`, die Fläche nach Stand gefärbt.
 *
 * **Vier Stände, jeder mit Farbe und Wort:** offen (Akzent), bald — unter
 * sieben Tagen — (gelb), vorbei (rot), erledigt (grün). Weiss der Server den
 * Stand schon (`vorbei` aus `late_now`, `erledigt` aus dem Upload), gibt die
 * Seite ihn mit; sonst rechnet der Browser nach dem Laden. Bis dahin steht die
 * Marke im neutralen Ton: ohne JavaScript fehlt nur die Restzeit, nie das Datum.
 *
 * Die grosse, laufende Zahl der Ticketseite (`DeadlineCard prominent`,
 * PART-066) bleibt: dort ist die Frist das Thema der Seite, nicht ein Detail
 * eines Abschnitts.
 *
 * **`kompakt`** (PART-064): dieselben Stände, Farben und Wörter in Zeilenhöhe —
 * für Listen wie die Checkliste, in denen jede Zeile ihre eigene Frist trägt.
 * Ein Datum in `.ct-h2` wäre dort grösser als die Aufgabe selbst.
 */
export function FristMarke({
  dueAt,
  dateText,
  t,
  vorbei,
  erledigt,
  kompakt = false,
  className,
}: {
  dueAt: string;
  /** Datum, serverseitig formatiert — steht immer da, auch ohne JavaScript. */
  dateText: string;
  t: FristTexte;
  /** Vom Server bestimmt; gewinnt über die Uhr im Browser. */
  vorbei?: boolean;
  erledigt?: boolean;
  /** Zeilenhöhe statt Abschnittskopf: Wort und Datum nebeneinander, Datum in `.ct-label`. */
  kompakt?: boolean;
  className?: string;
}) {
  const jetzt = useJetzt();
  const rest = jetzt === null ? null : new Date(dueAt).getTime() - jetzt;

  const stand: Stand = erledigt
    ? "erledigt"
    : vorbei || (rest !== null && rest <= 0)
      ? "vorbei"
      : rest !== null && rest < BALD_MS
        ? "bald"
        : "offen";

  const zusatz =
    stand === "erledigt"
      ? t.done
      : stand === "vorbei"
        ? t.passed
        : rest === null
          ? null
          : rest < 3_600_000
            ? t.soon
            : rest < 48 * 3_600_000
              ? t.hours.replace("{n}", String(Math.floor(rest / 3_600_000)))
              : t.days.replace("{n}", String(Math.floor(rest / (24 * 3_600_000))));

  if (kompakt) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 flex-wrap items-baseline gap-x-1.5 rounded-ct-sm px-2 py-0.5",
          TON[stand],
          className,
        )}
      >
        <span className="ct-eyebrow">
          {t.label}
          {zusatz && <> · {zusatz}</>}
        </span>
        <span className="ct-label tabular-nums">{dateText}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex shrink-0 flex-col items-end rounded-ct-md px-3 py-1.5 text-right",
        TON[stand],
        className,
      )}
    >
      <p className="ct-eyebrow">
        {t.label}
        {zusatz && <> · {zusatz}</>}
      </p>
      <p className="ct-h2 tabular-nums">{dateText}</p>
    </div>
  );
}

/** Die Uhr des Browsers, minütlich — `null`, bis die Seite geladen ist. */
function useJetzt(): number | null {
  const [jetzt, setJetzt] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setJetzt(Date.now());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);
  return jetzt;
}
