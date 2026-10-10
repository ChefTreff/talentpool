import Link from "next/link";
import { CheckMark } from "@/components/ui/CheckMark";
import { Countdown } from "@/components/ui/Countdown";
import { HakenSchalter } from "./HakenSchalter";

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
  /**
   * Kennung aus `speaker_task`, wenn der Speaker diesen Punkt **selbst**
   * abhakt (0149). Fehlt sie, ist der Haken abgeleitet und nicht klickbar.
   */
  selbstId?: string;
  /**
   * Schlüssel eines Punkts, den das Portal selbst ableitet und dessen Haken sich von Hand umlegen lässt (SPK-082): das Portal sieht ihn als erledigt, die
   * Speakerin darf ihn wieder öffnen — und danach wieder abhaken. Fehlt er, ist der Haken rein abgeleitet und nicht klickbar (der Punkt ist noch offen:
   * ihn von Hand abzuhaken gäbe „abgehakt, aber kein Foto da“).
   */
  schrittKey?: string;
  /** Von Hand wieder geöffnet — die Zeile sagt es, damit niemand rätselt, warum ein Punkt offen steht, dessen Arbeit schon da ist. */
  wiederGeoeffnet?: boolean;
};

/**
 * „Deine Checkliste" auf der Startseite (SPK-024).
 *
 * Konrad, 23.09.: „Eine Checkliste ist für mich eine ToDo-Liste mit Aufgabe,
 * Deadline und der Möglichkeit abzuhaken." Vorher standen hier Karten ohne
 * Haken und ohne Frist — das war eine Aufzählung, keine Liste zum Abarbeiten.
 *
 * **Zwei Arten von Haken.** Wo das Portal die Erledigung selbst sieht — das
 * Foto liegt im Bucket, die Einwilligung steht —, setzt sich der Haken von
 * selbst; ihn von Hand setzen zu lassen wäre eine zweite Wahrheit daneben,
 * und die erste, die auseinanderläuft. Wer dort auf den Kreis klickt, landet
 * deshalb dort, wo die Aufgabe erledigt wird.
 *
 * Daneben gibt es Aufgaben, die das Portal **nicht** beobachten kann („Beim
 * Hotel gemeldet") — die pflegt das Team unter `/admin/speaker/aufgaben`, und
 * dort hakt der Speaker selbst ab (Konrad, 23.09.: „Es wird auch Punkte geben,
 * die sie selbst abhaken können müssen"). Erkennbar an `selbstId`.
 *
 * **Ein erledigter Punkt darf wieder geöffnet werden** (SPK-082, Konrad 05.10.):
 * wer das Foto ersetzen oder das Profil noch einmal durchgehen will, öffnet den
 * Punkt wieder — und hakt ihn danach wieder ab (`schrittKey`). Der Haken ist
 * nur klickbar, solange das Portal den Punkt als erledigt kennt; ein offener
 * Punkt wird erst durch die Aktion selbst erledigt.
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
    tickError: string;
    reopen: string;
    tickAgain: string;
    reopenedHint: string;
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
          className="flex min-h-14 items-center gap-3 border-b px-4 py-3 last:border-b-0"
        >
          {a.selbstId ? (
            <HakenSchalter
              taskId={a.selbstId}
              done={a.erledigt}
              label={`${a.titel} — ${a.erledigt ? t.done : t.open}`}
              fehler={t.tickError}
            />
          ) : a.schrittKey ? (
            <HakenSchalter
              stepKey={a.schrittKey}
              done={a.erledigt}
              label={`${a.titel} — ${a.erledigt ? t.reopen : t.tickAgain}`}
              fehler={t.tickError}
            />
          ) : (
            <CheckMark done={a.erledigt} label={a.erledigt ? t.done : t.open} />
          )}
          {/* Text und Frist: ab 640 px nebeneinander (die Frist rechts, so breit wie sie ist), darunter **untereinander** (SPK-096). Vorher standen sie in einer
              Zeile mit `flex-wrap`, aber die Textspalte hatte `flex-1` (Basis 0): der Umbruch griff nie, und die Frist („Frist: 14.10.2026 · noch 3 Tage“, 179 px)
              presste Titel und Beschreibung auf 86 px — 213 px hoch bei der Präsentation, 349 bei einem Punkt mit längerem Text, gegen 89 ohne Frist. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              {a.href ? (
                <Link href={a.href} className="ct-label text-ink hover:underline">
                  {a.titel}
                </Link>
              ) : (
                <span className="ct-label text-ink">{a.titel}</span>
              )}
              <p className={`ct-help ${a.erledigt ? "line-through" : ""}`}>{a.beschreibung}</p>
              {a.wiederGeoeffnet && <p className="ct-help">{t.reopenedHint}</p>}
            </div>
            {a.faellig && !a.erledigt && (
              <span className="ct-help tabular-nums sm:shrink-0">
                {t.dueLabel}: {a.faellig.text} ·{" "}
                <Countdown dueAt={a.faellig.iso} days={t.days} hours={t.hours} soon={t.soon} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
