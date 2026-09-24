import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerAsset, type PartnerOverview } from "../types";
import { FileList, type FileRow } from "./FileList";
import { DateienView, type BelegZeile } from "./DateienView";

export const dynamic = "force-dynamic";

/** Logos zuerst: sie braucht jeder Partner, und nach ihnen fragt man zuerst. */
const logoZuerst = (d: Deliverable) => (d.key.startsWith("logo_") ? 0 : 1);

/**
 * Dateien (PART-065): feste Plätze für jede Datei, die das Portal von euch
 * braucht — die Upload-Pflichten aus `my_deliverables`, auch ohne Datei —,
 * dazu die Belege von uns (`my_partner_documents`: Angebot, Rechnung,
 * Messeshop-Rechnung) und darunter alle Fassungen (`my_partner_assets`).
 *
 * Vorher stand hier nur, was schon hochgeladen war; bei einem neuen Partner
 * war die Seite leer und „erfüllte keinen Nutzen“ (Konrad, 21.09.).
 */
export default async function PartnerFilesPage() {
  await requireArea("partner", "/partner/dateien");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: rows }, { data: deliverableRows }, { data: belegRows }, { data: overviewJson }] = await Promise.all([
    supabase.rpc("my_partner_assets", args),
    supabase.rpc("my_deliverables", args),
    supabase.rpc("my_partner_documents", args),
    supabase.rpc("partner_overview", args),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;

  const pflichten = ((deliverableRows ?? []) as Deliverable[])
    .filter((d) => d.type === "upload")
    .sort((a, b) => logoZuerst(a) - logoZuerst(b) || a.sort - b.sort || a.key.localeCompare(b.key));
  const kontext = Object.fromEntries(
    pflichten.map((d) => [
      d.id,
      d.product_sku
        ? ((locale === "en" ? d.product_name_en : d.product_name_de) ?? d.product_name_de ?? t.partnerFiles.contextGeneral)
        : t.partnerFiles.contextGeneral,
    ]),
  );

  const files: FileRow[] = ((rows ?? []) as PartnerAsset[]).map((a) => ({
    ...a,
    // Ohne Pflicht dahinter bleibt die Art des Uploads als Beschriftung. Belege
    // aus SevDesk (0122) haengen an keiner Pflicht — ohne diesen Zweig stuende
    // dort „invoice" statt „Rechnung".
    deliverableLabel:
      (locale === "en" ? a.label_en : a.label_de) ??
      a.label_de ??
      a.deliverable_key ??
      (a.kind === "invoice"
        ? t.partnerFiles.docKindInvoice
        : a.kind === "offer"
          ? t.partnerFiles.docKindOffer
          : a.kind),
  }));

  return (
    <>
      <PageHeader word={t.partner.wordMaterial} title={t.partnerFiles.title} description={t.partnerFiles.lead} />
      <DateienView
        orgId={current.org_id}
        editionId={current.edition_id}
        pflichten={pflichten}
        kontext={kontext}
        belege={(belegRows ?? []) as BelegZeile[]}
        // Hochladen dürfen dieselben Rollen wie an der Aufgabe; die RPC prüft es noch einmal.
        canEdit={canEditOnboarding(overview?.roles ?? [], overview?.team ?? false)}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        fristTexte={{
          label: t.partnerFiles.deadlineLabel,
          days: t.partner.countdownDays,
          hours: t.partner.countdownHours,
          soon: t.partner.countdownSoon,
          passed: t.common.deadlinePassed,
          done: t.common.deadlineDone,
        }}
        statusText={{
          open: t.partner.deliverable_open,
          submitted: t.partner.deliverable_submitted,
          accepted: t.partner.deliverable_accepted,
          rejected: t.partner.deliverable_rejected,
          overdue: t.partner.deliverable_overdue,
        }}
        t={t.partnerFiles}
        common={{ upload: t.common.upload, chooseOtherFile: t.common.chooseOtherFile }}
        rpcMessages={t.rpc}
      />

      {files.length > 0 && (
        <section aria-labelledby="dateien-alle" className="mt-10">
          <h2 id="dateien-alle" className="ct-h2 border-b pb-2 text-ink">
            {t.partnerFiles.historyTitle}
          </h2>
          <p className="ct-help mt-2 mb-4">{t.partnerFiles.historyLead}</p>
          <FileList rows={files} dateLocale={t.meta.dateLocale} t={t.partnerFiles} common={{ none: t.common.none }} />
        </section>
      )}
    </>
  );
}
