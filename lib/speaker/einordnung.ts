/**
 * Einordnung eines Speakers in der Pipeline (LEAD-039 Schnitt 1) — die Felder
 * aus Konrads Arbeitstabelle, gemeinsam für das Fenster der Speaker-Leads und
 * das Admin-Detail. Datenmodell: `docs/vorschlag-lead039-pipeline-felder.md`.
 *
 * Geschrieben wird über `update_speaker` (die sieben Schlüssel unten) und
 * `set_speaker_stage_candidates` (Bühnen in Frage); geprüft im Trigger
 * `speaker_profile_check`. Sichtbar für alle mit `can_manage_speaker` — nie für
 * den Speaker selbst, die Assistenz oder Partner.
 */

/** Die Schlüssel, die `update_speaker` für die Einordnung annimmt. */
export const EINORDNUNG_FELDER = [
  "category",
  "topic_cluster",
  "topic_role",
  "priority",
  "recommended_format",
  "contact_via",
  "outreach_channel",
] as const;
export type EinordnungFeld = (typeof EINORDNUNG_FELDER)[number];

/** Vokabular je Auswahlfeld — dasselbe prüft `speaker_profile_check`. */
export const EINORDNUNG_VOKABULAR = {
  category: "speaker_category",
  topic_cluster: "topic_cluster",
  priority: "speaker_priority",
  recommended_format: "session_format",
  outreach_channel: "outreach_channel",
} as const satisfies Partial<Record<EinordnungFeld, string>>;

/** Längen wie im Trigger (`text_too_long`). */
export const MAX_THEMA = 300;
export const MAX_KONTAKT_VIA = 200;

export type BuehneInFrage = { stage_id: string; name: string };

/** Was `manager_speakers` und `speaker_detail` zur Einordnung liefern. */
export type Einordnung = Record<EinordnungFeld, string | null> & {
  stage_candidates: BuehneInFrage[] | null;
};

/** Formularstand: leere Zeichenkette statt `null`, Bühnen als Liste von IDs. */
export type EinordnungEntwurf = Record<EinordnungFeld, string> & { stage_ids: string[] };

export function einordnungEntwurf(e: Partial<Einordnung>): EinordnungEntwurf {
  const feld = (k: EinordnungFeld) => e[k] ?? "";
  return {
    category: feld("category"),
    topic_cluster: feld("topic_cluster"),
    topic_role: feld("topic_role"),
    priority: feld("priority"),
    recommended_format: feld("recommended_format"),
    contact_via: feld("contact_via"),
    outreach_channel: feld("outreach_channel"),
    stage_ids: (e.stage_candidates ?? []).map((b) => b.stage_id),
  };
}

/**
 * Nur, was sich geändert hat — `update_speaker` setzt jeden mitgeschickten
 * Schlüssel, ein leerer Wert leert das Feld. Unveränderte Felder bleiben weg,
 * damit ein stillgelegter Begriff nicht erneut geprüft wird.
 */
export function einordnungAenderungen(
  vorher: EinordnungEntwurf,
  jetzt: EinordnungEntwurf,
): Partial<Record<EinordnungFeld, string>> {
  const out: Partial<Record<EinordnungFeld, string>> = {};
  for (const k of EINORDNUNG_FELDER) {
    if (jetzt[k].trim() !== vorher[k].trim()) out[k] = jetzt[k].trim();
  }
  return out;
}

export function buehnenGeaendert(vorher: EinordnungEntwurf, jetzt: EinordnungEntwurf): boolean {
  const a = [...vorher.stage_ids].sort();
  const b = [...jetzt.stage_ids].sort();
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

/** Dieselbe Regel wie im Trigger: im Feld „Kontakt via“ steht der Weg, keine Adresse. */
export function kontaktViaHatAdresse(wert: string): boolean {
  return wert.includes("@");
}
