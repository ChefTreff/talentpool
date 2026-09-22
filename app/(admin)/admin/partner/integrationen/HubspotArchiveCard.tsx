"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";

type Kandidat = { id: string; name: string; sku: string | null; price: string | null; createdAt: string | null };
type Antwort = { ok: boolean; dryRun: boolean; total: number; candidates: Kandidat[]; archived: number; skipped: number; error?: string };

/**
 * Altbestand in HubSpot archivieren — die Produkte **ohne Artikelnummer**.
 *
 * Der Abgleich findet ein Produkt drüben nur über `hs_sku`. Was dort keine hat,
 * findet er nicht und legt unseren Artikel daneben neu an; HubSpot hielte danach
 * den alten FLS26-Katalog und den neuen nebeneinander. Konrad, 21.09.2026: „die
 * Artikel ohne Nummer archivieren wir."
 *
 * **Archiviert, nicht gelöscht:** HubSpot legt sie in den Papierkorb, 90 Tage
 * lang zurückholbar; bestehende Angebote behalten ihre Positionen. Nichts
 * passiert ohne Durchsicht — erst listen, dann einzeln abwählen, dann bestätigen.
 */
export function HubspotArchiveCard({ t }: { t: Record<string, string> }) {
  const [laeuft, setLaeuft] = useState(false);
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [frage, setFrage] = useState(false);

  const kandidaten = antwort?.candidates ?? [];
  const gewaehlt = [...auswahl];

  async function ruf(dryRun: boolean) {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await fetch("/api/admin/hubspot/archive-products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun, ids: dryRun ? undefined : gewaehlt }),
      });
      const json = (await res.json()) as Antwort;
      if (!res.ok || !json.ok) {
        setFehler(json.error ?? t.archiveFailed);
        return;
      }
      setAntwort(json);
      // Nach dem Listen ist alles vorgewählt — abwählen, was bleiben soll.
      if (dryRun) setAuswahl(new Set(json.candidates.map((k) => k.id)));
      else setAuswahl(new Set());
    } catch {
      setFehler(t.archiveFailed);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader title={t.archiveTitle} description={t.archiveLead} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void ruf(true)} loading={laeuft} disabled={laeuft}>
          {t.archiveList}
        </Button>
        <Button onClick={() => setFrage(true)} disabled={laeuft || gewaehlt.length === 0}>
          {t.archiveStart.replace("{n}", String(gewaehlt.length))}
        </Button>
      </div>

      {fehler && (
        <p role="alert" className="mt-3 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}

      {antwort && (
        <div className="mt-3">
          <p className="ct-help">
            {t.archiveFound.replace("{n}", String(kandidaten.length)).replace("{total}", String(antwort.total))}
            {antwort.archived > 0 && ` · ${t.archiveDone.replace("{n}", String(antwort.archived))}`}
          </p>
          {kandidaten.length > 0 && (
            <ul className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {kandidaten.map((k) => (
                <li key={k.id}>
                  <label className="ct-help flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={auswahl.has(k.id)}
                      disabled={laeuft}
                      onChange={() =>
                        setAuswahl((a) => {
                          const n = new Set(a);
                          if (n.has(k.id)) n.delete(k.id);
                          else n.add(k.id);
                          return n;
                        })
                      }
                    />
                    <span>
                      {k.name || t.archiveNoName}
                      {k.price ? ` · ${k.price}` : ""}
                      {k.createdAt ? ` · ${k.createdAt.slice(0, 10)}` : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {frage && (
        <ConfirmDialog
          title={t.archiveConfirmTitle}
          body={t.archiveConfirmBody.replace("{n}", String(gewaehlt.length))}
          detail={
            <ul className="ct-help flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {kandidaten
                .filter((k) => auswahl.has(k.id))
                .map((k) => (
                  <li key={k.id}>{k.name || t.archiveNoName}</li>
                ))}
            </ul>
          }
          confirmLabel={t.archiveStart.replace("{n}", String(gewaehlt.length))}
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
