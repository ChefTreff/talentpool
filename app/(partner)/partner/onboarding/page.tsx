import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { WenSuchtIhr } from "@/components/partner/WenSuchtIhr";
import { hiringOptionen, type HiringEintrag } from "@/components/partner/hiring";
import { deleteOrgHiring, saveOrgHiring } from "../actions";
import { EureDatenView } from "./EureDatenView";

export const dynamic = "force-dynamic";


/**
 * „Eure Daten“: vier Abschnitte einer Seite mit Stand und Zahl (PART-106) — vorher ein Wizard, jetzt von Anfang an
 * dieselbe Seite wie später als Profil.
 *
 * Das Logo ist keine eigene Mechanik, sondern die Pflicht `logo_vector` aus
 * `my_deliverables` — Upload, Registrierung und Einreichung laufen wie bei
 * jeder anderen Datei.
 */
export default async function PartnerOnboardingPage() {
  await requireArea("partner", "/partner/onboarding");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  // Kontakte werden hier nicht mehr geladen: sie stehen unter „Kontakte" und
  // standen vorher doppelt (F12.6).
  const [{ data: overviewJson }, { data: deliverableRows }, { data: hiringRows }, vocab] = await Promise.all([
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("my_deliverables", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    // K-94 Stufe 2a (PART-107): „Wen sucht ihr?“ — die Einträge der Organisation.
    supabase.rpc("partner_org_hiring", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    loadVocabMap(supabase, locale),
  ]);

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  if (!overview) notFound();

  // Seit Migration 0057 sind es zwei: SVG und PNG. Welche es genau sind,
  // steht in den Vorlagen — die Seite sucht nach dem Präfix, statt die
  // Schlüssel noch einmal fest hinzuschreiben.
  const logos = ((deliverableRows ?? []) as Deliverable[])
    .filter((d) => d.key.startsWith("logo_"))
    .sort((a, b) => a.sort - b.sort);
  const editable = canEditOnboarding(overview.roles, overview.team);

  if (!editable) {
    return (
      <>
        <PageHeader word={t.partner.wordCompany} title={t.partner.onboardingTitle} description={t.partner.onboardingLead} />
        <EmptyState
          title={t.partner.onboardingNoRightsTitle}
          description={t.partner.onboardingNoRightsBody}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader word={t.partner.wordCompany} title={t.partner.onboardingTitle} description={t.partner.onboardingLead} />
      <EureDatenView
        orgId={current.org_id}
        editionId={current.edition_id}
        overview={overview}
        logos={logos}
        industries={vgroup(vocab, "industry")}
        einwilligung={t.logoWandEinwilligung}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        t={t.partner}
        common={{
          none: t.common.none,
          upload: t.common.upload,
          chooseOtherFile: t.common.chooseOtherFile,
          onThisPage: t.common.onThisPage,
        }}
        unsaved={t.common.unsaved}
        rpcMessages={t.rpc}
      />
      {/* K-94 Stufe 2a (PART-107): „Wen sucht ihr?“ — jeder Eintrag speichert für sich, nicht mit der Leiste der Abschnitte oben. */}
      <div className="mt-10">
        <WenSuchtIhr
          id="hiring"
          orgId={current.org_id}
          editionId={current.edition_id}
          eintraege={(hiringRows ?? []) as HiringEintrag[]}
          canEdit={editable}
          optionen={hiringOptionen((name) => vgroup(vocab, name))}
          save={saveOrgHiring}
          remove={deleteOrgHiring}
          t={t.partnerHiring}
          rpcMessages={t.rpc}
        />
      </div>
    </>
  );
}
