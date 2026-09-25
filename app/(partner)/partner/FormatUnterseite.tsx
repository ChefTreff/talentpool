import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { zeitraum } from "./company-tour/daten";
import { ladeEigenesFormat } from "./bewerbungen";
import { FormatBewerbungen } from "./FormatBewerbungen";
import { FormatFragen } from "./FormatFragen";
import { FormatReiter } from "./FormatReiter";
import type { PartnerFormatSession } from "./talk/types";

/** Die eigenen Formate mit Bewerbung, die ihre Reiter hier bekommen (PART-082). */
const FORMATE = {
  side_event: { basis: "/partner/side-event", texte: "partnerSideEvent", wort: "wordInvitation" },
  interview_table: { basis: "/partner/interview-tables", texte: "partnerInterviewTables", wort: "wordConversations" },
} as const;

/**
 * Bewerbungen, Teilnehmende oder Fragen eines eigenen Formats — Side-Event
 * und Interview Tables (PART-082: die Sammelseite unter /partner/bewerber ist
 * in den Formatseiten aufgegangen). Dieselben Bausteine wie bei der
 * Masterclass; die Überschrift je Session trägt die Zeit, weil ein Partner
 * bei den Interview Tables viele gleichnamige Slots hat.
 */
export async function FormatUnterseite({
  format,
  ansicht,
}: {
  format: keyof typeof FORMATE;
  ansicht: "bewerbungen" | "teilnehmende" | "fragen";
}) {
  const { basis, texte, wort } = FORMATE[format];
  const { supabase, locale, t, current, sessions, canEdit } = await ladeEigenesFormat(format);
  const s = t[texte] as unknown as Record<string, string>;
  const b = t.partnerBewerbung as unknown as Record<string, string>;
  const titel = (x: PartnerFormatSession) => {
    const name = (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? b.untitledSession;
    const wann = zeitraum(x.starts_at, x.ends_at, t.meta.dateLocale);
    return wann ? `${name} · ${wann}` : name;
  };

  return (
    <>
      <PageHeader word={t.partner[wort]} title={s.title} description={s.lead} />
      {sessions.length === 0 ? (
        <EmptyState title={b.noSessionsTitle} description={b.noSessionsBody} />
      ) : (
        <>
          <FormatReiter
            basis={basis}
            erster={s.tabMain}
            t={{ label: s.title, tabApplications: b.tabApplications, tabParticipants: b.tabParticipants, tabQuestions: b.tabQuestions }}
          />
          {ansicht === "fragen" ? (
            <FormatFragen
              supabase={supabase}
              sessions={sessions}
              canEdit={canEdit}
              locale={locale}
              titel={titel}
              t={{ bewerbung: b, rpc: t.rpc, cancel: t.partnerTalk.cancel }}
            />
          ) : (
            <FormatBewerbungen
              supabase={supabase}
              orgId={current.org_id}
              sessions={sessions}
              nurTeilnehmende={ansicht === "teilnehmende"}
              canEdit={canEdit}
              locale={locale}
              titel={titel}
              t={{ bewerbung: b, applicants: t.partnerApplicants, rpc: t.rpc, dateLocale: t.meta.dateLocale }}
            />
          )}
        </>
      )}
    </>
  );
}
