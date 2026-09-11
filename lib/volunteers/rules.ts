/**
 * Regeln des Volunteer-Bereichs, die Client und Test teilen.
 *
 * Dieselbe Rechnung läuft zweimal: hier im Browser, damit niemand das
 * Formular umsonst ausfüllt, und noch einmal in `apply_volunteer`
 * (P0001 `too_young`). Verlassen kann man sich nur auf die RPC.
 */

/**
 * Mindestalter 18 **am ersten Eventtag** (Entscheidung E1) — nicht heute.
 * Wer heute 17 ist und im März 18 wird, darf sich bewerben; wer am Summit
 * noch 17 ist, nicht.
 *
 * Ohne bekanntes Datum der Edition zählt der heutige Tag: dann ist die
 * Prüfung strenger als die Datenbank, nie lockerer.
 */
export function isTooYoung(birthdate: string, firstDay: string | null): boolean {
  if (!birthdate) return false;
  const born = new Date(birthdate);
  if (Number.isNaN(born.getTime())) return false;
  const reference = firstDay ? new Date(firstDay) : new Date();
  if (Number.isNaN(reference.getTime())) return false;
  const limit = new Date(reference);
  limit.setFullYear(limit.getFullYear() - 18);
  return born > limit;
}

/** Stand einer Volunteer-Bewerbung, wie ihn `my_volunteer_profile()` liefert. */
export type VolunteerInviteStatus = "applied" | "accepted" | "declined" | "withdrawn" | null;

export type VolunteerInvite = {
  href: string;
  /** Schlüssel im Wörterbuch-Block `volunteers`. */
  bodyKey: "inviteBody" | "inviteApplied" | "inviteAccepted";
  ctaKey: "inviteCta" | "inviteCtaOpen" | "inviteCtaShifts";
};

/**
 * Was im Teilnehmerportal zur Volunteer-Bewerbung stehen soll — `null` heißt
 * „nichts zeigen".
 *
 * Nach einer Absage oder einem Rückzug fassen wir nicht nach: der Weg über
 * `/volunteers` bleibt offen, aber ein Aufruf im eigenen Portal wäre an der
 * Stelle aufdringlich.
 */
export function volunteerInvite(status: VolunteerInviteStatus): VolunteerInvite | null {
  if (status === "declined" || status === "withdrawn") return null;
  if (status === "accepted") {
    return { href: "/volunteers/schichten", bodyKey: "inviteAccepted", ctaKey: "inviteCtaShifts" };
  }
  if (status === "applied") {
    return { href: "/volunteers", bodyKey: "inviteApplied", ctaKey: "inviteCtaOpen" };
  }
  return { href: "/volunteers", bodyKey: "inviteBody", ctaKey: "inviteCta" };
}
