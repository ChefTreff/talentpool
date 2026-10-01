/**
 * Was die Admin-Karte „Folien in Drive“ (SPK-023) anzeigt — Typen und Links
 * ohne Node-Module, damit die Client-Komponente sie laden darf. Gerechnet
 * wird in `lib/drive/server.ts`.
 */

/**
 * Stand einer Präsentation im Technik-Ordner.
 * `neu`: noch nie gespiegelt · `offen`: neue Fassung noch nicht drüben ·
 * `verschieben`: Slot, Bühne, Tag oder Name geändert · `fehler`: der letzte
 * Versuch scheiterte · `ohne_slot`: Session nicht im Programm · `ohne_ordner`:
 * die Edition hat keinen Zielordner.
 */
export type Zustand = "aktuell" | "neu" | "offen" | "verschieben" | "fehler" | "ohne_slot" | "ohne_ordner";

/** Fehler zuerst — das ist, was jemand tun muss; Erledigtes zuletzt. */
export const ZUSTAND_REIHENFOLGE: readonly Zustand[] = ["fehler", "neu", "offen", "verschieben", "ohne_ordner", "ohne_slot", "aktuell"];

export type UebersichtZeile = {
  schluessel: string;
  speaker: string;
  session: string;
  buehne: string | null;
  beginn: string | null;
  timezone: string;
  version: number;
  zustand: Zustand;
  fehler: string | null;
  detail: string | null;
  driveId: string | null;
  gespiegeltAm: string | null;
};

export type Uebersicht = {
  konto: "bereit" | "fehlt" | "ungueltig";
  /** Die Adresse, der der Ordner freigegeben wird — kein Geheimnis, nur im Abschnitt `tech` sichtbar. */
  kontoAdresse: string | null;
  ordnerId: string | null;
  zeilen: UebersichtZeile[];
  zaehler: Record<Zustand, number>;
  /** Kopien, deren Folie gelöscht oder deren Session abgesetzt ist — der Cron entfernt sie. */
  verwaist: number;
};

export function leereZaehler(): Record<Zustand, number> {
  return { aktuell: 0, neu: 0, offen: 0, verschieben: 0, fehler: 0, ohne_slot: 0, ohne_ordner: 0 };
}

/** Link auf eine Datei oder einen Ordner in Drive — die ID allein reicht. */
export function driveLink(id: string, ordner = false): string {
  return ordner
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
    : `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}
