/**
 * Die Stand-Karte der Hackathon-Startseite (HACK-013, Vorschlag 10-04): ein Satz und höchstens eine Aktion, je
 * nach Stand der eigenen Teilnahme. Reine Rechnung auf `my_hack` — die Karte ändert nicht, was man tun kann, nur
 * was oben steht. Die Aktionen springen zu den Karten darunter (Anker).
 */
export type StandKey =
  | "open"
  | "applied"
  | "noTeam"
  | "noChallenge"
  | "build"
  | "submitted"
  | "declined"
  | "withdrawn";

export type Stand = { key: StandKey; anchor: string | null; deadline: string | null; late: boolean };

type Teilnahme = {
  application: { status: "applied" | "accepted" | "declined" | "withdrawn" } | null;
  team: { id: string } | null;
  challenge: { submission_deadline?: string | null } | null;
  submission: { late?: boolean } | null;
};

export function standKarte(d: Teilnahme): Stand {
  const deadline = d.challenge?.submission_deadline ?? null;
  const out = (key: StandKey, anchor: string | null, late = false): Stand => ({ key, anchor, deadline, late });
  if (!d.application) return out("open", "apply");
  switch (d.application.status) {
    case "applied":
      return out("applied", "application");
    case "declined":
      return out("declined", null);
    case "withdrawn":
      return out("withdrawn", null);
  }
  if (!d.team) return out("noTeam", "team");
  if (!d.challenge) return out("noChallenge", "challenge");
  if (d.submission) return out("submitted", "submit", Boolean(d.submission.late));
  return out("build", "submit");
}
