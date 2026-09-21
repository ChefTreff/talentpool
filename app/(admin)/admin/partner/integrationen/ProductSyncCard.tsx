"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";

type Lauf = {
  system: string;
  jobId: number | null;
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  neu?: { sku: string; name: string }[];
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
 * **Erst der Trockenlauf, dann der scharfe Lauf** (Konrad, 21.09.2026: vor jedem
 * Anlegen wird gefragt). Der Trockenlauf liest denselben Weg und nennt die
 * Artikel namentlich, die drüben noch fehlen — steht dort einer, den es drüben
 * längst gibt, stimmt die Artikelnummer nicht überein und der scharfe Lauf legte
 * ihn ein zweites Mal an. Der scharfe Knopf bleibt bis dahin zu.
 *
 * Das Ergebnis steht danach hier und nicht in einem Toast — die Zahlen je System
 * sind das Einzige, woran man erkennt, ob der Lauf getan hat, was er sollte, und
 * ein Toast ist nach fünf Sekunden weg.
 */
export function ProductSyncCard({
  t,
}: {
  t: Record<string, string>;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [laeufe, setLaeufe] = useState<Lauf[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);

  /** Nur der Trockenlauf hat eine Vorschau gesehen — vorher gibt es nichts zu bestätigen. */
  const vorschau = laeufe?.some((l) => l.dryRun) ?? false;
  const wuerdenNeu = (laeufe ?? []).reduce((n, l) => n + (l.dryRun ? l.created : 0), 0);

  async function los(dryRun: boolean) {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await fetch("/api/admin/products/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
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
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => los(true)} loading={laeuft} disabled={laeuft}>
          {laeuft ? t.productSyncRunning : t.productSyncDryRun}
        </Button>
        <Button onClick={() => setFrage(true)} disabled={laeuft || !vorschau}>
          {t.productSyncStart}
        </Button>
      </div>
      {!vorschau && <p className="ct-help mt-2">{t.productSyncDryRunFirst}</p>}

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
                  : (l.dryRun ? t.productSyncPreviewResult : t.productSyncResult)
                      .replace("{created}", String(l.created))
                      .replace("{updated}", String(l.updated))
                      .replace("{failed}", String(l.failed))}
              {l.neu && l.neu.length > 0 && (
                <ul className="ct-help mt-1 flex flex-col gap-0.5">
                  {l.neu.map((n) => (
                    <li key={n.sku}>
                      {n.sku} · {n.name}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {frage && (
        <ConfirmDialog
          title={t.productSyncConfirmTitle}
          body={t.productSyncConfirmBody.replace("{n}", String(wuerdenNeu))}
          /* Die Namen stehen im Dialog, nicht nur die Zahl: „52 Artikel" sagt
             nichts darüber, ob die richtigen dabei sind. */
          detail={
            <ul className="ct-help flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {(laeufe ?? []).flatMap((l) =>
                (l.neu ?? []).map((n) => (
                  <li key={`${l.system}-${n.sku}`}>
                    {l.system} · {n.sku} · {n.name}
                  </li>
                )),
              )}
            </ul>
          }
          confirmLabel={t.productSyncStart}
          cancelLabel={t.productSyncCancel}
          pending={laeuft}
          onConfirm={() => {
            setFrage(false);
            void los(false);
          }}
          onCancel={() => setFrage(false)}
        />
      )}
    </Card>
  );
}
