import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { dateiGroesse, dateiTitel, istBild } from "@/components/partner/media-kit";
import { getPartnerScope } from "../org";

export const dynamic = "force-dynamic";

/** Wie lange ein Download-Link gilt. Lang genug zum Klicken, kurz genug zum Vergessen. */
const URL_GUELTIG_SEKUNDEN = 60 * 60;

type Datei = { id: string; kind: string; storage_path: string; filename: string; mime: string | null; size_bytes: number | null; label_de: string | null; label_en: string | null };
type Asset = { id: string; kind: string; storage_path: string; filename: string; mime: string | null; size_bytes: number | null; is_current: boolean; version: number };

/**
 * Media Kit (PART-041, ADM-023; Konrad 25.09.: „ja, bitte in einem“).
 *
 * Zwei Dinge für die Kommunikation des Partners rund um den Summit:
 * - **Eure Partnergrafik** („Wir sind dabei“) — je Organisation eine, erstellt
 *   vom Marketing unter `/admin/grafiken` (`partner_asset`, Art
 *   `partner_graphic`). Der Partner lädt sie herunter; ersetzen kann er sie
 *   nicht — das sagt die Bucket-Policy, nicht diese Seite.
 * - **Das Media Kit** — Dateien der Edition (`edition_file`, Art `media_kit`),
 *   für alle Partner gleich: Logos, Vorlagen, Textbausteine.
 *
 * Die Links sind signiert und kurzlebig und laden als Anhang herunter; sie
 * entstehen hier, nicht in der Datenbank.
 */
export default async function PartnerMediaPage() {
  await requireArea("partner", "/partner/media");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();
  const s = t.partnerMedia;

  const supabase = await createSupabaseServerClient();
  const [{ data: dateiRows }, { data: assetRows }] = await Promise.all([
    supabase.rpc("edition_files", { p_audience: "partner", p_edition_id: current.edition_id }),
    supabase.rpc("my_partner_assets", { p_org_id: current.org_id, p_edition_id: current.edition_id }),
  ]);
  const dateien = ((dateiRows ?? []) as Datei[]).filter((d) => d.kind === "media_kit");
  const grafik = ((assetRows ?? []) as Asset[]).find((a) => a.kind === "partner_graphic" && a.is_current) ?? null;

  const signiert = async (bucket: string, pfad: string, download: string | false) => {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(pfad, URL_GUELTIG_SEKUNDEN, download ? { download } : undefined);
    return data?.signedUrl ?? null;
  };
  const [grafikDownload, grafikVorschau, dateiLinks] = await Promise.all([
    grafik ? signiert("partner-assets", grafik.storage_path, grafik.filename) : null,
    grafik && istBild(grafik.mime) ? signiert("partner-assets", grafik.storage_path, false) : null,
    Promise.all(dateien.map((d) => signiert("edition-files", d.storage_path, d.filename))),
  ]);

  return (
    <>
      <PageHeader word={t.partner.wordVisibility} title={s.title} description={s.lead} />
      <div className="flex flex-col gap-8">
        <Card>
          <CardHeader title={s.graphicTitle} description={s.graphicLead} />
          {grafik && grafikDownload ? (
            <div className="flex flex-col gap-4">
              {grafikVorschau && (
                // eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige Adresse; kein Loader-Ziel
                <img
                  src={grafikVorschau}
                  alt={s.graphicAlt}
                  className="max-h-96 w-full max-w-form rounded-ct-md border object-contain"
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href={grafikDownload}>{s.graphicDownload}</ButtonLink>
                <span className="ct-help">
                  {[grafik.filename, dateiGroesse(grafik.size_bytes, t.meta.dateLocale)].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState title={s.graphicEmptyTitle} description={s.graphicEmptyBody} />
          )}
        </Card>

        <Card>
          <CardHeader title={s.kitTitle} description={s.kitLead} />
          {dateien.length === 0 ? (
            <EmptyState title={s.kitEmptyTitle} description={s.kitEmptyBody} />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {dateien.map((d, i) => {
                const link = dateiLinks[i];
                return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="ct-small min-w-0 flex-1 text-ink">
                    {dateiTitel(d, locale)}
                    <span className="ct-help block">
                      {[d.filename, dateiGroesse(d.size_bytes, t.meta.dateLocale)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {link && (
                    <ButtonLink href={link} variant="secondary" size="sm">
                      {s.kitDownload}
                    </ButtonLink>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
