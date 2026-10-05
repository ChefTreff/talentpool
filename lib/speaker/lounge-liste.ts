/**
 * Die Lounge-Liste fürs Personal (ADM-076): alle Personen mit Lounge-Berechtigung — Speaker mit eigenem Ticket und
 * Begleitungen mit Lounge —, eine Zeile je Person. Reine Funktionen, damit Auswahl und Spalten ohne Datenbank und
 * ohne Route prüfbar sind (`tests/adm-076-tickets.test.ts`).
 *
 * **Datenminimierung** (Plan 05.10.): Name, Art, Speaker, Stand, Pass — **keine E-Mail**, keine Telefonnummer, kein
 * Barcode. Das Personal an der Lounge-Tür braucht zu wissen, wer hinein darf, nicht wie man die Person erreicht.
 *
 * Die Quelle ist `speaker_tickets_admin` (Team-Tor in der Datenbank); gezählt wird, was **lebt**: beantragt,
 * freigegeben oder ausgestellt. Stornierte Tickets stehen nie drin. Noch nicht ausgestellte stehen mit ihrem Stand
 * drin — vor dem Event ist die Liste die Planung, am Event hat jede Zeile `ausgestellt`.
 */
export type LoungeQuelle = {
  source: string;
  status: string;
  lounge_access: boolean;
  speaker_name: string | null;
  holder_first_name: string | null;
  holder_last_name: string | null;
  pass_type: string | null;
};

export type LoungeZeile = {
  name: string;
  art: "Speaker" | "Begleitung";
  /** Bei einer Begleitung der Speaker, zu dem sie gehört; beim Speaker er selbst. */
  speaker: string;
  stand: string;
  pass: string;
};

const LEBENDIG = ["requested", "approved", "valid"] as const;

/** Der Stand in Worten für die Liste — die Tür liest „ausgestellt“, nicht `valid`. */
const STAND: Record<string, string> = {
  requested: "beantragt",
  approved: "freigegeben",
  valid: "ausgestellt",
};

const sortiere = (a: string, b: string) => a.localeCompare(b, "de", { sensitivity: "base" });

export function loungeBerechtigte(tickets: readonly LoungeQuelle[]): LoungeZeile[] {
  const zeilen: LoungeZeile[] = [];
  for (const t of tickets) {
    if (t.source !== "speaker" && t.source !== "speaker_companion") continue;
    if (!t.lounge_access) continue;
    if (!(LEBENDIG as readonly string[]).includes(t.status)) continue;
    const halter = [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ").trim();
    const speaker = t.speaker_name?.trim() || "—";
    zeilen.push({
      name: halter || speaker,
      art: t.source === "speaker" ? "Speaker" : "Begleitung",
      speaker,
      stand: STAND[t.status] ?? t.status,
      pass: t.pass_type ?? "",
    });
  }
  // Nach Speaker, dann er selbst vor seiner Begleitung, dann nach Namen — wer die Liste liest, sucht den Speaker.
  return zeilen.sort(
    (a, b) => sortiere(a.speaker, b.speaker) || (a.art === b.art ? 0 : a.art === "Speaker" ? -1 : 1) || sortiere(a.name, b.name),
  );
}

export const LOUNGE_SPALTEN: { label: string; wert: (z: LoungeZeile) => string }[] = [
  { label: "Name", wert: (z) => z.name },
  { label: "Art", wert: (z) => z.art },
  { label: "Speaker", wert: (z) => z.speaker },
  { label: "Ticket", wert: (z) => z.stand },
  { label: "Pass", wert: (z) => z.pass },
];
