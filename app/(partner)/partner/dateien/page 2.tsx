import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import type { Deliverable } from "../types";
import { FileList, toFileRows } from "./FileList";

export const dynamic = "force-dynamic";

/**
 * Alles an einer Stelle, was diese Organisation hochgeladen hat — quer über
 * die Pflichten, neueste zuerst, alte Fassungen bleiben lesbar. Angebot und
 * Rechnung aus SevDesk kommen später dazu (A10).
 */
export default async function PartnerFilesPage() {
  await requireArea("partner", "/partner/dateien");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase.rpc("my_deliverables", {
    p_org_id: current.org_id,
    p_edition_id: current.edition_id,
  });
  const files = toFileRows((rows ?? []) as Deliverable[], locale);

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
