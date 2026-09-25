import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormatReiter } from "../FormatReiter";

/**
 * Kopf aller Reiter der Masterclass (PART-045): Inhalt, Bewerbungen,
 * Teilnehmende, Fragen. Ohne Session stehen statt der Reiter die beiden
 * Leerzustände: „nichts gebucht“ und „wir legen euch den Slot noch an“.
 */
export function MasterclassKopf({
  gebucht,
  sessions,
  word,
  t,
  b,
}: {
  gebucht: boolean;
  sessions: number;
  word: string;
  /** Texte der Masterclass. */
  t: Record<string, string>;
  /** Gemeinsame Texte der Bewerbungsreiter (`partnerBewerbung`). */
  b: Record<string, string>;
}) {
  return (
    <>
      <PageHeader word={word} title={t.title} description={t.lead} />
      {sessions > 0 ? (
        <FormatReiter
          basis="/partner/masterclass"
          erster={t.tabContent}
          t={{ label: t.title, tabApplications: b.tabApplications, tabParticipants: b.tabParticipants, tabQuestions: b.tabQuestions }}
        />
      ) : gebucht ? (
        <EmptyState title={t.noSessionTitle} description={t.noSessionBody} />
      ) : (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyBody}
          action={
            <Link href="/partner/checkliste" className="ct-link">
              {t.toChecklist}
            </Link>
          }
        />
      )}
    </>
  );
}
