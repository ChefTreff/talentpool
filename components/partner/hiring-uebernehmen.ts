import { kategorieUndBereich, type HiringEintrag } from "@/components/partner/hiring";
import type { ProfilFeld, Zielprofil } from "@/components/partner/profil";

/**
 * „Aus ‚Wen sucht ihr?‘ übernehmen“ (K-94 Stufe 2b, PART-140; Plan 10.10.2026: **Vorbelegung statt Verweis**). Ein Eintrag der Organisation füllt das Wunschprofil eines
 * Formats (Masterclass, Stopp der Company Tour, Interview Table) vor. Kein Fremdschlüssel vom Format auf `org_hiring`: das Format behält sein eigenes `target_profile`, überschreibt
 * frei und ändert sich nicht mit, wenn der Eintrag später geändert wird. Gespeichert wird erst mit „Speichern“ des Formats. Ohne React, damit die Tests es laden.
 */

/** Die Felder des Wunschprofils, die ein Eintrag mitbringt — `occupation_status` (Status der Zielgruppe) gehört dem Format. */
export const HIRING_PROFIL_FELDER: readonly ProfilFeld[] = ["career_opportunities", "function_area", "skill", "study_field"];

type EintragsWerte = Pick<HiringEintrag, "career_opportunity" | "function_area" | "skills" | "study_fields">;

/**
 * Das Wunschprofil, das ein Eintrag beschreibt: Kategorie und Fachbereich als je ein Schlüssel, Skills und Studienfelder als Listen. Leere Felder fehlen
 * (das Format speichert nichts Leeres; „offen für alle“ heißt kein Schlüssel). Eine Kopie — die Listen des Eintrags werden nie geteilt.
 */
export function profilAusEintrag(e: EintragsWerte): Zielprofil {
  const profil: Zielprofil = {};
  if (e.career_opportunity.trim() !== "") profil.career_opportunities = [e.career_opportunity];
  if (e.function_area.trim() !== "") profil.function_area = [e.function_area];
  if (e.skills.length > 0) profil.skill = [...e.skills];
  if (e.study_fields.length > 0) profil.study_field = [...e.study_fields];
  return profil;
}

/**
 * Das Profil des Formats nach „Übernehmen“: die **vier Felder des Eintrags ersetzen** die des Formats — auch dort, wo der Eintrag nichts hat (ein Eintrag ohne Skills ist
 * „offen für alle Skills“, nicht „behalte, was da stand“); `occupation_status` bleibt, wie es war. Die Eingabe wird nicht verändert.
 */
export function profilMitEintrag(profil: Zielprofil, e: EintragsWerte): Zielprofil {
  const rest: Zielprofil = { ...profil };
  for (const feld of HIRING_PROFIL_FELDER) delete rest[feld];
  return { ...rest, ...profilAusEintrag(e) };
}

/** Haben zwei Profile dieselben Schlüssel in jedem Feld (Reihenfolge und leere Felder egal)? Für „geändert?“ und „schon übernommen?“. */
export function profilGleich(a: Zielprofil, b: Zielprofil): boolean {
  const felder = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<ProfilFeld>;
  for (const feld of felder) {
    const x = [...new Set(a[feld] ?? [])].sort();
    const y = [...new Set(b[feld] ?? [])].sort();
    if (x.length !== y.length || x.some((k, i) => k !== y[i])) return false;
  }
  return true;
}

/** `true`, wenn das Profil kein einziges Feld mit Schlüsseln hat („offen für alle“). */
export const profilLeer = (profil: Zielprofil): boolean => Object.values(profil).every((liste) => (liste ?? []).length === 0);

/**
 * Die Details einer Session mit neuem Wunschprofil: alle anderen Angaben bleiben (`goodies_planned`, `image_asset_id`, `job_title` …), denn `partner_update_session` ersetzt
 * `format_details` als Ganzes; ein leeres Profil nimmt den Schlüssel `target_profile` heraus statt `{}` zu speichern.
 */
export function detailsMitProfil(details: Record<string, unknown> | null | undefined, profil: Zielprofil): Record<string, unknown> {
  const neu: Record<string, unknown> = { ...(details ?? {}) };
  delete neu.target_profile;
  if (!profilLeer(profil)) {
    neu.target_profile = Object.fromEntries(Object.entries(profil).filter(([, liste]) => (liste ?? []).length > 0).map(([feld, liste]) => [feld, [...(liste as string[])]]));
  }
  return neu;
}

/** Das gespeicherte Wunschprofil aus den Details einer Session (jedes Feld eine Liste von Texten; alles andere wird ignoriert). */
export function profilAusDetails(details: Record<string, unknown> | null | undefined): Zielprofil {
  const roh = details?.target_profile;
  if (typeof roh !== "object" || roh === null || Array.isArray(roh)) return {};
  const profil: Zielprofil = {};
  for (const [feld, liste] of Object.entries(roh as Record<string, unknown>)) {
    if (Array.isArray(liste)) {
      const schluessel = liste.filter((k): k is string => typeof k === "string");
      if (schluessel.length > 0) profil[feld as ProfilFeld] = schluessel;
    }
  }
  return profil;
}

type Beschriftungen = { career: Record<string, string>; area: Record<string, string> };

/**
 * Die Auswahl der Einträge: die Rolle, wo es eine gibt, mit Kategorie und Bereich dahinter („Werkstudent Data Engineering — Werkstudium · Data & AI“), sonst nur
 * Kategorie und Bereich. So sind zwei Einträge mit gleicher Rolle in verschiedenen Bereichen unterscheidbar. Die Reihenfolge ist die der Anlage.
 */
export function eintragOptionen(eintraege: readonly HiringEintrag[], l: Beschriftungen): { value: string; label: string }[] {
  return eintraege.map((e) => {
    const rolle = e.role_text?.trim();
    const kb = kategorieUndBereich(e, l);
    return { value: e.id, label: rolle ? `${rolle} — ${kb}` : kb };
  });
}
