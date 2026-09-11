import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { volunteerInvite, type VolunteerInviteStatus } from "@/lib/volunteers/rules";

type Strings = Record<string, string>;

/**
 * Einstieg in die Volunteer-Bewerbung aus dem Teilnehmerportal.
 *
 * Der Volunteer-Bereich taucht im Umschalter erst mit der Rolle auf — die gibt
 * es aber erst mit der Zusage. Ohne diesen Hinweis fände die Bewerbung von
 * innen niemand.
 */
export function VolunteerInvite({
  status,
  t,
}: {
  /** `null` = noch keine Bewerbung für die laufende Edition. */
  status: VolunteerInviteStatus;
  t: Strings;
}) {
  const invite = volunteerInvite(status);
  if (!invite) return null;

  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="ct-label text-ink">{t.inviteTitle}</h2>
        <p className="ct-help mt-1">{t[invite.bodyKey]}</p>
      </div>
      <Link href={invite.href} className="ct-link shrink-0">
        {t[invite.ctaKey]}
      </Link>
    </Card>
  );
}
