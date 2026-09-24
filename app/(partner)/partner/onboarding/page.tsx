import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { OnboardingWizard } from "./OnboardingWizard";

export const dynamic = "force-dynamic";


/**
 * Onboarding als Wizard, danach dieselbe Seite als Profil.
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
  const [{ data: overviewJson }, { data: deliverableRows }, vocab] = await Promise.all([
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("my_deliverables", {
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
      <OnboardingWizard
        orgId={current.org_id}
        editionId={current.edition_id}
        overview={overview}
        logos={logos}
        industries={vgroup(vocab, "industry")}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        t={t.partner}
        common={{
          save: t.common.save,
          cancel: t.common.cancel,
          none: t.common.none,
          back: t.common.back,
          next: t.common.next,
                  upload: t.common.upload,
          chooseOtherFile: t.common.chooseOtherFile,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
