"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";

type Antwort = {
  ok: boolean; dryRun: boolean; rows: number; eligible: number; create: number; update: number;
  errors: number; refs: number; mitFoto: number; skipped?: string; error?: string;
  zurueckgehalten: { name: string; grund: "kein_name" }[];
  ohneFoto: string[];
  runs: { name: string; outcome: string; detail?: string }[];
};

/**
 * EA2: bestätigte Speaker als Personen mit Speaker-Pass nach Swapcard.
 *
 * Grundlage ist die **Zusage**, nicht eine eigene Einwilligung (Konrad,
 * 22.09.2026) — jedes bestätigte Profil geht hinaus. Wer trotzdem zurückbleibt,
 * steht hier namentlich mit Grund; ein Lauf, der „12 übertragen" meldet, während
 * zwei fehlen, ist die Art Erfolgsmeldung, die niemandem hilft. Dasselbe gilt für
 * das Profilfoto: wer keines hat, bleibt in der App ein Platzhalter, und das
 * sollte man vorher wissen.
 */
export function SpeakerSyncCard({ t }: { t: Record<string, string> }) {
  const [laeuft, setLaeuft] = useState(false);
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);

  const vorschau = antwort?.dryRun ?? false;

  async function ruf(dryRun: boolean) {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await fetch("/api/admin/swapcard/speakers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const json = (await res.json()) as Antwort;
      if (!res.ok || !json.ok) {
        setFehler(json.error ?? t.speakerSyncFailed);
        return;
      }
      setAntwort(json);
    } catch {
      setFehler(t.speakerSyncFailed);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader title={t.speakerSyncTitle} description={t.speakerSyncLead} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void ruf(true)} loading={laeuft} disabled={laeuft}>
          {t.productSyncDryRun}
        </Button>
        <Button onClick={() => setFrage(true)} disabled={laeuft || !vorschau || (antwort?.eligible ?? 0) === 0}>
          {t.speakerSyncRun}
        </Button>
      </div>

      {fehler && (
        <p role="alert" className="mt-3 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}

      {antwort && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="ct-help">
            {t.speakerSyncResult
              .replace("{rows}", String(antwort.rows))
              .replace("{eligible}", String(antwort.eligible))
              .replace("{photos}", String(antwort.mitFoto))
              .replace("{create}", String(antwort.create))
              .replace("{update}", String(antwort.update))
              .replace("{errors}", String(antwort.errors))}
            {antwort.skipped && ` · ${antwort.skipped}`}
          </p>

          {antwort.zurueckgehalten.length > 0 && (
            <div>
              <div className="ct-label text-ink">
                {t.speakerHeldTitle.replace("{n}", String(antwort.zurueckgehalten.length))}
              </div>
              <p className="ct-help">{t.speakerHeldHint}</p>
              <ul className="ct-help mt-1 flex flex-col gap-1">
                {antwort.zurueckgehalten.map((z) => (
                  <li key={z.name} className="flex items-center gap-2">
                    <Badge tone="neutral">
                      {t[`speakerHeld_${z.grund}`] ?? z.grund}
                    </Badge>
                    <span>{z.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {antwort.ohneFoto.length > 0 && (
            <div>
              <div className="ct-label text-ink">
                {t.speakerNoPhotoTitle.replace("{n}", String(antwort.ohneFoto.length))}
              </div>
              <p className="ct-help">{t.speakerNoPhotoHint}</p>
            </div>
          )}

          {antwort.runs.length > 0 && (
            <ul className="ct-help flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {antwort.runs.map((r, i) => (
                <li key={`${r.name}-${i}`}>
                  {r.name} · {t[`outcome_${r.outcome}`] ?? r.outcome}
                  {r.detail && ` · ${r.detail}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {frage && (
        <ConfirmDialog
          title={t.speakerSyncConfirmTitle}
          body={t.speakerSyncConfirmBody
            .replace("{create}", String(antwort?.create ?? 0))
            .replace("{update}", String(antwort?.update ?? 0))
            .replace("{held}", String(antwort?.zurueckgehalten.length ?? 0))}
          confirmLabel={t.speakerSyncRun}
          cancelLabel={t.productSyncCancel}
          pending={laeuft}
          onConfirm={() => {
            setFrage(false);
            void ruf(false);
          }}
          onCancel={() => setFrage(false)}
        />
      )}
    </Card>
  );
}
