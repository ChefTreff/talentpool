import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Gaesteliste } from "@/components/partner/Gaesteliste";
import type { GastRow } from "@/components/partner/gaeste";
import { gastFotoAdressen } from "@/lib/partner/gaeste";
import { canEditOnboarding, type PartnerOverview } from "../../types";
import { getPartnerScope } from "../../org";
import { addStageGuest, registerStageGuestPhoto, removeStageGuest, updateStageGuest } from "../../actions";
import { BuehnenTabs } from "../BuehnenTabs";
import { ladeEigeneBuehnen } from "../daten";

export const dynamic = "force-dynamic";

const PATH = "/partner/buehne/gaeste";

/**
 * Gäste der Standbühne (PART-081): wer auf der eigenen Standbühne spricht, ohne
 * Speaker zu sein — Liste zum Anlegen, Bearbeiten und Entfernen, Porträt
 * Pflicht, Einwilligung mit Zeitstempel. Zugeordnet werden die Gäste in der
 * Tabelle (Details eines Programmpunkts). Gelesen wird über
 * `partner_stage_guests` mit dem Sitzungs-Client; die Porträts über signierte
 * Adressen, die die Storage-Policy nur für eigene Gäste ausstellt.
 */
export default async function PartnerStageGuestsPage() {
  await requireArea("partner", PATH);
  const { t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const kopf = (
    <>
      <PageHeader word={t.partner.wordProgramme} title={t.partnerStage.title} description={t.partnerStage.lead} />
      <BuehnenTabs
        t={{
          label: t.partnerStage.title,
          board: t.admin.programmeTable.tabBoard,
          table: t.admin.programmeTable.tabTable,
          guests: t.partnerGuests.tab,
        }}
      />
    </>
  );

  // Gäste gibt es für die Standbühne der gewählten Organisation.
  const eigene = (await ladeEigeneBuehnen()).filter((s) => s.org_id === current.org_id);
  if (eigene.length === 0) {
    return (
      <>
        {kopf}
        <EmptyState title={t.partnerGuests.noStageTitle} description={t.partnerGuests.noStageBody} />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: zeilen }, { data: overviewJson }] = await Promise.all([
    supabase.rpc("partner_stage_guests", { p_org_id: current.org_id, p_edition_id: current.edition_id }),
    supabase.rpc("partner_overview", { p_org_id: current.org_id, p_edition_id: current.edition_id }),
  ]);
  const roh = (zeilen ?? []) as Omit<GastRow, "photo_url">[];
  const adressen = await gastFotoAdressen(
    supabase,
    roh.map((g) => g.photo_path).filter((p): p is string => !!p),
  );
  const gaeste: GastRow[] = roh.map((g) => ({ ...g, photo_url: g.photo_path ? adressen.get(g.photo_path) ?? null : null }));
  const overview = (overviewJson ?? null) as PartnerOverview | null;

  return (
    <>
      {kopf}
      <Gaesteliste
        orgId={current.org_id}
        gaeste={gaeste}
        canManage={canEditOnboarding(overview?.roles ?? [], overview?.team ?? false)}
        actions={{
          add: addStageGuest,
          update: updateStageGuest,
          remove: removeStageGuest,
          registerPhoto: registerStageGuestPhoto,
        }}
        dateLocale={t.meta.dateLocale}
        t={t.partnerGuests}
        rpcMessages={t.rpc}
      />
    </>
  );
}
