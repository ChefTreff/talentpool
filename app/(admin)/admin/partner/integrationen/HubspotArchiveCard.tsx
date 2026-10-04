"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";

type Kandidat = { id: string; name: string; sku: string | null; price: string | null; createdAt: string | null };
type Antwort = { ok: boolean; dryRun: boolean; total: number; candidates: Kandidat[]; matches?: Kandidat[]; archived: number; skipped: number; error?: string };

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
 *
 * **Einzelnes Produkt mit Nummer (K-47):** das Feld „Artikelnummer“ sucht lesend in
 * der Liste, die der Server ohnehin liest. Treffer stehen darunter und sind
 * **nicht vorgewählt**; archiviert wird nur, was jemand ankreuzt und bestätigt.
 * Im scharfen Lauf schickt die Karte die Anfrage des letzten Suchlaufs mit — der
 * Server findet den Treffer damit noch einmal, eine Id allein genügt ihm nicht.
 */
export function HubspotArchiveCard({ t }: { t: Record<string, string> }) {
  const [laeuft, setLaeuft] = useState(false);
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [frage, setFrage] = useState(false);
  const [suche, setSuche] = useState("");
  const [anfrage, setAnfrage] = useState("");

  const kandidaten = antwort?.candidates ?? [];
  const imAltbestand = new Set(kandidaten.map((k) => k.id));
  const treffer = (antwort?.matches ?? []).filter((k) => !imAltbestand.has(k.id));
  const alle = [...kandidaten, ...treffer];
  const gewaehlt = [...auswahl];

  async function ruf(dryRun: boolean, nummer = "") {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await fetch("/api/admin/hubspot/archive-products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun, ids: dryRun ? undefined : gewaehlt, sku: (dryRun ? nummer : anfrage) || undefined }),
      });
      const json = (await res.json()) as Antwort;
      if (!res.ok || !json.ok) {
        setFehler(json.error ?? t.archiveFailed);
        return;
      }
      setAntwort(json);
      // Nach dem Listen ist der Altbestand vorgewählt — abwählen, was bleiben soll.
      // Nach einer Nummernsuche ist **nichts** vorgewählt (auch der Altbestand nicht):
      // wer einen Treffer will, kreuzt ihn an.
      if (dryRun) {
        setAnfrage(nummer);
        setAuswahl(new Set(nummer ? [] : json.candidates.map((k) => k.id)));
      } else {
        setAuswahl(new Set());
      }
    } catch {
      setFehler(t.archiveFailed);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader ebene="h2" title={t.archiveTitle} description={t.archiveLead} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void ruf(true)} loading={laeuft} disabled={laeuft}>
          {t.archiveList}
        </Button>
        <Button onClick={() => setFrage(true)} disabled={laeuft || gewaehlt.length === 0}>
          {t.archiveStart.replace("{n}", String(gewaehlt.length))}
        </Button>
      </div>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ruf(true, suche.trim());
        }}
      >
        <Field label={t.archiveSkuLabel} htmlFor="archive-sku" hint={t.archiveSkuHint}>
          <Input id="archive-sku" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="I-10729" autoComplete="off" spellCheck={false} />
        </Field>
        <Button type="submit" variant="secondary" disabled={laeuft || suche.trim().length < 3}>
          {t.archiveSkuSearch}
        </Button>
      </form>

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
          {anfrage && (
            <p className="ct-help mt-1" role="status">
              {(antwort.matches ?? []).length > 0
                ? t.archiveSkuFound.replace("{n}", String((antwort.matches ?? []).length)).replace("{q}", anfrage)
                : t.archiveSkuNone.replace("{q}", anfrage)}
            </p>
          )}
          {alle.length > 0 && (
            <ul className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {alle.map((k) => (
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
                      {k.sku ? ` · ${k.sku}` : ""}
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
              {alle
                .filter((k) => auswahl.has(k.id))
                .map((k) => (
                  <li key={k.id}>
                    {k.name || t.archiveNoName}
                    {k.sku ? ` · ${k.sku}` : ""}
                  </li>
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
