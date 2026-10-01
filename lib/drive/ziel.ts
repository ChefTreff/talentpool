import { createHash } from "node:crypto";
import type { UebersichtZeile, Zustand } from "@/lib/drive/anzeige";
import { formatTime } from "@/lib/tz";

/**
 * Wohin eine Präsentation im Technik-Ordner gehört (SPK-023) — reine
 * Rechnung, ohne Netz, damit `npm test` sie prüft.
 *
 * Aufbau (Konrad 24.09.): Zielordner → **Ordner je Bühne** → **Unterordner je
 * Veranstaltungstag** → Datei „Slot-ID_Speaker-Name“. Eine lesbare Slot-Nummer
 * gibt es im neuen Programm nicht (Airtable hatte „SL###“); die Datei beginnt
 * deshalb mit dem **Beginn des Slots** (`0930`). Er ist je Bühne und Tag
 * eindeutig, weil sich Slots einer Bühne nicht überschneiden, und sortiert die
 * Dateien in Programmreihenfolge. Die echte Slot-ID steht unsichtbar als
 * Drive-Eigenschaft an der Datei.
 */

/** Eine Zeile aus `slide_mirror_candidates`. */
export type Kandidat = {
  asset_id: string;
  asset_version: number;
  profile_id: string;
  session_id: string;
  edition_id: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  first_name: string | null;
  last_name: string | null;
  session_title: string | null;
  slot_id: string | null;
  slot_start: string | null;
  stage_id: string | null;
  stage_name: string | null;
  event_day_id: string | null;
  day_date: string | null;
  day_label: string | null;
  timezone: string;
  folder_id: string | null;
  mirror_id: string | null;
  drive_file_id: string | null;
  mirror_asset_id: string | null;
  target_hash: string | null;
  mirror_status: "ok" | "error" | null;
  error_key: string | null;
  error_detail: string | null;
  attempts: number | null;
  mirrored_at: string | null;
};

export type Ziel = {
  buehne: { kennung: string; name: string };
  tag: { kennung: string; name: string };
  datei: string;
  /** Kennungen an der Datei (`appProperties`), damit sie auch ohne Datenbankzeile wiederzufinden ist. */
  eigenschaften: Record<string, string>;
  /** sha256 aus Zielordner, Bühne, Tag und Dateiname — steht in `slide_drive_mirror.target_hash`. */
  hash: string;
};

/**
 * Was für eine Präsentation zu tun ist.
 * - `ohne_ordner`: die Edition hat keinen Zielordner.
 * - `ohne_slot`: die Session liegt (noch) nicht im Programm — nichts zu spiegeln.
 * - `anlegen`: noch keine Kopie in Drive.
 * - `ersetzen`: neue Fassung (oder der letzte Versuch scheiterte) — Inhalt neu.
 * - `verschieben`: dieselbe Fassung, aber Slot, Bühne, Tag oder Name geändert.
 * - `aktuell`: nichts zu tun.
 */
export type Aufgabe = "ohne_ordner" | "ohne_slot" | "anlegen" | "ersetzen" | "verschieben" | "aktuell";

const ENDUNG_AUS_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.apple.keynote": ".key",
  "application/x-iwork-keynote-sffkey": ".key",
};

/**
 * Ein Name, den Drive und jedes Betriebssystem der Technik vertragen: ohne
 * Steuerzeichen und Pfadzeichen, ohne doppelte Leerzeichen, höchstens 100
 * Zeichen. Umlaute bleiben.
 */
export function sichererName(text: string, ersatz = "—"): string {
  const sauber = text
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return sauber || ersatz;
}

/** Die Endung der hochgeladenen Datei, sonst aus dem MIME-Typ; ohne beides keine. */
export function endung(dateiname: string, mime: string | null): string {
  const aus = /\.([A-Za-z0-9]{1,5})$/.exec(dateiname)?.[1];
  if (aus) return `.${aus.toLowerCase()}`;
  return (mime && ENDUNG_AUS_MIME[mime]) || "";
}

