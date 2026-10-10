/**
 * Gesuchte Profile (PART-046, PART-048): dieselben Vokabulare wie im
 * Teilnehmerprofil. Reine Typen und Hilfen ohne JSX — die Tests laufen mit
 * `--experimental-strip-types` und laden keine `.tsx`-Dateien.
 */

/**
 * Die Felder des Wunschprofils (K-94, Matching Stufe 1): Status, Studienfeld, **Skills, Fachbereich und Kategorie** — der gemeinsame Kern, den Partner und
 * Teilnehmende mit demselben Vokabular beschreiben. Jeder Schlüssel heißt wie seine Vokabulargruppe (`vocab_term.vocabulary`); die Reihenfolge ist die der
 * Fragen auf der Seite. `career_level` (Berufserfahrung) ist Selbstauskunft am Teilnehmerprofil und zählt nicht fürs Matching.
 */
export const PROFIL_FELDER = ["occupation_status", "study_field", "skill", "function_area", "career_opportunities"] as const;
export type ProfilFeld = (typeof PROFIL_FELDER)[number];
export type ProfilOption = { key: string; label: string };
/** `target_profile`, wie es `partner_update_tour_stop` und die Interview Tables speichern. */
export type Zielprofil = Partial<Record<ProfilFeld, string[]>>;

/**
 * Einträge eines Vokabulars, die ein **Wunschprofil nicht anbietet**: „Ich bin aktuell nicht interessiert an Jobangeboten“ (`career_opportunities`) beschreibt
 * eine Person, nicht das, was ein Partner bietet. Die Datenbank lehnt ihn ab (`check_format_details`, `partner_update_tour_stop`: `invalid_vocab`), die
 * Oberfläche blendet ihn aus.
 */
export const PROFIL_AUSGENOMMEN: Partial<Record<ProfilFeld, readonly string[]>> = { career_opportunities: ["nicht-interessiert"] };

/**
 * Die Auswahllisten aller Felder aus den Vokabulargruppen: je Feld die Einträge als `{ key, label }` in der Reihenfolge der Gruppe, ohne die Ausnahmen
 * (`PROFIL_AUSGENOMMEN`). `gruppe(name)` liefert die Beschriftungen einer Gruppe (`vgroup(vocab, name)`), der Name ist der des Feldes.
 */
export function profilFelderAus(gruppe: (vokabular: string) => Record<string, string>): Record<ProfilFeld, ProfilOption[]> {
  return Object.fromEntries(
    PROFIL_FELDER.map((feld) => [
      feld,
      Object.entries(gruppe(feld))
        .filter(([key]) => !(PROFIL_AUSGENOMMEN[feld] ?? []).includes(key))
        .map(([key, label]) => ({ key, label })),
    ]),
  ) as Record<ProfilFeld, ProfilOption[]>;
}

/**
 * Welche Schlüssel unterscheiden zwei Listen (dazugekommen oder weggefallen)?
 *
 * Die aufklappbare Auswahl meldet ihre **ganze neue Liste** (PART-128), die Seiten wollen weiter hören, welcher Eintrag
 * umgeschaltet wurde (`profilUmschalten`). Mit dem Baustein ändert sich bei jedem Klick genau ein Schlüssel; die
 * Reihenfolge der beiden Listen spielt keine Rolle.
 */
export function geaenderteSchluessel(alt: string[], neu: string[]): string[] {
  return [...neu.filter((k) => !alt.includes(k)), ...alt.filter((k) => !neu.includes(k))];
}

/** Einen Eintrag an- oder abwählen; leere Felder fallen weg, damit nichts Leeres gespeichert wird. */
export function profilUmschalten(profil: Zielprofil, feld: ProfilFeld, key: string): Zielprofil {
  const jetzt = profil[feld] ?? [];
  const neu = jetzt.includes(key) ? jetzt.filter((k) => k !== key) : [...jetzt, key];
  const ergebnis: Zielprofil = { ...profil, [feld]: neu };
  if (neu.length === 0) delete ergebnis[feld];
  return ergebnis;
}
