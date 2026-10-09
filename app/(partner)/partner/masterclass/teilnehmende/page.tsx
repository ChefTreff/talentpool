import { requireArea } from "@/lib/auth";
import { FormatBewerbungen } from "../../FormatBewerbungen";
import { ladeMasterclass } from "../daten";
import { MasterclassKopf } from "../MasterclassKopf";

export const dynamic = "force-dynamic";

/**
 * Teilnehmende der Masterclass: zugesagt und bestätigt (PART-045), dritter Reiter. Bei mehreren Masterclasses (QS-079) steht nur
 * die gewählte da (`?instanz=`).
 */
export default async function PartnerMasterclassParticipantsPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/masterclass/teilnehmende");
  const { instanz } = await searchParams;
  const { supabase, locale, t, current, sessions, gewaehlt, instanzen, gebucht, canEdit } = await ladeMasterclass(instanz);
  const s = t.partnerMasterclass;
  return (
    <>
      <MasterclassKopf gebucht={gebucht} sessions={sessions.length} instanzen={instanzen} word={t.partner.wordInvitation} t={s} b={t.partnerBewerbung} />
      {gewaehlt && (
        <FormatBewerbungen
          supabase={supabase}
          orgId={current.org_id}
          sessions={[gewaehlt]}
          nurTeilnehmende
          canEdit={canEdit}
          locale={locale}
          titel={(x) => (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? s.untitled}
          t={{ bewerbung: t.partnerBewerbung, applicants: t.partnerApplicants, rpc: t.rpc, dateLocale: t.meta.dateLocale }}
        />
      )}
    </>
  );
}
