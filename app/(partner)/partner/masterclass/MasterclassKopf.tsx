import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { instanzHref, type InstanzLeiste } from "@/lib/partner/instanz";
import { FormatReiter } from "../FormatReiter";

/**
 * Kopf aller Reiter der Masterclass (PART-045): Inhalt, Bewerbungen,
 * Teilnehmende, Fragen. Ohne Session stehen statt der Reiter die beiden
 * Leerzustände: „nichts gebucht“ und „wir legen euch den Slot noch an“.
 *
 * **Ab zwei Masterclasses (QS-079)** steht darüber der Umschalter: ein Reiter je Masterclass, die
 * gewählte im `?instanz=` der Adresse. Er steht **über** den vier Sichten, nie in derselben Leiste —
 * erst die Masterclass, dann, was man von ihr sehen will — und gibt seine Wahl an jede Sicht weiter.
 */
export function MasterclassKopf({
  gebucht,
  sessions,
  instanzen,
  word,
  t,
  b,
}: {
  gebucht: boolean;
  sessions: number;
  /** Der Umschalter; `null` bei einer Masterclass (die Seite ist dann wie vorher). */
  instanzen: InstanzLeiste | null;
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
        <>
          {instanzen && (
            <SectionTabs
              label={t.instanceLabel}
              items={instanzen.items.map((x) => ({ href: instanzHref(x.id), label: x.label, aktiv: x.id === instanzen.gewaehlt }))}
            />
          )}
          <FormatReiter
            basis="/partner/masterclass"
            erster={t.tabContent}
            suffix={instanzen ? instanzHref(instanzen.gewaehlt) : ""}
            t={{ label: t.title, tabApplications: b.tabApplications, tabParticipants: b.tabParticipants, tabQuestions: b.tabQuestions }}
          />
        </>
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
