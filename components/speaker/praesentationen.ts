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
  /** Pfad im privaten Bucket `speaker-assets` — daraus signiert der Browser die Adresse zum Ansehen und Herunterladen (LEAD-060). */
  storage_path: string;
  filename: string;
  mime: string | null;
  version: number;
  is_current: boolean;
  late: boolean;
  tech_check_status: string;
  created_at: string;
};

/** Eine hochgeladene Fassung einer Präsentation — das, was sich ansehen und herunterladen lässt (LEAD-060). */
export type PraesentationsFassung = {
  id: string;
  filename: string;
  mime: string | null;
  storage_path: string;
  version: number;
  late: boolean;
  hochgeladen: string;
};

export type PraesentationsDatei = PraesentationsFassung & {
  status: string;
  /** Frühere Fassungen derselben Session, neueste zuerst — ohne die aktuelle (LEAD-060: „signierter Download je Fassung“). */
  fruehere: PraesentationsFassung[];
};

/**
 * Lässt sich die Fassung im Browser ansehen? Nur ein PDF (der Browser zeigt es im neuen Fenster); PowerPoint und Keynote gibt es nur zum Herunterladen.
 * Maßgeblich ist der Dateityp, hilfsweise die Endung — ein Upload ohne Typ (`mime` leer) bleibt ein PDF, wenn er so heißt.
 */
export function istPdf(f: { mime: string | null; filename: string }): boolean {
  return f.mime === "application/pdf" || (!f.mime && /\.pdf$/i.test(f.filename));
}

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
 * die **aktuelle** Präsentation an **dieser** Session — mit ihren **früheren
 * Fassungen** (LEAD-060), damit sich jede einzeln ansehen und herunterladen lässt.
 */
export function baueZeilen(
  slots: BoardZeile[],
  profile: { id: string; person_id: string }[],
  assets: AssetZeile[],
  locale: string,
): PraesentationsZeile[] {
  const profilVon = new Map(profile.map((p) => [p.person_id, p.id]));
  const dateiVon = new Map<string, AssetZeile>();
  // LEAD-060: alle Fassungen je Profil und Session — die aktuelle steht in `datei`, die übrigen als `fruehere`.
  const alleVon = new Map<string, AssetZeile[]>();
  for (const a of assets) {
    if (a.kind !== "presentation" || !a.session_id) continue;
    const key = `${a.profile_id}:${a.session_id}`;
    alleVon.set(key, [...(alleVon.get(key) ?? []), a]);
    if (!a.is_current) continue;
    const da = dateiVon.get(key);
    if (!da || a.version > da.version) dateiVon.set(key, a);
  }
  const fassung = (a: AssetZeile): PraesentationsFassung => ({
    id: a.id,
    filename: a.filename,
    mime: a.mime,
    storage_path: a.storage_path,
    version: a.version,
    late: a.late,
    hochgeladen: a.created_at,
  });
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
              ? {
                  ...fassung(a),
                  status: a.tech_check_status,
                  fruehere: (alleVon.get(`${profileId}:${sessionId}`) ?? [])
                    .filter((x) => x.id !== a.id)
                    .sort((x, y) => y.version - x.version)
                    .map(fassung),
                }
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

/** Soll und Ist einer Bühne (LEAD-058). */
export type BuehnenStand = {
  stage_id: string;
  stage_name: string;
  /** Sessions dieser Bühne in der Liste. */
  sessions: number;
  /** Soll: Speaker mit betreutem Profil — für sie lässt sich eine Präsentation hochladen. */
  soll: number;
  /** Ist: davon mit einer aktuellen Präsentation an dieser Session. */
  ist: number;
  /** Soll minus Ist — dieselbe Zahl, die `fehlende()` für die ganze Liste nennt. */
  fehlt: number;
  /** Speaker ohne betreutes Profil: sie stehen auf der Bühne, aber niemand kann für sie hochladen — sie zählen weder zu Soll noch zu Ist. */
  ohneProfil: number;
};

/**
 * Soll und Ist je Bühne (LEAD-058, Paulina 05.10.: „die Ansicht soll je Bühne transparent machen, was Soll ist und was Ist vorliegt“).
 *
 * Gerechnet wird über genau die Zeilen, die der Blick sehen darf — ein Stage Lead bekommt nur seine Bühnen (`baueZeilen` lässt nur bearbeitbare Slots durch),
 * das Team alle. Moderation steht nicht in den Zeilen und zählt nicht mit. Die Summe aller `fehlt` ist `fehlende(zeilen)`. Sortiert nach Bühnenname.
 */
export function standJeBuehne(zeilen: PraesentationsZeile[]): BuehnenStand[] {
  const nachBuehne = new Map<string, BuehnenStand>();
  for (const z of zeilen) {
    const b = nachBuehne.get(z.stage_id) ?? { stage_id: z.stage_id, stage_name: z.stage_name, sessions: 0, soll: 0, ist: 0, fehlt: 0, ohneProfil: 0 };
    b.sessions += 1;
    for (const s of z.speakers) {
      if (!s.profile_id) {
        b.ohneProfil += 1;
        continue;
      }
      b.soll += 1;
      if (s.datei) b.ist += 1;
      else b.fehlt += 1;
    }
    nachBuehne.set(z.stage_id, b);
  }
  return [...nachBuehne.values()].sort((a, b) => a.stage_name.localeCompare(b.stage_name, "de"));
}
