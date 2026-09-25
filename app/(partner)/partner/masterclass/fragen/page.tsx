import { requireArea } from "@/lib/auth";
import { FormatFragen } from "../../FormatFragen";
import { ladeMasterclass } from "../daten";
import { MasterclassKopf } from "../MasterclassKopf";

export const dynamic = "force-dynamic";

/** Bewerbungsfragen der Masterclass (PART-045), vierter Reiter. */
export default async function PartnerMasterclassQuestionsPage() {
  await requireArea("partner", "/partner/masterclass/fragen");
  const { supabase, locale, t, sessions, gebucht, canEdit } = await ladeMasterclass();
  const s = t.partnerMasterclass;
  return (
    <>
      <MasterclassKopf gebucht={gebucht} sessions={sessions.length} word={t.partner.wordInvitation} t={s} b={t.partnerBewerbung} />
      {sessions.length > 0 && (
        <FormatFragen
          supabase={supabase}
          sessions={sessions}
          canEdit={canEdit}
          locale={locale}
          titel={(x) => (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? s.untitled}
          t={{ bewerbung: t.partnerBewerbung, rpc: t.rpc, cancel: t.partnerTalk.cancel }}
        />
      )}
    </>
  );
}
