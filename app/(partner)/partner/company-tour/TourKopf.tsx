import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { InstanzWahl } from "@/components/layout/InstanzWahl";
import { instanzSuffix, type InstanzLeiste } from "@/lib/partner/instanz";
import { TourTabs } from "./TourTabs";

/**
 * Kopf aller drei Reiter. Ohne Stopp stehen statt der Reiter die beiden
 * Leerzustände — „nichts gebucht“ und „wir ordnen euch noch zu“ sind zwei
 * verschiedene Nachrichten, und nur bei der ersten kann der Partner selbst
 * etwas tun (wie beim Side-Event).
 *
 * **Ab zwei Stopps (QS-079)** steht darüber der Umschalter: ein Reiter je Stopp („Stopp 1 · Tour A“), der gewählte im `?instanz=` der Adresse. Er steht
 * **über** den drei Sichten und gibt seine Wahl an jede weiter.
 */
export function TourKopf({
  gebucht,
  stopps,
  instanzen,
  word,
  t,
}: {
  gebucht: boolean;
  stopps: number;
  /** Der Umschalter; `null` bei einem Stopp (die Seite ist dann wie vorher). */
  instanzen: InstanzLeiste | null;
  word: string;
  t: Record<string, string>;
}) {
  return (
    <>
      <PageHeader word={word} title={t.title} description={t.lead} />
      {stopps > 0 ? (
        <>
          <InstanzWahl leiste={instanzen} label={t.instanceLabel} />
          <TourTabs
            suffix={instanzSuffix(instanzen)}
            t={{ label: t.title, stop: t.tabStop, applications: t.tabApplications, participants: t.tabParticipants }}
          />
        </>
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
