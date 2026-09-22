"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";

type Fremd = { id: string; name: string; logoUrl: string | null; categoryName: string | null };
type Antwort = {
  ok: boolean; dryRun: boolean; rows: number; create: number; update: number; unchanged: number;
  errors: number; entfernt?: number; skipped?: string; error?: string;
  ohneLogo: { org: string; orgEditionId: string }[];
  fremd: Fremd[];
  runs: { org: string; outcome: string; detail?: string }[];
};

/**
 * Die Logo-Wand in Swapcard („Sponsoring & Werbung") aus dem Portal füllen.
 *
 * Die Kategorie ergibt sich aus dem gebuchten Paket (0139); wer keine Stufe
 * trägt — nur Masterclass, Company Tour oder Speaking —, wird Official Partner,
 * damit niemand fehlt. Das Logo ist dieselbe freigegebene Datei, die auch am
 * Ausstellereintrag hängt.
 *
 * **Zwei Listen, weil beide zusammengehören:** Der 27er-Event ist ein Duplikat
 * von 2026 und trägt dessen Wand noch. Wer unsere Logos anlegt, ohne die alten
 * wegzunehmen, verdoppelt die Wand. Entfernen ist bei Swapcard **endgültig** —
 * einen Papierkorb wie in HubSpot gibt es hier nicht, deshalb die Vorschau mit
 * Bildern: eine Liste namenloser Kennungen kann niemand ernsthaft prüfen.
 */
export function SponsorWallCard({ t }: { t: Record<string, string> }) {
  const [laeuft, setLaeuft] = useState(false);
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [wegAuswahl, setWegAuswahl] = useState<Set<string>>(new Set());
  const [frage, setFrage] = useState<"lauf" | "weg" | null>(null);

  const vorschau = antwort?.dryRun ?? false;
  const fremd = antwort?.fremd ?? [];
  const weg = [...wegAuswahl];

  async function ruf(dryRun: boolean, entfernen?: string[]) {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await fetch("/api/admin/swapcard/sponsors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun, entfernen }),
      });
      const json = (await res.json()) as Antwort;
      if (!res.ok || !json.ok) {
        setFehler(json.error ?? t.sponsorFailed);
        return;
      }
      setAntwort(json);
      if (dryRun) setWegAuswahl(new Set(json.fremd.map((f) => f.id)));
      else setWegAuswahl(new Set());
    } catch {
      setFehler(t.sponsorFailed);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader title={t.sponsorTitle} description={t.sponsorLead} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void ruf(true)} loading={laeuft} disabled={laeuft}>
          {t.productSyncDryRun}
        </Button>
        <Button onClick={() => setFrage("lauf")} disabled={laeuft || !vorschau}>
          {t.sponsorRun}
        </Button>
        <Button variant="secondary" onClick={() => setFrage("weg")} disabled={laeuft || !vorschau || weg.length === 0}>
          {t.sponsorRemove.replace("{n}", String(weg.length))}
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
            {t.sponsorResult
              .replace("{create}", String(antwort.create))
              .replace("{update}", String(antwort.update))
              .replace("{unchanged}", String(antwort.unchanged))
              .replace("{errors}", String(antwort.errors))}
            {antwort.skipped && ` · ${antwort.skipped}`}
            {antwort.entfernt ? ` · ${t.sponsorRemoved.replace("{n}", String(antwort.entfernt))}` : ""}
          </p>

          {antwort.ohneLogo.length > 0 && (
            <div>
              <div className="ct-label text-ink">{t.sponsorNoLogoTitle}</div>
              <p className="ct-help">{t.sponsorNoLogoHint}</p>
              <ul className="ct-help mt-1 flex flex-col gap-0.5">
                {antwort.ohneLogo.map((o) => (
                  <li key={o.orgEditionId}>{o.org}</li>
                ))}
              </ul>
            </div>
          )}

          {fremd.length > 0 && (
            <div>
              <div className="ct-label text-ink">
                {t.sponsorOldTitle.replace("{n}", String(fremd.length))}
              </div>
              <p className="ct-help">{t.sponsorOldHint}</p>
              <ul className="mt-2 flex max-h-96 flex-col gap-1 overflow-y-auto">
                {fremd.map((f) => (
                  <li key={f.id}>
                    <label className="ct-help flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={wegAuswahl.has(f.id)}
                        disabled={laeuft}
                        onChange={() =>
                          setWegAuswahl((a) => {
                            const n = new Set(a);
                            if (n.has(f.id)) n.delete(f.id);
                            else n.add(f.id);
                            return n;
                          })
                        }
                      />
                      {f.logoUrl && (
                        <Image
                          src={f.logoUrl}
                          alt=""
                          width={72}
                          height={32}
                          unoptimized
                          className="h-8 w-auto rounded-ct-sm border bg-surface object-contain"
                        />
                      )}
                      <span>
                        {f.name || t.sponsorNoName}
                        {f.categoryName ? ` · ${f.categoryName}` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {frage === "lauf" && (
        <ConfirmDialog
          title={t.sponsorConfirmTitle}
          body={t.sponsorConfirmBody
            .replace("{create}", String(antwort?.create ?? 0))
            .replace("{update}", String(antwort?.update ?? 0))}
          confirmLabel={t.sponsorRun}
          cancelLabel={t.productSyncCancel}
          pending={laeuft}
          onConfirm={() => {
            setFrage(null);
            void ruf(false);
          }}
          onCancel={() => setFrage(null)}
        />
      )}

      {frage === "weg" && (
        <ConfirmDialog
          title={t.sponsorRemoveConfirmTitle}
          body={t.sponsorRemoveConfirmBody.replace("{n}", String(weg.length))}
          detail={
            <ul className="ct-help flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {fremd
                .filter((f) => wegAuswahl.has(f.id))
                .map((f) => (
                  <li key={f.id}>
                    {f.name || t.sponsorNoName}
                    {f.categoryName ? ` · ${f.categoryName}` : ""}
                  </li>
                ))}
            </ul>
          }
          confirmLabel={t.sponsorRemove.replace("{n}", String(weg.length))}
          cancelLabel={t.productSyncCancel}
          pending={laeuft}
          onConfirm={() => {
            setFrage(null);
            void ruf(false, weg);
          }}
          onCancel={() => setFrage(null)}
        />
      )}
    </Card>
  );
}
