import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { InstanzWahl } from "@/components/layout/InstanzWahl";
import { instanzKennung, instanzSuffix, tischWahl, type InstanzLeiste } from "@/lib/partner/instanz";
import { zeitraum } from "./company-tour/daten";
import { ladeEigenesFormat } from "./bewerbungen";
import { ladeFlaechen } from "./formate";
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
 *
 * **Mehrere Tische (QS-079):** `instanz` ist `searchParams.instanz`, die Fläche des Tisches. Ab zwei Tischen steht der Umschalter über den
 * Reitern, und die Sicht zeigt nur die Gespräche des gewählten Tisches — dieselbe Wahl wie auf der Formatseite (`tischWahl`), und die Reiter nehmen
 * sie mit. Bei einem Tisch (und beim Side-Event, ein Ort je Organisation) bleibt alles wie vorher.
 */
export async function FormatUnterseite({
  format,
  ansicht,
  instanz,
}: {
  format: keyof typeof FORMATE;
  ansicht: "bewerbungen" | "teilnehmende" | "fragen";
  instanz?: string | string[];
}) {
  const { basis, texte, wort } = FORMATE[format];
  const { supabase, locale, t, current, sessions: alle, canEdit } = await ladeEigenesFormat(format);
  const s = t[texte] as unknown as Record<string, string>;
  const b = t.partnerBewerbung as unknown as Record<string, string>;
  const titel = (x: PartnerFormatSession) => {
    const name = (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? b.untitledSession;
    const wann = zeitraum(x.starts_at, x.ends_at, t.meta.dateLocale);
    return wann ? `${name} · ${wann}` : name;
  };

  let sessions = alle;
  let instanzen: InstanzLeiste | null = null;
  if (format === "interview_table") {
    const flaechen = await ladeFlaechen(supabase, current.org_id, "interview_table");
    const wahl = tischWahl(flaechen.stages, alle, instanzKennung(instanz), (n) => s.instanceNumber.replace("{n}", String(n)));
    instanzen = wahl.instanzen;
    if (instanzen && wahl.gewaehlt) {
      const tischId = wahl.gewaehlt.id;
      sessions = alle.filter((x) => x.stage_id === tischId);
    }
  }

  return (
    <>
      <PageHeader word={t.partner[wort]} title={s.title} description={s.lead} />
      {alle.length === 0 ? (
        <EmptyState title={b.noSessionsTitle} description={b.noSessionsBody} />
      ) : (
        <>
          <InstanzWahl leiste={instanzen} label={s.instanceLabel} />
          <FormatReiter
            basis={basis}
            erster={s.tabMain}
            suffix={instanzSuffix(instanzen)}
            t={{ label: s.title, tabApplications: b.tabApplications, tabParticipants: b.tabParticipants, tabQuestions: b.tabQuestions }}
          />
          {sessions.length === 0 ? (
            <EmptyState title={b.noSessionsTitle} description={b.noSessionsBody} />
          ) : ansicht === "fragen" ? (
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
