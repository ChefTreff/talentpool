import { requireArea } from "@/lib/auth";
import { ladeTour } from "../daten";
import { TourBewerbungen } from "../TourBewerbungen";
import { TourKopf } from "../TourKopf";

export const dynamic = "force-dynamic";

/** Teilnehmende der Company Tour (PART-046): zugesagt und bestätigt, dritter Reiter. Bei mehreren Stopps (QS-079) die des gewählten (`?instanz=`). */
export default async function PartnerCompanyTourParticipantsPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/company-tour/teilnehmende");
  const { instanz } = await searchParams;
  const { supabase, locale, t, stopps, gewaehlt, instanzen, gebucht, canEdit } = await ladeTour(instanz);
  return (
    <>
      <TourKopf gebucht={gebucht} stopps={stopps.length} instanzen={instanzen} word={t.partner.wordInvitation} t={t.partnerTour} />
      {gewaehlt && (
        <TourBewerbungen
          supabase={supabase}
          stopps={[gewaehlt]}
          canEdit={canEdit}
          nurTeilnehmende
          locale={locale}
          t={{ tour: t.partnerTour, bewerbung: t.partnerBewerbung, applicants: t.partnerApplicants, rpc: t.rpc, dateLocale: t.meta.dateLocale }}
        />
      )}
    </>
  );
}
