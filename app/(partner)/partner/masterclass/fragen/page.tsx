import { requireArea } from "@/lib/auth";
import { FormatFragen } from "../../FormatFragen";
import { ladeMasterclass } from "../daten";
import { MasterclassKopf } from "../MasterclassKopf";

export const dynamic = "force-dynamic";

/**
 * Bewerbungsfragen der Masterclass (PART-045), vierter Reiter. Bei mehreren Masterclasses (QS-079) steht nur die gewählte da
 * (`?instanz=`): die Fragenwahl und das Formular für eigene Fragen genau einmal, nicht je Masterclass.
 */
export default async function PartnerMasterclassQuestionsPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/masterclass/fragen");
  const { instanz } = await searchParams;
  const { supabase, locale, t, sessions, gewaehlt, instanzen, gebucht, canEdit } = await ladeMasterclass(instanz);
  const s = t.partnerMasterclass;
  return (
    <>
      <MasterclassKopf gebucht={gebucht} sessions={sessions.length} instanzen={instanzen} word={t.partner.wordInvitation} t={s} b={t.partnerBewerbung} />
      {gewaehlt && (
        <FormatFragen
          supabase={supabase}
          sessions={[gewaehlt]}
          canEdit={canEdit}
          locale={locale}
          titel={(x) => (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? s.untitled}
          t={{ bewerbung: t.partnerBewerbung, rpc: t.rpc, cancel: t.partnerTalk.cancel }}
        />
      )}
    </>
  );
}
