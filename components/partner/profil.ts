/**
 * Gesuchte Profile (PART-046, PART-048): dieselben Vokabulare wie im
 * Teilnehmerprofil. Reine Typen und Hilfen ohne JSX — die Tests laufen mit
 * `--experimental-strip-types` und laden keine `.tsx`-Dateien.
 */

/** Die Auswahlfelder des Teilnehmerprofils, nach denen ein Partner sucht. */
export const PROFIL_FELDER = ["occupation_status", "career_level", "study_field"] as const;
export type ProfilFeld = (typeof PROFIL_FELDER)[number];
export type ProfilOption = { key: string; label: string };
/** `target_profile`, wie es `partner_update_tour_stop` und die Interview Tables speichern. */
export type Zielprofil = Partial<Record<ProfilFeld, string[]>>;

/** Einen Eintrag an- oder abwählen; leere Felder fallen weg, damit nichts Leeres gespeichert wird. */
export function profilUmschalten(profil: Zielprofil, feld: ProfilFeld, key: string): Zielprofil {
  const jetzt = profil[feld] ?? [];
  const neu = jetzt.includes(key) ? jetzt.filter((k) => k !== key) : [...jetzt, key];
  const ergebnis: Zielprofil = { ...profil, [feld]: neu };
  if (neu.length === 0) delete ergebnis[feld];
  return ergebnis;
}
