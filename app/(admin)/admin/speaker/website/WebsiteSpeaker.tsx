"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import type { SpeakerLauf } from "@/lib/sanity/speakers";

type Strings = Record<string, string>;
type Antwort = Partial<SpeakerLauf> & { ok: boolean; error?: string };

/** So viele Namen je Liste; der Rest als Zahl. */
const MAX_NAMEN = 50;

function fuellen(text: string, werte: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(werte[k] ?? ""));
}

/**
 * SPK-046: Speaker auf die Website. Erst die **Vorschau** (Sanity prüft mit `dryRun`, nichts wird
 * geschrieben), dann **Übertragen** — mit Rückfrage und nur, wenn der Schalter offen ist. Wer nicht auf die
 * Website geht, steht mit Grund da; eine Meldung „12 übertragen“, während zwei fehlen, hilft niemandem
 * (wie `SpeakerSyncCard`).
 */
export function WebsiteSpeaker({ konfiguriert, schreibenErlaubt, t }: { konfiguriert: boolean; schreibenErlaubt: boolean; t: Strings }) {
  const [laeuft, setLaeuft] = useState<"vorschau" | "lauf" | null>(null);
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);

  const vorschau = antwort?.dryRun === true ? antwort : null;
  const zuTun = vorschau ? (vorschau.anlegen?.length ?? 0) + (vorschau.aendern?.length ?? 0) + (vorschau.entfernen?.length ?? 0) : 0;

  async function ruf(dryRun: boolean) {
    setLaeuft(dryRun ? "vorschau" : "lauf");
    setFehler(null);
    try {
      const res = await fetch("/api/admin/sanity/speakers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as Antwort;
      if (!res.ok || !json.ok) {
        setFehler(t[`err_${json.error ?? ""}`] ?? t.failed);
        return;
      }
      setAntwort(json);
    } catch {
      setFehler(t.failed);
    } finally {
      setLaeuft(null);
    }
  }

  const namen = <T,>(liste: T[] | undefined, zeile: (x: T) => ReactNode, schluessel: (x: T) => string) => {
    const alle = liste ?? [];
    return (
      <ul className="mt-1 flex flex-col gap-1">
        {alle.slice(0, MAX_NAMEN).map((x) => (
          <li key={schluessel(x)} className="flex flex-wrap items-center gap-2 ct-small text-ink">
            {zeile(x)}
          </li>
        ))}
        {alle.length > MAX_NAMEN && <li className="ct-help">{fuellen(t.more, { n: alle.length - MAX_NAMEN })}</li>}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t.gateTitle} />
        <ul className="flex list-disc flex-col gap-1 pl-5 ct-small text-ink">
          <li>{t.gate1}</li>
          <li>{t.gate2}</li>
          <li>{t.gate3}</li>
        </ul>
        <p className="ct-help mt-3">{t.gateAll}</p>
        <p className="ct-label mt-4 text-ink">{t.neverTitle}</p>
        <p className="ct-help mt-1">{t.never}</p>
      </Card>

      <Card>
        <CardHeader
          title={t.runTitle}
          description={t.runLead}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <Badge tone={konfiguriert ? "success" : "warning"} className="whitespace-nowrap">
                {konfiguriert ? t.sanityReady : t.sanityMissing}
              </Badge>
              <Badge tone={schreibenErlaubt ? "success" : "neutral"} className="whitespace-nowrap">
                {schreibenErlaubt ? t.writeOpen : t.writeLocked}
              </Badge>
            </div>
          }
        />
        {!schreibenErlaubt && <p className="ct-small mb-4 text-ink">{t.writeLockedBody}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void ruf(true)} loading={laeuft === "vorschau"} disabled={laeuft !== null || !konfiguriert}>
            {laeuft === "vorschau" ? t.previewing : t.preview}
          </Button>
          <Button onClick={() => setFrage(true)} loading={laeuft === "lauf"} disabled={laeuft !== null || !schreibenErlaubt || !vorschau || zuTun === 0}>
            {laeuft === "lauf" ? t.running : t.run}
          </Button>
        </div>

        {fehler && (
          <p role="alert" className="mt-3 ct-small text-error-ink">
            {fehler}
          </p>
        )}

        {antwort && (
          <div aria-live="polite" className="mt-4 flex flex-col gap-4">
            <p className="ct-small text-ink">
              {antwort.dryRun
                ? fuellen(t.resultPreview, {
                    personen: antwort.personen ?? 0,
                    anlegen: antwort.anlegen?.length ?? 0,
                    aendern: antwort.aendern?.length ?? 0,
                    unveraendert: antwort.unveraendert ?? 0,
                    entfernen: antwort.entfernen?.length ?? 0,
                    zurueck: antwort.zurueckgehalten?.length ?? 0,
                    geprueft: antwort.geprueft ?? 0,
                  })
                : fuellen(t.resultRun, { geschrieben: antwort.geschrieben ?? 0, entfernt: antwort.entfernt ?? 0, fehler: antwort.fehler?.length ?? 0 })}
            </p>
            {antwort.skipped && <p className="ct-help">{t[`err_${antwort.skipped}`] ?? antwort.skipped}</p>}
            {antwort.pruefung === "token_read_only" && <p className="ct-help text-warning-ink">{t.tokenReadOnly}</p>}
            {antwort.dryRun && zuTun === 0 && (antwort.unveraendert ?? 0) === 0 && <p className="ct-help">{t.nothing}</p>}

            {(antwort.anlegen?.length ?? 0) > 0 && (
              <section>
                <h3 className="ct-label text-ink">{fuellen(t.listCreate, { n: antwort.anlegen!.length })}</h3>
                {namen(antwort.anlegen, (x) => (
                  <>
                    <span>{x.name}</span>
                    {x.fotoNeu && <Badge tone="neutral">{t.photoNew}</Badge>}
                  </>
                ), (x) => x.docId)}
              </section>
            )}
            {(antwort.aendern?.length ?? 0) > 0 && (
              <section>
                <h3 className="ct-label text-ink">{fuellen(t.listUpdate, { n: antwort.aendern!.length })}</h3>
                {namen(antwort.aendern, (x) => (
                  <>
                    <span>{x.name}</span>
                    <span className="ct-help">{x.geaendert.map((f) => t[`feld_${f}`] ?? f).join(", ")}</span>
                  </>
                ), (x) => x.docId)}
              </section>
            )}
            {(antwort.entfernen?.length ?? 0) > 0 && (
              <section>
                <h3 className="ct-label text-ink">{fuellen(t.listRemove, { n: antwort.entfernen!.length })}</h3>
                {namen(antwort.entfernen, (x) => (
                  <>
                    <span>{x.name ?? t.deletedPerson}</span>
                    {x.gruende.map((g) => (
                      <Badge key={g} tone="warning">
                        {t[`grund_${g}`] ?? g}
                      </Badge>
                    ))}
                  </>
                ), (x) => x.docId)}
              </section>
            )}
            {(antwort.zurueckgehalten?.length ?? 0) > 0 && (
              <section>
                <h3 className="ct-label text-ink">{fuellen(t.listHeld, { n: antwort.zurueckgehalten!.length })}</h3>
                <p className="ct-help">{t.heldHint}</p>
                {namen(antwort.zurueckgehalten, (x) => (
                  <>
                    <span>{x.name}</span>
                    {x.gruende.map((g) => (
                      <Badge key={g} tone="neutral">
                        {t[`grund_${g}`] ?? g}
                      </Badge>
                    ))}
                  </>
                ), (x) => `${x.name}:${x.gruende.join(",")}`)}
              </section>
            )}
            {(antwort.fehler?.length ?? 0) > 0 && (
              <section>
                <h3 className="ct-label text-error-ink">{fuellen(t.listErrors, { n: antwort.fehler!.length })}</h3>
                {namen(antwort.fehler, (x) => (
                  <>
                    <span>{x.name}</span>
                    <span className="ct-help">{x.detail}</span>
                  </>
                ), (x) => `${x.name}:${x.detail}`)}
              </section>
            )}
          </div>
        )}
      </Card>

      {frage && (
        <ConfirmDialog
          title={t.confirmTitle}
          body={fuellen(t.confirmBody, {
            anlegen: vorschau?.anlegen?.length ?? 0,
            aendern: vorschau?.aendern?.length ?? 0,
            entfernen: vorschau?.entfernen?.length ?? 0,
          })}
          confirmLabel={t.confirmYes}
          cancelLabel={t.cancel}
          pending={laeuft !== null}
          onConfirm={() => {
            setFrage(false);
            void ruf(false);
          }}
          onCancel={() => setFrage(false)}
        />
      )}
    </div>
  );
}