/** `0930_Anna Beispiel.pptx` */
export function dateiName(k: Pick<Kandidat, "slot_start" | "timezone" | "first_name" | "last_name" | "filename" | "mime">): string {
  const beginn = k.slot_start ? formatTime(k.slot_start, k.timezone).replace(":", "") : "0000";
  const name = sichererName([k.first_name, k.last_name].filter(Boolean).join(" "), "Speaker");
  return `${beginn}_${name}${endung(k.filename, k.mime)}`;
}

/** `2027-04-16 · Tag 1 · Freitag` — das Datum zuerst, damit die Tage in Reihenfolge stehen. */
export function tagName(datum: string, label: string | null): string {
  const l = label ? sichererName(label, "") : "";
  return l ? `${datum} · ${l}` : datum;
}

export function zielFuer(k: Kandidat): Ziel | null {
  if (!k.folder_id || !k.slot_id || !k.slot_start || !k.stage_id || !k.event_day_id || !k.day_date) return null;
  const datei = dateiName(k);
  return {
    buehne: { kennung: `buehne:${k.stage_id}`, name: sichererName(k.stage_name ?? "", "Bühne") },
    tag: { kennung: `tag:${k.stage_id}:${k.event_day_id}`, name: tagName(k.day_date, k.day_label) },
    datei,
    eigenschaften: {
      fls27: folienKennung(k.profile_id, k.session_id),
      slot: k.slot_id,
      fassung: k.asset_id,
    },
    hash: createHash("sha256").update([k.folder_id, k.stage_id, k.event_day_id, datei].join("|")).digest("hex"),
  };
}

/** Die Kennung einer Präsentationslinie — dieselbe, die `slide_drive_mirror` je Zeile führt. */
export function folienKennung(profileId: string, sessionId: string): string {
  return `folie:${profileId}:${sessionId}`;
}

export function aufgabeFuer(k: Kandidat, ziel: Ziel | null): Aufgabe {
  if (!k.folder_id) return "ohne_ordner";
  if (!ziel) return "ohne_slot";
  if (!k.drive_file_id) return "anlegen";
  if (k.mirror_asset_id !== k.asset_id || k.mirror_status === "error") return "ersetzen";
  if (k.target_hash !== ziel.hash) return "verschieben";
  return "aktuell";
}

/** Der Stand für die Admin-Karte — aus derselben Rechnung wie die Spiegelung. */
export function zustandVon(k: Kandidat): Zustand {
  const aufgabe = aufgabeFuer(k, zielFuer(k));
  if (aufgabe === "ohne_ordner" || aufgabe === "ohne_slot" || aufgabe === "aktuell") return aufgabe;
  if (k.mirror_status === "error") return "fehler";
  if (aufgabe === "anlegen") return "neu";
  if (aufgabe === "verschieben") return "verschieben";
  return "offen";
}

export function uebersichtZeile(k: Kandidat): UebersichtZeile {
  const fehler = k.mirror_status === "error";
  return {
    schluessel: `${k.profile_id}:${k.session_id}`,
    speaker: [k.first_name, k.last_name].filter(Boolean).join(" ") || "—",
    session: k.session_title ?? "—",
    buehne: k.stage_name,
    beginn: k.slot_start,
    timezone: k.timezone,
    version: k.asset_version,
    zustand: zustandVon(k),
    fehler: fehler ? k.error_key : null,
    detail: fehler ? k.error_detail : null,
    driveId: k.drive_file_id,
    gespiegeltAm: k.mirrored_at,
  };
}

/**
 * Die Ordner-ID aus dem, was jemand ins Feld einfügt: die ID selbst oder eine
 * Drive-Adresse (`…/drive/folders/<id>?usp=sharing`, auch `/u/0/`). Prüfen tut
 * die Datenbank (`set_edition_slides_folder`, 22023 invalid_folder_id).
 */
export function ordnerIdAus(eingabe: string): string {
  const text = eingabe.trim();
  const ausAdresse = /\/folders\/([A-Za-z0-9_-]+)/.exec(text)?.[1];
  if (ausAdresse) return ausAdresse;
  const ausParameter = /[?&]id=([A-Za-z0-9_-]+)/.exec(text)?.[1];
  return ausParameter ?? text;
}
