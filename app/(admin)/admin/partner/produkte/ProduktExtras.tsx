"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FileButton } from "@/components/ui/FileButton";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { postJson, readJson } from "@/lib/fetch-json";

type Bild = { path: string; url: string; name: string };
type Lauf = { system: string; created: number; updated: number; skipped: number; failed: number; artikel?: { sku: string; aktion: "create" | "update" }[]; skippedReason?: string; error?: string };
export type Abgleich = { hubspot?: string; sevdesk?: string };

/**
 * Bild und Abgleich eines gespeicherten Artikels (PROD-006).
 *
 * **Bild:** über `/api/admin/products/bild` — die Route rechnet das Bild neu
 * (WebP, ohne Metadaten) und trägt es über `upsert_product` ein.
 *
 * **Abgleich** nach HubSpot und SevDesk: der vorhandene Weg
 * (`/api/admin/products/sync`, Runbook produktabgleich.md), hier nur für
 * **diesen** Artikel. Erst der Trockenlauf sagt je System, ob angelegt oder
 * geändert würde; der scharfe Lauf bleibt bis dahin zu und fragt noch einmal
 * (Konrad 21.09.: vor jedem Anlegen in SevDesk wird gesprochen). Nur für das
 * Partner-Team — die Route prüft den Abschnitt `partner`.
 */
export function ProduktExtras({
  sku,
  bilder,
  abgleich,
  syncErlaubt,
  t,
  common,
}: {
  sku: string;
  bilder: Bild[];
  abgleich: Abgleich | null;
  syncErlaubt: boolean;
  t: Record<string, string>;
  common: { cancel: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [liste, setListe] = useState<Bild[]>(bilder);
  const [laedt, setLaedt] = useState(false);
  const [vorschau, setVorschau] = useState<Lauf[] | null>(null);
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const fehler = (key: string) =>
    toast("error", key === "too_large" ? t.imageTooLarge : key === "wrong_type" ? t.imageWrongType : t.imageFailed);

  async function hochladen(datei: File) {
    setLaedt(true);
    try {
      const form = new FormData();
      form.set("sku", sku);
      form.set("file", datei);
      const res = await fetch("/api/admin/products/bild", { method: "POST", body: form }).catch(() => null);
      const json = res ? await readJson<{ images?: Bild[]; error?: string }>(res) : null;
      if (!res?.ok || !json?.images) return fehler(json?.error ?? (res?.status === 413 ? "too_large" : "unknown"));
      setListe(json.images);
      toast("success", t.imageSaved);
      router.refresh();
    } finally {
      setLaedt(false);
    }
  }

  async function entfernen(pfad: string) {
    setLaedt(true);
    try {
      const res = await fetch(`/api/admin/products/bild?sku=${encodeURIComponent(sku)}&path=${encodeURIComponent(pfad)}`, { method: "DELETE" }).catch(() => null);
      const json = res ? await readJson<{ images?: Bild[] }>(res) : null;
      if (!res?.ok || !json?.images) return fehler("unknown");
      setListe(json.images);
      router.refresh();
    } finally {
      setLaedt(false);
    }
  }

  async function abgleichen(trocken: boolean) {
    setLaeuft(true);
    try {
      const r = await postJson<{ runs: Lauf[] }>("/api/admin/products/sync", { dryRun: trocken, skus: [sku] });
      if (!r.ok) { toast("error", t.syncFailed); return; }
      setVorschau(r.data.runs);
      if (!trocken) {
        toast("success", t.syncDone);
        router.refresh();
      }
    } finally {
      setLaeuft(false);
      setFrage(false);
    }
  }

  const aktion = (l: Lauf) =>
    l.error ? `${t.syncError}: ${l.error}`
    : l.skippedReason ? l.skippedReason
    : l.artikel?.[0]?.aktion === "create" ? t.syncWouldCreate
    : l.artikel?.[0]?.aktion === "update" ? t.syncWouldUpdate
    : t.syncNothing;

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <section>
        <h3 className="ct-h3 text-ink">{t.imagesTitle}</h3>
        <p className="ct-help mt-1">{t.imagesLead}</p>
        {liste.length === 0 ? (
          <p className="ct-small mt-3 text-muted">{t.imagesNone}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-3">
            {liste.map((b) => (
              <li key={b.path} className="flex flex-col items-start gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- öffentlicher Bucket, kleine Vorschau */}
                <img src={b.url} alt={b.name} className="h-24 w-24 rounded-ct-md border object-cover" />
                <Button size="sm" variant="ghost" disabled={laedt} onClick={() => void entfernen(b.path)}>
                  {t.imageRemove}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <FileButton label={t.imageUpload} accept="image/png,image/jpeg,image/webp" disabled={laedt} onFile={(f) => void hochladen(f)} />
        </div>
      </section>

      {syncErlaubt && (
        <section>
          <h3 className="ct-h3 text-ink">{t.syncTitle}</h3>
          <p className="ct-help mt-1">{t.syncLead}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={abgleich?.hubspot ? "success" : "neutral"}>{abgleich?.hubspot ? t.syncHubspotLinked : t.syncHubspotOpen}</Badge>
            <Badge tone={abgleich?.sevdesk ? "success" : "neutral"}>{abgleich?.sevdesk ? t.syncSevdeskLinked : t.syncSevdeskOpen}</Badge>
          </div>
          {vorschau && (
            <ul className="ct-small mt-3 flex flex-col gap-1" role="status">
              {vorschau.map((l) => (
                <li key={l.system}>
                  <span className="ct-label">{l.system === "hubspot" ? "HubSpot" : "SevDesk"}:</span> {aktion(l)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={laeuft} disabled={laeuft} onClick={() => void abgleichen(true)}>
              {t.syncPreview}
            </Button>
            <Button size="sm" disabled={laeuft || !vorschau} onClick={() => setFrage(true)}>
              {t.syncRun}
            </Button>
          </div>
          {frage && (
            <ConfirmDialog
              title={t.syncConfirmTitle}
              body={t.syncConfirmBody.replace("{sku}", sku)}
              detail={vorschau ? (
                <ul className="ct-small">
                  {vorschau.map((l) => <li key={l.system}>{l.system === "hubspot" ? "HubSpot" : "SevDesk"}: {aktion(l)}</li>)}
                </ul>
              ) : undefined}
              confirmLabel={t.syncRun}
              cancelLabel={common.cancel}
              pending={laeuft}
              onCancel={() => setFrage(false)}
              onConfirm={() => void abgleichen(false)}
            />
          )}
        </section>
      )}
    </div>
  );
}
