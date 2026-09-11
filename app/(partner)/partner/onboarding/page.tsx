import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerContact, type PartnerOverview } from "../types";
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
  const [{ data: overviewJson }, { data: deliverableRows }, { data: contactRows }] =
    await Promise.all([
      supabase.rpc("partner_overview", {
        p_org_id: current.org_id,
        p_edition_id: current.edition_id,
      }),
      supabase.rpc("my_deliverables", {
        p_org_id: current.org_id,
        p_edition_id: current.edition_id,
      }),
      supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
    ]);

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  if (!overview) notFound();

  const logo =
    ((deliverableRows ?? []) as Deliverable[]).find((d) => d.key === "logo_vector") ?? null;
  const contacts = (contactRows ?? []) as PartnerContact[];
  const editable = canEditOnboarding(overview.roles, overview.team);

  if (!editable) {
    return (
      <>
        <PageHeader title={t.partner.onboardingTitle} description={t.partner.onboardingLead} />
        <EmptyState
          title={t.partner.onboardingNoRightsTitle}
          description={t.partner.onboardingNoRightsBody}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.partner.onboardingTitle} description={t.partner.onboardingLead} />
      <OnboardingWizard
        orgId={current.org_id}
        editionId={current.edition_id}
        overview={overview}
        logo={logo}
        contacts={contacts}
        canManage={overview.team || overview.roles.includes("primary_ops")}
        locale={locale}
        dateLocale={t.meta.dateLocale}
        t={t.partner}
        contactStrings={t.partnerContacts}
        common={{
          save: t.common.save,
          cancel: t.common.cancel,
          none: t.common.none,
          back: t.common.back,
          next: t.common.next,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
