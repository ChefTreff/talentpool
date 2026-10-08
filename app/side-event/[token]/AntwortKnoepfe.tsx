"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { LINK_ZUSTAENDE, type LinkStatus, type LinkZustand } from "@/lib/side-event/link";

type Texte = {
  yes: string;
  no: string;
  statusInvited: string;
  statusYes: string;
  statusNo: string;
  doneYes: string;
  doneNo: string;
  changeHint: string;
  closed: string;
  full: string;
  invalid: string;
  rateLimited: string;
  error: string;
};

/**
 * Zu- oder Absage per Link (ADM-077). Die Seite zeigt nur an; **erst der Klick** schickt einen POST an `/api/side-event/antwort` — so
 * ändert ein Mail-Scanner, der den Link vorab abruft, nichts.
 *
 * Die Antwort der Route ist ein Zustand: `ok` mit dem neuen Stand, `closed` (Frist vorbei), `full` (kein Platz mehr), `invalid` (der Link
 * gilt nicht mehr — abgelaufen oder durch eine neue Mail ersetzt), `rate_limited`. Eine Begleitung stellt man im Speaker-Portal ein; hier
 * geht es um das Ja oder Nein in einem Klick.
 */
export function AntwortKnoepfe({ token, status: start, t }: { token: string; status: LinkStatus; t: Texte }) {
  const [status, setStatus] = useState<LinkStatus>(start);
  const [gerade, setGerade] = useState<"yes" | "no" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [gesperrt, setGesperrt] = useState(false);
  const [pending, run] = useTransition();

  function antworten(neu: "yes" | "no") {
    setProblem(null);
    run(async () => {
      try {
        const r = await fetch("/api/side-event/antwort", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, status: neu }),
        });
        const roh = (await r.json()) as { state?: unknown };
        // Ein Zustand, den wir nicht kennen (etwa `error` bei einem Serverfehler), ist ein Fehler — nicht „der Link gilt nicht mehr“.
        const zustand: LinkZustand | "error" = (LINK_ZUSTAENDE as readonly string[]).includes(String(roh.state)) ? (roh.state as LinkZustand) : "error";
        if (zustand === "ok") {
          setStatus(neu);
          setGerade(neu);
        } else if (zustand === "closed") {
          setGesperrt(true);
          setProblem(t.closed);
        } else if (zustand === "full") {
          setProblem(t.full);
        } else if (zustand === "rate_limited") {
          setProblem(t.rateLimited);
        } else if (zustand === "invalid") {
          setGesperrt(true);
          setProblem(t.invalid);
        } else {
          setProblem(t.error);
        }
      } catch {
        setProblem(t.error);
      }
    });
  }

  // Direkt nach dem Klick steht der Dank, danach der schlichte Stand.
  const stand = gerade === "yes" ? t.doneYes : gerade === "no" ? t.doneNo : status === "yes" ? t.statusYes : status === "no" ? t.statusNo : t.statusInvited;

  return (
    <div className="flex flex-col gap-4">
      <p className="ct-label text-ink" role="status">
        {stand}
      </p>
      {!gesperrt && (
        <div className="flex flex-wrap gap-2">
          {status !== "yes" && (
            <Button onClick={() => antworten("yes")} loading={pending} disabled={pending}>
              {t.yes}
            </Button>
          )}
          {status !== "no" && (
            <Button variant="secondary" onClick={() => antworten("no")} disabled={pending}>
              {t.no}
            </Button>
          )}
        </div>
      )}
      {problem && (
        <p className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink" role="alert">
          {problem}
        </p>
      )}
      {!gesperrt && <p className="ct-help">{t.changeHint}</p>}
    </div>
  );
}
