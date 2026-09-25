import { requireArea } from "@/lib/auth";
import { ladeTour } from "../daten";
import { TourBewerbungen } from "../TourBewerbungen";
import { TourKopf } from "../TourKopf";

export const dynamic = "force-dynamic";

/** Teilnehmende der Company Tour (PART-046): zugesagt und bestätigt, dritter Reiter. */
export default async function PartnerCompanyTourParticipantsPage() {
  await requireArea("partner", "/partner/company-tour/teilnehmende");
  const { supabase, locale, t, stopps, gebucht } = await ladeTour();
  return (
    <>
      <TourKopf gebucht={gebucht} stopps={stopps.length} word={t.partner.wordInvitation} t={t.partnerTour} />
      {stopps.length > 0 && (
        <TourBewerbungen
          supabase={supabase}
          stopps={stopps}
          nurTeilnehmende
          locale={locale}
          t={{ tour: t.partnerTour, applicants: t.partnerApplicants, rpc: t.rpc, dateLocale: t.meta.dateLocale }}
        />
      )}
    </>
  );
}
