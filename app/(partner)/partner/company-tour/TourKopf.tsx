import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TourTabs } from "./TourTabs";

/**
 * Kopf aller drei Reiter. Ohne Stopp stehen statt der Reiter die beiden
 * Leerzustände — „nichts gebucht“ und „wir ordnen euch noch zu“ sind zwei
 * verschiedene Nachrichten, und nur bei der ersten kann der Partner selbst
 * etwas tun (wie beim Side-Event).
 */
export function TourKopf({
  gebucht,
  stopps,
  word,
  t,
}: {
  gebucht: boolean;
  stopps: number;
  word: string;
  t: Record<string, string>;
}) {
  return (
    <>
      <PageHeader word={word} title={t.title} description={t.lead} />
      {stopps > 0 ? (
        <TourTabs t={{ label: t.title, stop: t.tabStop, applications: t.tabApplications, participants: t.tabParticipants }} />
      ) : gebucht ? (
        <EmptyState title={t.noStopTitle} description={t.noStopBody} />
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
