import { requireArea } from "@/lib/auth";
import { ladeTour } from "../daten";
import { TourBewerbungen } from "../TourBewerbungen";
import { TourKopf } from "../TourKopf";

export const dynamic = "force-dynamic";

/** Bewerbungen auf die Company Tour (PART-046), zweiter Reiter. */
export default async function PartnerCompanyTourApplicationsPage() {
  await requireArea("partner", "/partner/company-tour/bewerbungen");
  const { supabase, locale, t, stopps, gebucht, canEdit } = await ladeTour();
  return (
    <>
      <TourKopf gebucht={gebucht} stopps={stopps.length} word={t.partner.wordInvitation} t={t.partnerTour} />
      {stopps.length > 0 && (
        <TourBewerbungen
          supabase={supabase}
          stopps={stopps}
          canEdit={canEdit}
          nurTeilnehmende={false}
          locale={locale}
          t={{ tour: t.partnerTour, bewerbung: t.partnerBewerbung, applicants: t.partnerApplicants, rpc: t.rpc, dateLocale: t.meta.dateLocale }}
        />
      )}
    </>
  );
}
