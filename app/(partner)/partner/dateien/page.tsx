import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import type { Deliverable, PartnerOverview } from "../types";
import { FileList, type FileRow } from "./FileList";

export const dynamic = "force-dynamic";

/**
 * Alles an einer Stelle, was diese Organisation hochgeladen hat.
 *
 * Gelesen wird `partner_asset` direkt — unter RLS, mit dem Session-Client, wie
 * das Board seine Sichten liest. `my_deliverables` liefert nur die **aktuelle**
 * Fassung je Pflicht; hier sollen aber auch die ersetzten Fassungen stehen
 * (Kontrakt B4: „alte bleiben lesbar"). Die Beschriftung kommt weiterhin aus
 * der RPC, damit Datei und Pflicht dieselben Worte tragen.
 */
export default async function PartnerFilesPage() {
  await requireArea("partner", "/partner/dateien");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: overviewJson } = await supabase.rpc("partner_overview", {
    p_org_id: current.org_id,
    p_edition_id: current.edition_id,
  });
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  if (!overview) notFound();

  const [{ data: assetRows }, { data: deliverableRows }] = await Promise.all([
    supabase
      .from("partner_asset")
      .select("id, kind, filename, mime, size_bytes, version, is_current, status, storage_path, created_at, deliverable_id")
      .eq("org_edition_id", overview.edition.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("my_deliverables", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
  ]);

  const labels = new Map<string, string>();
  for (const d of (deliverableRows ?? []) as Deliverable[]) {
    labels.set(d.id, (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key);
  }

  const files: FileRow[] = (
    (assetRows ?? []) as (Omit<FileRow, "deliverableLabel"> & { deliverable_id: string | null })[]
  ).map((a) => ({
    ...a,
    // Ohne Pflicht dahinter bleibt die Art des Uploads als Beschriftung.
    deliverableLabel: (a.deliverable_id && labels.get(a.deliverable_id)) || a.kind,
  }));

  return (
    <>
      <PageHeader
        title={t.partnerFiles.title}
        description={`${t.partnerFiles.lead} · ${files.length}`}
      />
      {files.length === 0 ? (
        <EmptyState
          title={t.partnerFiles.emptyTitle}
          description={t.partnerFiles.emptyBody}
          action={
            <Link href="/partner/checkliste" className="ct-link">
              {t.partnerFiles.toChecklist}
            </Link>
          }
        />
      ) : (
        <>
          <FileList
            rows={files}
            dateLocale={t.meta.dateLocale}
            t={t.partnerFiles}
            common={{ none: t.common.none }}
          />
          <p className="ct-help mt-4">{t.partnerFiles.invoicesSoon}</p>
        </>
      )}
    </>
  );
}
