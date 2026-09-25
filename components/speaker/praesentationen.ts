/**
 * Präsentationen je Slot (LEAD-023) — reine Zusammensetzung, ohne server-only,
 * damit `npm test` sie prüft. Die Daten holt `lib/speaker/praesentationen.ts`:
 * Slots aus `programme_board` (nur `can_edit`), Profile aus `speaker_profile`
 * (RLS: betreut), Dateien aus `my_speaker_assets`.
 */

/** Eine Zeile aus `programme_board`, soweit die Liste sie braucht. */
export type BoardZeile = {
  slot_id: string;
  session_id: string | null;
  stage_id: string;
  stage_name: string;
  start_at: string;
  end_at: string;
  title_de: string | null;
  title_en: string | null;
  can_edit: boolean;
  speakers: { person_id: string; role: string | null; first_name: string | null; last_name: string | null }[] | null;
};

export type AssetZeile = {
  id: string;
  profile_id: string;
  session_id: string | null;
  kind: string;
  filename: string;
  version: number;
  is_current: boolean;
  late: boolean;
  tech_check_status: string;
  created_at: string;
};

export type PraesentationsDatei = {
  filename: string;
  version: number;
  late: boolean;
  status: string;
  hochgeladen: string;
};

export type PraesentationsSpeaker = {
  person_id: string;
  /** `null`: kein betreutes Profil in dieser Edition — dann kein Upload. */
  profile_id: string | null;
  name: string;
  datei: PraesentationsDatei | null;
};

export type PraesentationsZeile = {
  slot_id: string;
  session_id: string;
  stage_id: string;
  stage_name: string;
  start_at: string;
  end_at: string;
  titel: string;
  speakers: PraesentationsSpeaker[];
};

/**
 * Nur Sessions, die der Blick bearbeiten darf (eigene Bühnen, Tage, Slots;
 * das Team alle). Moderation präsentiert nicht und zählt nicht mit. Je Speaker
 * die **aktuelle** Präsentation an **dieser** Session.
 */
export function baueZeilen(
  slots: BoardZeile[],
  profile: { id: string; person_id: string }[],
  assets: AssetZeile[],
  locale: string,
): PraesentationsZeile[] {
  const profilVon = new Map(profile.map((p) => [p.person_id, p.id]));
  const dateiVon = new Map<string, AssetZeile>();
  for (const a of assets) {
    if (a.kind !== "presentation" || !a.is_current || !a.session_id) continue;
    const key = `${a.profile_id}:${a.session_id}`;
    const da = dateiVon.get(key);
    if (!da || a.version > da.version) dateiVon.set(key, a);
  }
  return slots
    .filter((s) => s.can_edit && s.session_id)
    .map((s) => {
      const sessionId = s.session_id as string;
      const speakers = (s.speakers ?? [])
        .filter((sp) => sp.role !== "moderator")
        .map((sp) => {
          const profileId = profilVon.get(sp.person_id) ?? null;
          const a = profileId ? dateiVon.get(`${profileId}:${sessionId}`) : undefined;
          return {
            person_id: sp.person_id,
            profile_id: profileId,
            name: [sp.first_name, sp.last_name].filter(Boolean).join(" ") || "—",
            datei: a
              ? { filename: a.filename, version: a.version, late: a.late, status: a.tech_check_status, hochgeladen: a.created_at }
              : null,
          };
        });
      return {
        slot_id: s.slot_id,
        session_id: sessionId,
        stage_id: s.stage_id,
        stage_name: s.stage_name,
        start_at: s.start_at,
        end_at: s.end_at,
        titel: (locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? s.title_en ?? "—",
        speakers,
      };
    });
}

/** Wie viele Speaker noch keine Präsentation haben — für Kopf und Filter. */
export function fehlende(zeilen: PraesentationsZeile[]): number {
  return zeilen.reduce((n, z) => n + z.speakers.filter((s) => s.profile_id && !s.datei).length, 0);
}
