"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

type Lauf = {
  system: string;
  jobId: number | null;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  skippedReason?: string;
  error?: string;
};

/**
 * Den Produktstamm nach HubSpot und SevDesk schreiben (A4.3).
 *
 * Bewusst ein Knopf und kein Nachtlauf: ein Abgleich, der ungefragt Preise in
 * zwei Fremdsysteme schreibt, ist genau dann gefährlich, wenn niemand hinsieht.
 * Wer drückt, steht im Protokoll.
 *
 * Das Ergebnis steht danach hier und nicht in einem Toast — vier Zahlen je
 * System sind das Einzige, woran man erkennt, ob der Lauf getan hat, was er
 * sollte, und ein Toast ist nach fünf Sekunden weg.
 */
export function ProductSyncCard({
  t,
}: {
  t: Record<string, string>;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [laeufe, setLaeufe] = useState<Lauf[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function los() {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await fetch("/api/admin/products/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setFehler(t.productSyncFailed);
        return;
      }
      const json = (await res.json()) as { runs?: Lauf[] };
      setLaeufe(json.runs ?? []);
    } catch {
      setFehler(t.productSyncFailed);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader title={t.productSyncTitle} description={t.productSyncLead} />
      <div className="mt-3">
        <Button onClick={los} loading={laeuft} disabled={laeuft}>
          {laeuft ? t.productSyncRunning : t.productSyncStart}
        </Button>
      </div>

      {fehler && (
        <p role="alert" className="mt-3 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}

      {laeufe && (
        <ul className="mt-4 flex flex-col gap-2">
          {laeufe.map((l) => (
            <li key={l.system} className="ct-small">
              <span className="ct-label">{l.system}</span>{" "}
              {l.error
                ? l.error
                : l.skippedReason
                  ? t.productSyncSkipped
                      .replace("{n}", String(l.skipped))
                      .replace("{reason}", l.skippedReason)
                  : t.productSyncResult
                      .replace("{created}", String(l.created))
                      .replace("{updated}", String(l.updated))
                      .replace("{failed}", String(l.failed))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
