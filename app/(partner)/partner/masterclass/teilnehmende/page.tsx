import { requireArea } from "@/lib/auth";
import { ladeMasterclass } from "../daten";
import { MasterclassBewerbungen } from "../MasterclassBewerbungen";
import { MasterclassKopf } from "../MasterclassKopf";

export const dynamic = "force-dynamic";

/** Teilnehmende der Masterclass: zugesagt und bestätigt (PART-045), dritter Reiter. */
export default async function PartnerMasterclassParticipantsPage() {
  await requireArea("partner", "/partner/masterclass/teilnehmende");
  const { supabase, locale, t, current, sessions, gebucht, canEdit } = await ladeMasterclass();
  return (
    <>
      <MasterclassKopf gebucht={gebucht} sessions={sessions.length} word={t.partner.wordInvitation} t={t.partnerMasterclass} />
      {sessions.length > 0 && (
        <MasterclassBewerbungen
          supabase={supabase}
          orgId={current.org_id}
          sessions={sessions}
          nurTeilnehmende
          canEdit={canEdit}
          locale={locale}
          t={{ masterclass: t.partnerMasterclass, applicants: t.partnerApplicants, rpc: t.rpc, dateLocale: t.meta.dateLocale }}
        />
      )}
    </>
  );
}
