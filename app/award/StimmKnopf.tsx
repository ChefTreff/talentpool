"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

type Texte = {
  vote: string; voted: string; closed: string;
  ok: string; duplicate: string; rate_limited: string; error: string;
};

/**
 * Stimme für eine Bewerbung (ADM-024). Eine Stimme je Bewerbung und Quelle —
 * die Route sagt, ob sie gezählt wurde; die Antwort steht neben dem Knopf.
 */
export function StimmKnopf({
  id,
  offen,
  schonGestimmt,
  name,
  t,
}: {
  id: string;
  offen: boolean;
  schonGestimmt: boolean;
  name: string;
  t: Texte;
}) {
  const [gestimmt, setGestimmt] = useState(schonGestimmt);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!offen) return <p className="ct-help">{gestimmt ? t.voted : t.closed}</p>;
  if (gestimmt) return <p className="ct-small text-success-ink" role="status">{meldung ?? t.voted}</p>;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        loading={pending}
        disabled={pending}
        aria-label={`${t.vote}: ${name}`}
        onClick={() =>
          start(async () => {
            try {
              const r = await fetch("/api/award/stimme", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id }),
              });
              const { status } = (await r.json()) as { status?: string };
              if (status === "ok" || status === "duplicate") {
                setGestimmt(true);
                setMeldung(status === "ok" ? t.ok : t.duplicate);
              } else {
                setMeldung(status === "rate_limited" ? t.rate_limited : status === "closed" ? t.closed : t.error);
              }
            } catch {
              setMeldung(t.error);
            }
          })
        }
      >
        {t.vote}
      </Button>
      {meldung && <p className="ct-small" role="status">{meldung}</p>}
    </div>
  );
}
