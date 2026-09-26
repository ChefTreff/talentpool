/**
 * Verantwortung je Session (ADM-018) — eine Zeile aus `session_responsibles`.
 *
 * Konrad 25.09.: aus den Stage Leads ableiten, aber je Session übersteuerbar
 * (zwei Leads je Bühne, die sich Tage teilen). Die Ableitung macht die
 * Datenbank (engste Stufe gewinnt: Slot, Bühnentag, Bühne); hier steht nur,
 * was die Tabelle daraus anzeigt. Ohne server-only, damit `npm test` es prüft.
 */
export type SessionVerantwortung = {
  session_id: string;
  owner_person_id: string | null;
  owner_name: string | null;
  derived_person_ids: string[];
  derived_names: (string | null)[];
};

export type OwnerCandidate = { person_id: string; name: string | null };

/** Die abgeleiteten Namen, so wie sie in der Zeile stehen — leer, wenn es keine Stage Leads gibt. */
export function abgeleiteteNamen(v: SessionVerantwortung | undefined): string {
  return (v?.derived_names ?? []).filter((n): n is string => Boolean(n)).join(", ");
}

/** Was die Zeile zeigt: die Übersteuerung vor der Ableitung; `null`, wenn niemand verantwortlich ist. */
export function verantwortlich(v: SessionVerantwortung | undefined): { namen: string; uebersteuert: boolean } | null {
  if (!v) return null;
  if (v.owner_person_id) return { namen: v.owner_name ?? "—", uebersteuert: true };
  const namen = abgeleiteteNamen(v);
  return namen ? { namen, uebersteuert: false } : null;
}

/**
 * Auswahl für die Übersteuerung: die Stage Leads der Veranstaltung — und die
 * gesetzte Person, auch wenn ihre Rolle inzwischen abgelaufen ist, damit die
 * Auswahl nicht still auf „abgeleitet“ springt.
 */
export function ownerOptionen(v: SessionVerantwortung | undefined, kandidaten: OwnerCandidate[]): { value: string; label: string }[] {
  const optionen = kandidaten.map((k) => ({ value: k.person_id, label: k.name ?? "—" }));
  if (v?.owner_person_id && !kandidaten.some((k) => k.person_id === v.owner_person_id)) {
    optionen.push({ value: v.owner_person_id, label: v.owner_name ?? "—" });
  }
  return optionen;
}
