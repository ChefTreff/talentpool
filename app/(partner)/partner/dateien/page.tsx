import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import type { PartnerAsset } from "../types";
import { FileList, type FileRow } from "./FileList";

export const dynamic = "force-dynamic";

/**
 * Alles an einer Stelle, was diese Organisation hochgeladen hat — quer über
 * die Pflichten, neueste zuerst, ersetzte Fassungen bleiben lesbar.
 *
 * `my_partner_assets` (Migration 0053) liefert genau das; der Direktzugriff
 * auf `partner_asset` aus PR #15 ist damit erledigt.
 */
export default async function PartnerFilesPage() {
  await requireArea("partner", "/partner/dateien");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase.rpc("my_partner_assets", {
    p_org_id: current.org_id,
    p_edition_id: current.edition_id,
  });

  const files: FileRow[] = ((rows ?? []) as PartnerAsset[]).map((a) => ({
    ...a,
    // Ohne Pflicht dahinter bleibt die Art des Uploads als Beschriftung.
    deliverableLabel:
      (locale === "en" ? a.label_en : a.label_de) ?? a.label_de ?? a.deliverable_key ?? a.kind,
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
