import Link from "next/link";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

const BASE = "/partner/masterclass";

/**
 * Kopf aller Reiter der Masterclass (PART-045): Inhalt, Bewerbungen,
 * Teilnehmende, Fragen — eigene Pfade wie bei Standbühne und Company Tour.
 * Ohne Session stehen statt der Reiter die beiden Leerzustände: „nichts
 * gebucht“ und „wir legen euch den Slot noch an“.
 */
export function MasterclassKopf({
  gebucht,
  sessions,
  word,
  t,
}: {
  gebucht: boolean;
  sessions: number;
  word: string;
  t: Record<string, string>;
}) {
  return (
    <>
      <PageHeader word={word} title={t.title} description={t.lead} />
      {sessions > 0 ? (
        <SectionTabs
          label={t.title}
          items={[
            { href: BASE, label: t.tabContent, exact: true },
            { href: `${BASE}/bewerbungen`, label: t.tabApplications },
            { href: `${BASE}/teilnehmende`, label: t.tabParticipants },
            { href: `${BASE}/fragen`, label: t.tabQuestions },
          ]}
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
