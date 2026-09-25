import { requireArea } from "@/lib/auth";
import { FormatBewerbungen } from "../../FormatBewerbungen";
import { ladeMasterclass } from "../daten";
import { MasterclassKopf } from "../MasterclassKopf";

export const dynamic = "force-dynamic";

/** Teilnehmende der Masterclass: zugesagt und bestätigt (PART-045), dritter Reiter. */
export default async function PartnerMasterclassParticipantsPage() {
  await requireArea("partner", "/partner/masterclass/teilnehmende");
  const { supabase, locale, t, current, sessions, gebucht, canEdit } = await ladeMasterclass();
  const s = t.partnerMasterclass;
  return (
    <>
      <MasterclassKopf gebucht={gebucht} sessions={sessions.length} word={t.partner.wordInvitation} t={s} b={t.partnerBewerbung} />
      {sessions.length > 0 && (
        <FormatBewerbungen
          supabase={supabase}
          orgId={current.org_id}
          sessions={sessions}
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
