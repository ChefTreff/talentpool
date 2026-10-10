import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Reine Teile der Bewerbungsanzeige (ADM-003) — ohne React, damit die Tests sie
 * laden. Genutzt von `ApplicantList` (Partner-Portal), `BewerbungDetails` und
 * der Bewerbungsliste im Admin.
 */

/** Farbe des Status-Badges — der Wortlaut kommt aus dem Vokabular `application_status`. */
export const BEWERBUNG_STATUS_TON: Record<string, BadgeTone> = {
  applied: "neutral",
  shortlisted: "accent",
  accepted: "success",
  promoted: "success",
  confirmed: "success",
  attended: "success",
  waitlisted: "warning",
  declined: "error",
  expired: "neutral",
  no_show: "error",
  withdrawn: "neutral",
};

/** Profilfelder in fester Reihenfolge — was leer ist, fällt weg. */
export const BEWERBUNG_PROFILFELDER = [
  "occupation_status",
  "career_level",
  "employer_name",
  "university",
  "study_field",
  "city",
] as const;

/**
 * Profilfelder, deren Wert ein Schlüssel aus dem Vokabular ist (`vocab_term`), nicht der Text, den die
 * Person sieht: „master“ statt „Master-Student“. Die Seiten laden je Vokabular die Beschriftungen
 * (`vgroup`) und reichen sie als `ProfilWerte` herein; ohne Beschriftung steht der Schlüssel da.
 */
export const PROFIL_VOKABULARE = ["occupation_status", "career_level", "study_field"] as const;

/** Beschriftungen je Profilfeld: `{ occupation_status: { master: "Master-Student" } }`. */
export type ProfilWerte = Partial<Record<string, Record<string, string>>>;

/**
 * Die Profilfelder einer Bewerbung, die einen Wert haben, in der festen Reihenfolge von
 * `BEWERBUNG_PROFILFELDER` (PART-122). Gezeigt wird nur, was die Funktion `applications_for_session`
 * mit Einwilligung der Person liefert — mehr gibt es hier nicht. Der Wert ist die Beschriftung aus
 * `werte`, wenn es eine gibt, sonst der gespeicherte Text (Arbeitgeber, Hochschule und Ort sind Freitext).
 */
export function profilFelder(
  profile: Record<string, unknown> | null | undefined,
  werte: ProfilWerte = {},
): [string, string][] {
  return BEWERBUNG_PROFILFELDER.flatMap((key) => {
    const wert = profile?.[key];
    if (typeof wert !== "string" || wert.trim() === "") return [];
    return [[key, werte[key]?.[wert] ?? wert] as [string, string]];
  });
}

/**
 * Eine Zeile zum Überfliegen in der Liste: Status (Master-Student, Berufstätig …), Arbeitgeber — oder,
 * wo keiner steht, Hochschule — und Ort, mit „ · “ getrennt. Was fehlt, fällt weg; ganz leer ist `""`.
 * Das Übrige steht im Profil der Person (PART-122).
 */
export function profilKurz(profile: Record<string, unknown> | null | undefined, werte: ProfilWerte = {}): string {
  const feld: Record<string, string | undefined> = Object.fromEntries(profilFelder(profile, werte));
  return [feld.occupation_status, feld.employer_name ?? feld.university, feld.city].filter(Boolean).join(" · ");
}

/** Antworten als Zeilen aus Frage (oder Schlüssel) und Text; eine Mehrfachauswahl wird mit Komma verbunden. */
export function antwortZeilen(answers: Record<string, unknown> | null | undefined): [string, string][] {
  return Object.entries(answers ?? {}).map(([frage, wert]) => [frage, Array.isArray(wert) ? wert.join(", ") : String(wert ?? "")]);
}

/**
 * Die LinkedIn-Adresse, wenn sie eine ist: nur `http` und `https`. Die Adresse steht im Profil der
 * Bewerberin oder des Bewerbers, also in einem Feld, das jemand anderes ausgefüllt hat — sie wird
 * verlinkt, und ein `javascript:` oder `data:` darf dabei nicht durchgehen.
 */
export function linkedinUrl(profile: Record<string, unknown> | null | undefined): string | null {
  const roh = profile?.linkedin_url;
  if (typeof roh !== "string") return null;
  try {
    const url = new URL(roh.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Die E-Mail-Adresse einer Bewerbung (PART-147), wenn sie eine ist. Die Datenbank liefert sie im `profile` nur mit Weitergabe
 * (`consent_share`) und nur die primäre Adresse; hier wird sie zusätzlich geprüft, bevor sie als `mailto:`-Link in die Seite kommt —
 * sie steht in einem Feld, das jemand anderes ausgefüllt hat. Erlaubt sind Buchstaben und Ziffern (auch mit Umlauten), `.`, `_`, `+`, `-`
 * und `'` vor dem `@`; **kein** `?`, `&`, `#`, `%`, `/`, Leerzeichen oder Komma: ein `mailto:` mit `?cc=` oder `&bcc=` hängte sonst
 * Empfänger an, die die Person nie genannt hat.
 */
const EMAIL_MUSTER = /^[\p{L}\p{N}._+'-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*\.\p{L}{2,}$/u;

export function profilEmail(profile: Record<string, unknown> | null | undefined): string | null {
  const roh = profile?.email;
  if (typeof roh !== "string") return null;
  const adresse = roh.trim();
  return adresse.length <= 254 && EMAIL_MUSTER.test(adresse) ? adresse : null;
}

/** Was die Details einer Bewerbung brauchen — Partner- und Admin-Zeilen liefern es gleich. */
export type BewerbungFuerDetails = {
  display_name: string | null;
  consent_share: boolean;
  answers: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
};

/**
 * Verdeckt ist eine Bewerbung nur, wenn ihre Daten **fehlen**: Partner bekommen
 * ohne Einwilligung weder Name noch Antworten, das Team bekommt sie trotzdem
 * (`is_application_team`). Am Datenstand zu entscheiden statt am Häkchen hält
 * beide Sichten richtig, ohne dass die Anzeige wissen muss, wer schaut.
 */
export function istVerdeckt(a: Pick<BewerbungFuerDetails, "display_name" | "consent_share">): boolean {
  return !a.consent_share && a.display_name == null;
}
