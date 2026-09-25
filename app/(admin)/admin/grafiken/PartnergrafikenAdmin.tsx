"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileButton } from "@/components/ui/FileButton";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { useToast } from "@/components/ui/Toast";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { postJson } from "@/lib/fetch-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { GRAFIK_ERLAUBT, GRAFIK_MAX_BYTES } from "@/components/partner/media-kit";

/** Eine Zeile aus `partner_graphics_admin`, um eine signierte Vorschau ergänzt. */
export type PartnergrafikZeile = {
  org_id: string;
  org_name: string | null;
  asset_id: string | null;
  filename: string | null;
  mime: string | null;
  version: number | null;
  created_at: string | null;
  /** Kurzlebig, vom Server erzeugt — steht nie in der Datenbank. */
  url: string | null;
};

type Strings = Record<string, string>;

/**
 * Persönliche Partnergrafiken („Wir sind dabei“) je Partner der Edition
 * (PART-041, ADM-023). Das Marketing lädt je Organisation eine Grafik hoch oder
 * ersetzt sie; der Partner lädt sie unter „Media Kit“ herunter. Jede neue Datei
 * ist eine neue Version (`set_partner_graphic`), die alte bleibt im Verlauf.
 *
 * Die Suche filtert im Browser — die Liste enthält jeden Partner der Edition
 * einmal, das sind wenige hundert Zeilen.
 */
export function PartnergrafikenAdmin({
  editionId,
  zeilen,
  dateLocale,
  t,
  common,
}: {
  editionId: string;
  zeilen: PartnergrafikZeile[];
  dateLocale: string;
  t: Strings;
  common: { upload: string; chooseOtherFile: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [suche, setSuche] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });

  const begriff = suche.trim().toLocaleLowerCase(dateLocale);
  const gezeigt = begriff ? zeilen.filter((z) => (z.org_name ?? "").toLocaleLowerCase(dateLocale).includes(begriff)) : zeilen;
  const mitGrafik = zeilen.filter((z) => z.asset_id).length;

  function melden(key: string) {
    toast(
      "error",
      key === "too_large" ? t.uploadTooLarge : key === "wrong_type" ? t.uploadWrongType : key === "not_allowed" ? t.uploadNotAllowed : t.uploadFailed,
    );
  }

  async function hochladen(orgId: string, file: File) {
    setLaeuft(orgId);
    try {
      if (!GRAFIK_ERLAUBT.includes(file.type)) return melden("wrong_type");
      if (file.size > GRAFIK_MAX_BYTES) return melden("too_large");
      const platz = await postJson<{ path: string; token: string }>("/api/admin/partnergrafik?step=url", {
        org_id: orgId,
        edition_id: editionId,
        content_type: file.type,
        size_bytes: file.size,
        filename: file.name,
      });
      if (!platz.ok) return melden(platz.key);
      const { error } = await createSupabaseBrowserClient()
        .storage.from("partner-assets")
        .uploadToSignedUrl(platz.data.path, platz.data.token, file, { contentType: file.type });
      if (error) return melden("upload_failed");
      const zeile = await postJson<{ ok: boolean }>("/api/admin/partnergrafik", {
        path: platz.data.path,
        org_id: orgId,
        edition_id: editionId,
        filename: file.name,
        mime: file.type,
        size_bytes: file.size,
      });
      if (!zeile.ok) return melden(zeile.key);
      toast("success", t.uploaded);
      router.refresh();
    } catch {
      melden("unknown");
    } finally {
      setLaeuft(null);
    }
  }

  if (zeilen.length === 0) return <EmptyState title={t.emptyTitle} description={t.emptyBody} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm">
          <SuchFeld
            aria-label={t.search}
            placeholder={t.search}
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>
        <span className="ct-help tabular-nums">
          {t.count.replace("{n}", String(mitGrafik)).replace("{total}", String(zeilen.length))}
        </span>
      </div>
      <Card className="p-0">
        <ul className="flex flex-col">
          {gezeigt.map((z) => (
            <li key={z.org_id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
              {/* Auf dem Telefon eine eigene Zeile, sonst bliebe dem Namen neben Badge und Knopf kaum Platz. */}
              <span className="ct-small min-w-0 flex-1 basis-full text-ink sm:basis-0">
                {z.org_name ?? "—"}
                {z.asset_id && z.created_at && (
                  <span className="ct-help block">
                    {[z.filename, t.version.replace("{n}", String(z.version ?? 1)), datum.format(new Date(z.created_at))]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
              {z.asset_id ? <Badge tone="success">{t.statusSet}</Badge> : <Badge tone="warning">{t.statusMissing}</Badge>}
              {z.url && (
                <a className="ct-link ct-small" href={z.url} {...neuesFenster}>
                  {t.preview}
                </a>
              )}
              <FileButton
                label={z.asset_id ? t.replace : t.choose}
                uploadLabel={common.upload}
                changeLabel={common.chooseOtherFile}
                accept=".png,.jpg,.jpeg,.webp,.pdf"
                variant="secondary"
                disabled={laeuft !== null}
                onFile={(file) => void hochladen(z.org_id, file)}
              />
              {laeuft === z.org_id && <span className="ct-help">{t.uploading}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
