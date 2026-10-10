/**
 * „Wen sucht ihr?“ (K-94 Stufe 2a, PART-107): die Einträge einer Organisation und der Entwurf der Maske. Ohne React, damit die Tests es laden.
 *
 * Ein Eintrag sagt, **was** der Partner anbietet (Kategorie aus `career_opportunities`: Praktikum, Werkstudium, Abschlussarbeit, Trainee, Einstieg …), in **welchem Bereich**
 * (`function_area`), mit einem Freitext zur Rolle und — optional — für welche Skills und Studienfelder. Die Regeln stehen in der Datenbank (`set_org_hiring`); hier steht,
 * was die Maske schon vor dem Absenden prüft und wie sie die Einträge zeigt.
 */

/** Höchstens so viele Einträge je Organisation und Edition — wie `v_max` in `set_org_hiring` (`too_many_hiring`). */
export const HIRING_MAX = 10;

/** Höchstlänge des Freitexts zur Rolle — wie die Prüfung in der Datenbank (`invalid_hiring`, `detail` `role_text`). */
export const ROLLE_MAX = 120;

/**
 * Kategorien, die ein Partner **nicht** anbietet: „Ich bin aktuell nicht interessiert an Jobangeboten“ beschreibt eine Person, nicht das, was ein Partner bietet
 * (K-94 Stufe 1, dieselbe Sperre wie im Wunschprofil). Die Datenbank lehnt den Wert ab; die Maske blendet ihn aus.
 */
export const KATEGORIE_AUSGENOMMEN: readonly string[] = ["nicht-interessiert"];

/** Was die Maske an die Server-Aktion gibt — ein Eintrag, wie `set_org_hiring` ihn nimmt (`id` leer = neu). */
export type HiringSpeichern = {
  orgId: string;
  editionId: string;
  id: string | null;
  careerOpportunity: string;
  functionArea: string;
  roleText: string;
  skills: string[];
  studyFields: string[];
  published: boolean;
};

/** Antwort einer Server-Aktion — dieselbe Form wie `PartnerResult` und `AdminResult`. */
export type HiringErgebnis<T = void> = { ok: true; data: T } | { ok: false; key: string; detail?: string };

/** Eine Zeile aus `partner_org_hiring`. */
export type HiringEintrag = {
  id: string;
  career_opportunity: string;
  function_area: string;
  role_text: string | null;
  skills: string[];
  study_fields: string[];
  published: boolean;
  created_at: string;
  updated_at: string;
};

/** Was die Maske bearbeitet; `id` ist `null` für einen neuen Eintrag. */
export type HiringEntwurf = {
  id: string | null;
  career_opportunity: string;
  function_area: string;
  role_text: string;
  skills: string[];
  study_fields: string[];
  published: boolean;
};

export const leererEntwurf = (): HiringEntwurf => ({
  id: null,
  career_opportunity: "",
  function_area: "",
  role_text: "",
  skills: [],
  study_fields: [],
  published: false,
});

export const entwurfAus = (e: HiringEintrag): HiringEntwurf => ({
  id: e.id,
  career_opportunity: e.career_opportunity,
  function_area: e.function_area,
  role_text: e.role_text ?? "",
  skills: [...e.skills],
  study_fields: [...e.study_fields],
  published: e.published,
});

/** Was dem Entwurf noch fehlt, bevor er abgeschickt werden kann: Kategorie und Fachbereich sind Pflicht, die Rolle höchstens 120 Zeichen. */
export function entwurfFehlt(d: HiringEntwurf): ("career_opportunity" | "function_area" | "role_text")[] {
  const fehlt: ("career_opportunity" | "function_area" | "role_text")[] = [];
  if (d.career_opportunity.trim() === "") fehlt.push("career_opportunity");
  if (d.function_area.trim() === "") fehlt.push("function_area");
  if (d.role_text.trim().length > ROLLE_MAX) fehlt.push("role_text");
  return fehlt;
}

/** Die Auswahl der Kategorie: die Einträge des Vokabulars ohne die, die ein Partner nicht anbietet — in der Reihenfolge des Vokabulars. */
export function kategorieOptionen(labels: Record<string, string>): { value: string; label: string }[] {
  return Object.entries(labels)
    .filter(([key]) => !KATEGORIE_AUSGENOMMEN.includes(key))
    .map(([value, label]) => ({ value, label }));
}

type Beschriftungen = { career: Record<string, string>; area: Record<string, string> };

/** „Praktikum · Datenanalyse“ — Kategorie und Fachbereich in der Sprache der Seite; ein Schlüssel, den das Vokabular nicht kennt, steht als er selbst da. */
export function kategorieUndBereich(e: Pick<HiringEintrag, "career_opportunity" | "function_area">, l: Beschriftungen): string {
  return `${l.career[e.career_opportunity] ?? e.career_opportunity} · ${l.area[e.function_area] ?? e.function_area}`;
}

/** Die erste Zeile eines Eintrags in der Liste: der Freitext zur Rolle, sonst Kategorie und Fachbereich. */
export function eintragTitel(e: HiringEintrag, l: Beschriftungen): string {
  const rolle = e.role_text?.trim();
  return rolle ? rolle : kategorieUndBereich(e, l);
}

/**
 * Die zweite Zeile: Kategorie und Fachbereich (wenn die erste die Rolle nennt), dazu die Zahl der Skills und Studienfelder — „Praktikum · Datenanalyse · 2 Skills · 1 Studienfach“.
 * Ohne Rolle steht Kategorie und Fachbereich schon oben und wird nicht wiederholt.
 */
export function eintragUnterzeile(
  e: HiringEintrag,
  l: Beschriftungen,
  t: { skillOne: string; skillMany: string; fieldOne: string; fieldMany: string },
): string {
  const teile: string[] = [];
  if (e.role_text?.trim()) teile.push(kategorieUndBereich(e, l));
  const n = (zahl: number, eins: string, viele: string) => (zahl === 0 ? null : (zahl === 1 ? eins : viele).replace("{n}", String(zahl)));
  const skills = n(e.skills.length, t.skillOne, t.skillMany);
  const faecher = n(e.study_fields.length, t.fieldOne, t.fieldMany);
  if (skills) teile.push(skills);
  if (faecher) teile.push(faecher);
  return teile.join(" · ");
}

/** Die Auswahllisten einer Vokabulargruppe als Optionen (Schlüssel → Beschriftung), in der Reihenfolge des Vokabulars. */
export const alsOptionen = (labels: Record<string, string>): { value: string; label: string }[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** Alle vier Listen der Maske aus den Vokabulargruppen `career_opportunities`, `function_area`, `skill`, `study_field` (`vgroup`). */
export function hiringOptionen(gruppe: (name: string) => Record<string, string>) {
  return {
    career: kategorieOptionen(gruppe("career_opportunities")),
    area: alsOptionen(gruppe("function_area")),
    skill: alsOptionen(gruppe("skill")),
    study: alsOptionen(gruppe("study_field")),
  };
}
