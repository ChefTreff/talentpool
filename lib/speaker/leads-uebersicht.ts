/**
 * Die Übersicht der Speaker-Leads im Admin (`/admin/speaker-leads`, ADM-068) — reine Zusammensetzung, ohne Netz und ohne `server-only`, damit `npm test` sie
 * ausführt. Die Daten kommen aus Funktionen, die es schon gibt: `speaker_leads_admin` (Personen und ihre Rollen), `manager_speakers` (alle Speaker der Edition mit
 * `owner_person_id`) und die Sicht `programme_board` (Slots und Sessions je Bühne).
 *
 * Konrad am 05.10. beim Durchgang: „unter Speaker Leads kannst du … wer macht das und wen betreuen sie … die Mainstage wird von Konrad verwaltet … die Übersichtsseite
 * ein wenig zu optimieren, das ist teilweise noch etwas unklar“. Zwei Fragen, die die Seite getrennt beantworten soll: **wer leitet welche Bühne** (`buehnenUebersicht`)
 * und **wen betreut wer** (`betreuteJeLead`).
 */

export type LeadRolle = { id: string; role: string; scope_type: string; scope_id: string | null };
export type LeadKopf = { person_id: string; display_name: string | null; email: string | null; assignments: LeadRolle[] };

/** Eine Zeile aus `programme_board`, soweit die Übersicht sie braucht. */
export type BoardZeile = {
  stage_id: string;
  session_id: string | null;
  speakers: { person_id: string; role?: string | null }[] | null;
};

export type BuehnenZeile = {
  stage_id: string;
  name: string;
  /** Wer die Bühne als Stage Lead leitet (Rolle `speaker_manager` mit der Bühne als Bereich). */
  leads: { person_id: string; name: string }[];
  /** Sessions auf der Bühne. */
  sessions: number;
  /** Verschiedene Speaker auf diesen Sessions — Moderation zählt nicht mit. */
  speakers: number;
};

/**
 * Je Bühne: wer sie leitet, wie viele Sessions und wie viele Speaker dort liegen. Die Reihenfolge der Bühnen bleibt, wie sie kommt (die Seite sortiert nach
 * `sort_order`); eine Bühne ohne Stage Lead steht mit leerer Liste da — das ist die Zeile, auf die es ankommt.
 *
 * Nur Rollen mit der **Bühne** als Bereich zählen: wer nur für einen Tag oder einen Slot zuständig ist (`stage_day`, `slot`), steht in der Personentabelle, nicht
 * als Leitung der ganzen Bühne.
 */
export function buehnenUebersicht(
  buehnen: { id: string; name: string }[],
  leads: LeadKopf[],
  board: BoardZeile[],
  keinName: string,
): BuehnenZeile[] {
  return buehnen.map((b) => {
    const sessions = new Set<string>();
    const speakers = new Set<string>();
    for (const z of board) {
      if (z.stage_id !== b.id || !z.session_id) continue;
      sessions.add(z.session_id);
      for (const s of z.speakers ?? []) if (s.role !== "moderator") speakers.add(s.person_id);
    }
    const stageLeads = leads
      .filter((l) => l.assignments.some((a) => a.role === "speaker_manager" && a.scope_type === "stage" && a.scope_id === b.id))
      .map((l) => ({ person_id: l.person_id, name: l.display_name ?? l.email ?? keinName }))
      .sort((x, y) => x.name.localeCompare(y.name, "de"));
    return { stage_id: b.id, name: b.name, leads: stageLeads, sessions: sessions.size, speakers: speakers.size };
  });
}

/** Eine Zeile aus `manager_speakers`, soweit die Übersicht sie braucht. */
export type SpeakerZeile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  owner_person_id: string | null;
  pipeline_status: string;
  confirmed_at: string | null;
  declined_at: string | null;
  /** Die offenen Schritte (`speaker_next_steps(...)->'open'`), eine Liste. */
  next_open: unknown[] | null;
  stage_guest: boolean;
};

export type Betreuter = {
  profile_id: string;
  name: string;
  pipeline_status: string;
  zugesagt: boolean;
  abgesagt: boolean;
  offen: number;
};

/**
 * Je Lead-Person die Speaker, die ihr zugeordnet sind (`owner_person_id`) — nach Nachname und Vorname. Gäste der Partner zählen nicht (SPK-070, wie in
 * `speaker_leads_admin`, deren Zahl „Betreut“ diese Liste auflöst). Speaker ohne Betreuung stehen hier nicht, sie stehen unter „Ohne Betreuung“.
 */
export function betreuteJeLead(speakers: SpeakerZeile[], keinName: string): Record<string, Betreuter[]> {
  const aus: Record<string, Betreuter[]> = {};
  const sortiert = [...speakers].sort(
    (a, b) =>
      (a.last_name ?? "").localeCompare(b.last_name ?? "", "de") || (a.first_name ?? "").localeCompare(b.first_name ?? "", "de"),
  );
  for (const s of sortiert) {
    if (!s.owner_person_id || s.stage_guest) continue;
    (aus[s.owner_person_id] ??= []).push({
      profile_id: s.id,
      name: [s.first_name, s.last_name].filter(Boolean).join(" ") || keinName,
      pipeline_status: s.pipeline_status,
      zugesagt: s.confirmed_at !== null && s.declined_at === null,
      abgesagt: s.declined_at !== null,
      offen: Array.isArray(s.next_open) ? s.next_open.length : 0,
    });
  }
  return aus;
}
