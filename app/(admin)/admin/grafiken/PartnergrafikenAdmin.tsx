"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileButton } from "@/components/ui/FileButton";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { partnergrafikAblegen } from "@/components/partner/partnergrafik-upload";

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
 *
 * **Eine Tabelle statt einer Liste aus Badge, zwei Links und einem Umrissknopf**
 * (ADM-075, Konrad 05.10.: „die Buttons sauberer strukturieren“): Partner, Stand,
 * Aktionen in festen Spalten, die Aktionen rechtsbündig und alle gleich groß —
 * „Ansehen“ (ruhig), „Mit Generator erzeugen“ und „Hochladen“ oder „Ersetzen“ (Umriss). Vorher hatte der
 * Auswahlknopf 44 px zwischen Textlinks, und die Ränder standen von Zeile zu Zeile
 * woanders, weil „Ersetzen“ und „Grafik hochladen“ verschieden breit sind.
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
    const r = await partnergrafikAblegen(orgId, editionId, file);
    setLaeuft(null);
    if (!r.ok) return melden(r.key);
    toast("success", t.uploaded);
    router.refresh();
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
      <Table stapeln>
        <Thead>
          <Th>{t.colPartner}</Th>
          <Th>{t.colStatus}</Th>
          <Th>
            <span className="sr-only">{t.colActions}</span>
          </Th>
        </Thead>
        <Tbody>
          {gezeigt.map((z) => (
            <Tr key={z.org_id}>
              <Td>
                <span className="ct-label text-ink">{z.org_name ?? "—"}</span>
                {z.asset_id && z.created_at && (
                  <span className="ct-help block text-muted">
                    {[z.filename, t.version.replace("{n}", String(z.version ?? 1)), datum.format(new Date(z.created_at))]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </Td>
              <Td label={t.colStatus}>
                {z.asset_id ? <Badge tone="success">{t.statusSet}</Badge> : <Badge tone="warning">{t.statusMissing}</Badge>}
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {z.url && (
                    <ButtonLink href={z.url} variant="ghost" size="sm" {...neuesFenster}>
                      {t.preview}
                    </ButtonLink>
                  )}
                  {/* Der Generator (PART-097): dieselbe Grafik wie im Partner-Portal, Logo und Foto wählt das Marketing selbst. */}
                  <ButtonLink href={`/admin/grafiken/meet-us-at?org=${z.org_id}`} variant="secondary" size="sm">
                    {t.generate}
                  </ButtonLink>
                  <FileButton
                    label={z.asset_id ? t.replace : t.choose}
                    uploadLabel={common.upload}
                    changeLabel={common.chooseOtherFile}
                    accept=".png,.jpg,.jpeg,.webp,.pdf"
                    variant="secondary"
                    size="sm"
                    laedt={laeuft === z.org_id}
                    disabled={laeuft !== null}
                    onFile={(file) => void hochladen(z.org_id, file)}
                  />
                </div>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
