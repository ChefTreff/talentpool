import type { NavZusatz } from "@/lib/admin-navigation";

/**
 * Neue Speaker von Partnern (ADM-084, Konrad & Leopold 05.10.2026): Legt ein Partner für seinen Talk oder seine gebrandete
 * Bühne einen Speaker an, steht er im Admin in der Liste „Neue Speaker“, bis das Team Betreuung und Stand gesetzt hat. Die
 * Regel, was „neu“ heißt, liegt in der Datenbank (`partner_created_speakers`, Spalte `is_new`: Betreuung fehlt **oder** der
 * Stand ist noch `lead`; Gäste der Standbühne, Abgesagte und Gelöschte zählen nicht) — die Oberfläche liest sie, sie rechnet
 * sie nicht nach.
 */

/** Der Menüpunkt, an dem die Zahl steht (Abschnitt `speakers`). */
export const NEUE_SPEAKER_PFAD = "/admin/speaker";

/** Der Wert des Abfrageparameters, der die Liste „Neue Speaker“ statt aller Speaker zeigt (`/admin/speaker?liste=neu`). */
export const LISTE_NEU = "neu";

/**
 * Antwort von `new_speaker_count()`: eine ganze Zahl ab 0. Alles andere — keine Zahl, negativ, gebrochen, Text — ist keine
 * Auskunft und ergibt `null`, nie 0: ein beschädigter Wert soll nicht als „nichts offen“ durchgehen.
 */
export function parseNeueSpeakerZahl(daten: unknown): number | null {
  return typeof daten === "number" && Number.isInteger(daten) && daten >= 0 ? daten : null;
}

/**
 * Der Zähler am Menüpunkt „Speaker“ — wie die Summe bei den Freigaben, aber ohne Unterpunkte: es bleibt bei **einem** Punkt,
 * die Leiste wächst nicht. Ohne Auskunft (`null`: Funktion fehlt, kein Recht, Fehler) bleibt der Punkt, wie er war; bei 0
 * blendet die Leiste die Zahl selbst aus.
 */
export function neueSpeakerNavigation(zahl: number | null, vorlesen: (n: number) => string): NavZusatz | undefined {
  if (zahl === null) return undefined;
  return { count: zahl, countLabel: vorlesen(zahl) };
}

/** Was die Seite aus `partner_created_speakers` braucht: je Profil der Partner und ob der Speaker neu ist. */
export type Herkunft = { partner: string; neu: boolean };

/**
 * Die Marke „von <Partner>“ und „Neu“ für die Speaker-Liste, nach Profil-Kennung. Eine Zeile ohne Partnernamen bekommt
 * trotzdem eine Marke (der Partner ist dann „Partner“): die Herkunft ist die Auskunft, der Name nur ihre Beschriftung.
 */
export function herkunftNachProfil(
  zeilen: readonly { profile_id: string; partner_name: string | null; is_new: boolean }[],
  ersatzname: string,
): Record<string, Herkunft> {
  const karte: Record<string, Herkunft> = {};
  for (const z of zeilen) karte[z.profile_id] = { partner: z.partner_name?.trim() || ersatzname, neu: z.is_new };
  return karte;
}
