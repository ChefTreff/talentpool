import Link from "next/link";
import { CheckMark } from "@/components/ui/CheckMark";
import { Countdown } from "@/components/ui/Countdown";

/** Eine Aufgabe der Checkliste. */
export type Aufgabe = {
  key: string;
  titel: string;
  beschreibung: string;
  /** Wohin man geht, um sie zu erledigen. `null`, solange es die Seite nicht gibt. */
  href: string | null;
  erledigt: boolean;
  /** Frist aus `deadline`, sofern für diese Aufgabe eine gepflegt ist. */
  faellig?: { iso: string; text: string } | null;
};

/**
 * „Deine Checkliste" auf der Startseite (SPK-024).
 *
 * Konrad, 23.09.: „Eine Checkliste ist für mich eine ToDo-Liste mit Aufgabe,
 * Deadline und der Möglichkeit abzuhaken." Vorher standen hier Karten ohne
 * Haken und ohne Frist — das war eine Aufzählung, keine Liste zum Abarbeiten.
 *
 * **Der Haken setzt sich selbst.** Ob eine Aufgabe erledigt ist, weiß das
 * Portal: das Foto liegt im Bucket oder nicht, die Einwilligung steht oder
 * nicht. Ein Häkchen zum Selbstsetzen wäre eine zweite Wahrheit daneben — und
 * die erste, die auseinanderläuft. Wer den Kreis anklickt, landet deshalb
 * dort, wo die Aufgabe erledigt wird, statt einen Haken zu setzen, der nichts
 * bedeutet.
 *
 * **Erledigtes bleibt stehen**, durchgestrichen und nach unten sortiert: eine
 * Liste, aus der Zeilen verschwinden, fühlt sich an, als hätte man sie sich
 * eingebildet.
 */
export function Checkliste({
  aufgaben,
  t,
}: {
  aufgaben: Aufgabe[];
  t: {
    done: string;
    open: string;
    soon: string;
    days: string;
    hours: string;
    dueLabel: string;
    allDone: string;
  };
}) {
  if (aufgaben.length === 0) return <p className="ct-help">{t.allDone}</p>;

  // Offenes zuerst, innerhalb dessen das mit der nächsten Frist.
  const sortiert = [...aufgaben].sort((a, b) => {
    if (a.erledigt !== b.erledigt) return a.erledigt ? 1 : -1;
    if (a.faellig && b.faellig) return a.faellig.iso.localeCompare(b.faellig.iso);
    return a.faellig ? -1 : b.faellig ? 1 : 0;
  });

  return (
    <ul className="flex flex-col rounded-ct-md border bg-surface">
      {sortiert.map((a) => (
        <li
          key={a.key}
          className="flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0"
        >
          <CheckMark done={a.erledigt} label={a.erledigt ? t.done : t.open} />
          <div className="min-w-0 flex-1">
            {a.href ? (
              <Link href={a.href} className="ct-label text-ink hover:underline">
                {a.titel}
              </Link>
            ) : (
              <span className="ct-label text-ink">{a.titel}</span>
            )}
            <p className={`ct-help ${a.erledigt ? "line-through" : ""}`}>{a.beschreibung}</p>
          </div>
          {a.faellig && !a.erledigt && (
            <span className="ct-help shrink-0 tabular-nums">
              {t.dueLabel}: {a.faellig.text} ·{" "}
              <Countdown dueAt={a.faellig.iso} days={t.days} hours={t.hours} soon={t.soon} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
