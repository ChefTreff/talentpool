import { DriveFehler, type DriveApi, type DriveDatei, type FehlerSchluessel } from "@/lib/drive/api";
import { aufgabeFuer, folienKennung, zielFuer, type Aufgabe, type Kandidat, type Ziel } from "@/lib/drive/ziel";

/**
 * Der Ablauf der Spiegelung (SPK-023) — ohne Netz und ohne Datenbank, beides
 * kommt über `SpiegelDeps`. So prüft `tests/drive-spiegel.test.ts` jeden Weg
 * mit nachgestelltem Drive; `lib/drive/server.ts` verdrahtet die echten Wege.
 */

/** Eine Zeile in `slide_drive_mirror`, wie der Server sie schreibt. */
export type SpiegelZeile = {
  profile_id: string;
  session_id: string;
  asset_id: string | null;
  asset_version: number | null;
  drive_file_id: string | null;
  target_hash: string | null;
  status: "ok" | "error";
  error_key: string | null;
  error_detail: string | null;
  attempts: number;
  mirrored_at: string | null;
  updated_at: string;
};

export type SpiegelDeps = {
  drive: DriveApi;
  /** Die Datei aus dem Bucket `speaker-assets`. */
  datei(pfad: string): Promise<Uint8Array>;
  speichern(zeile: SpiegelZeile): Promise<void>;
  zeileEntfernen(mirrorId: string): Promise<void>;
  jetzt?: () => Date;
};

/** Schlüssel für Fehler ausserhalb von Drive. */
export type SpiegelFehler = FehlerSchluessel | "storage_missing";

export type Ergebnis =
  | { aufgabe: Aufgabe; ok: true; driveId: string | null }
  | { aufgabe: Aufgabe; ok: false; fehler: SpiegelFehler; detail: string };

/** Ordner, die ein Lauf schon gefunden oder angelegt hat: Kennung unter Eltern → Ordner. */
export type OrdnerSpeicher = Map<string, DriveDatei>;

export const SPEICHER_FEHLER = "storage_missing" as const;

class SpeicherFehler extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super("storage_missing");
    this.detail = detail;
  }
}

/** Den Ordner mit unserer Kennung unter `elternId` finden, umbenennen, wenn der Name nicht mehr stimmt, sonst anlegen. */
async function ordnerSichern(
  drive: DriveApi,
  speicher: OrdnerSpeicher,
  elternId: string,
  ordner: { kennung: string; name: string },
): Promise<DriveDatei> {
  const schluessel = `${elternId}|${ordner.kennung}`;
  const da = speicher.get(schluessel);
  if (da) return da;
  const gefunden = await drive.finden(elternId, ordner.kennung, true);
  let ergebnis: DriveDatei;
  if (gefunden) {
    // Bühne umbenannt oder Tagesbezeichnung geändert: der Ordner zieht mit,
    // die Dateien darin bleiben, wo sie sind.
    if (gefunden.name !== ordner.name) await drive.umbenennen(gefunden.id, ordner.name);
    ergebnis = { ...gefunden, name: ordner.name };
  } else {
    ergebnis = await drive.ordnerAnlegen(elternId, ordner.name, ordner.kennung);
  }
  speicher.set(schluessel, ergebnis);
  return ergebnis;
}

function zeitstempel(deps: SpiegelDeps): string {
  return (deps.jetzt?.() ?? new Date()).toISOString();
}

/**
 * Eine Präsentation spiegeln. Schreibt das Ergebnis immer nach
 * `slide_drive_mirror` — gelungen mit Drive-ID und Ziel, gescheitert mit
 * Schlüssel und Meldung, damit der Admin es sieht. Wirft nicht.
 */
export async function spiegeleEinen(deps: SpiegelDeps, k: Kandidat, speicher: OrdnerSpeicher = new Map()): Promise<Ergebnis> {
  const ziel = zielFuer(k);
  const aufgabe = aufgabeFuer(k, ziel);
  if (aufgabe === "aktuell" || aufgabe === "ohne_slot" || aufgabe === "ohne_ordner" || !ziel || !k.folder_id) {
    return { aufgabe, ok: true, driveId: k.drive_file_id };
  }
  try {
    const driveId = await ausfuehren(deps, k, ziel, aufgabe, speicher, k.folder_id);
    await deps.speichern({
      profile_id: k.profile_id,
      session_id: k.session_id,
      asset_id: k.asset_id,
      asset_version: k.asset_version,
      drive_file_id: driveId,
      target_hash: ziel.hash,
      status: "ok",
      error_key: null,
      error_detail: null,
      attempts: 0,
      mirrored_at: zeitstempel(deps),
      updated_at: zeitstempel(deps),
    });
    return { aufgabe, ok: true, driveId };
  } catch (e) {
    const fehler: SpiegelFehler =
      e instanceof DriveFehler ? e.schluessel : e instanceof SpeicherFehler ? SPEICHER_FEHLER : "drive_error";
    const detail = e instanceof DriveFehler || e instanceof SpeicherFehler ? e.detail : e instanceof Error ? e.message : String(e);
    // Die alte Kopie bleibt verzeichnet: sie liegt noch in Drive und ist der
    // Ausgangspunkt für den nächsten Versuch.
    await deps.speichern({
      profile_id: k.profile_id,
      session_id: k.session_id,
      asset_id: k.asset_id,
      asset_version: k.asset_version,
      drive_file_id: k.drive_file_id,
      target_hash: k.target_hash,
      status: "error",
      error_key: fehler,
      error_detail: detail.slice(0, 500),
      attempts: (k.attempts ?? 0) + 1,
      mirrored_at: k.mirrored_at,
      updated_at: zeitstempel(deps),
    });
    return { aufgabe, ok: false, fehler, detail };
  }
}

async function ausfuehren(
  deps: SpiegelDeps,
  k: Kandidat,
  ziel: Ziel,
  aufgabe: Aufgabe,
  speicher: OrdnerSpeicher,
  zielordner: string,
): Promise<string> {
  const buehne = await ordnerSichern(deps.drive, speicher, zielordner, ziel.buehne);
  const tag = await ordnerSichern(deps.drive, speicher, buehne.id, ziel.tag);

  // Die bisherige Kopie: über die verzeichnete ID, sonst über die Kennung im
  // Tagesordner (Zeile verloren, Datei noch da). Liegt sie im Papierkorb oder
  // hat jemand sie gelöscht, entsteht eine neue.
  let bisher = k.drive_file_id ? await deps.drive.dateiLesen(k.drive_file_id) : null;
  if (!bisher) bisher = await deps.drive.finden(tag.id, folienKennung(k.profile_id, k.session_id), false);

  const eltern = bisher?.parents ?? [];
  const umzug = bisher && !eltern.includes(tag.id) ? { hinzu: tag.id, weg: eltern } : undefined;

  if (bisher && aufgabe === "verschieben") {
    const d = await deps.drive.verschieben(bisher.id, ziel.datei, ziel.eigenschaften, umzug ?? { hinzu: "", weg: [] });
    return d.id;
  }

  let inhalt: Uint8Array;
  try {
    inhalt = await deps.datei(k.storage_path);
  } catch (e) {
    throw new SpeicherFehler(e instanceof Error ? e.message : String(e));
  }
  const datei = {
    name: ziel.datei,
    mime: k.mime || "application/octet-stream",
    inhalt,
    eigenschaften: ziel.eigenschaften,
  };
  const d = bisher ? await deps.drive.ersetzen(bisher.id, datei, umzug) : await deps.drive.hochladen(tag.id, datei);
  return d.id;
}

export type Zusammenfassung = {
  gespiegelt: number;
  verschoben: number;
  fehler: number;
  /** Was das Zeit- oder Mengenbudget dieses Laufs nicht mehr geschafft hat. */
  offen: number;
  aktuell: number;
  ohneSlot: number;
  ohneOrdner: number;
  entfernt: number;
  entfernenFehler: number;
};

export function leereZusammenfassung(): Zusammenfassung {
  return { gespiegelt: 0, verschoben: 0, fehler: 0, offen: 0, aktuell: 0, ohneSlot: 0, ohneOrdner: 0, entfernt: 0, entfernenFehler: 0 };
}

/**
 * Alles nachholen, was fehlt — in Programmreihenfolge, höchstens `max`
 * Übertragungen und nur bis `bisMs` (Zeitpunkt), damit ein Klick nicht an
 * der Laufzeitgrenze der Funktion abbricht. Der Rest zählt als `offen`; ein
 * zweiter Klick macht dort weiter.
 */
export async function spiegeleAlle(
  deps: SpiegelDeps,
  kandidaten: Kandidat[],
  grenzen: { max: number; bisMs: number; jetztMs?: () => number },
): Promise<Zusammenfassung> {
  const z = leereZusammenfassung();
  const speicher: OrdnerSpeicher = new Map();
  const uhr = grenzen.jetztMs ?? Date.now;
  let uebertragen = 0;
  for (const k of kandidaten) {
    const aufgabe = aufgabeFuer(k, zielFuer(k));
    if (aufgabe === "aktuell") {
      z.aktuell += 1;
      continue;
    }
    if (aufgabe === "ohne_slot") {
      z.ohneSlot += 1;
      continue;
    }
    if (aufgabe === "ohne_ordner") {
      z.ohneOrdner += 1;
      continue;
    }
    if (uebertragen >= grenzen.max || uhr() >= grenzen.bisMs) {
      z.offen += 1;
      continue;
    }
    uebertragen += 1;
    const e = await spiegeleEinen(deps, k, speicher);
    if (!e.ok) z.fehler += 1;
    else if (e.aufgabe === "verschieben") z.verschoben += 1;
    else z.gespiegelt += 1;
  }
  return z;
}

/**
 * Kopien ohne Präsentation im Programm entfernen (`slide_mirror_orphans`):
 * erst die Datei in Drive, dann die Zeile — andersherum bliebe eine Kopie ohne
 * Verweis liegen. Scheitert das Entfernen, bleibt die Zeile mit dem Fehler
 * stehen; der nächste Lauf versucht es wieder.
 */
export async function raeumeAuf(
  deps: SpiegelDeps & { fehlerMerken(mirrorId: string, fehler: SpiegelFehler, detail: string): Promise<void> },
  waisen: { mirror_id: string; drive_file_id: string | null }[],
): Promise<{ entfernt: number; fehler: number }> {
  let entfernt = 0;
  let fehler = 0;
  for (const w of waisen) {
    try {
      if (w.drive_file_id) await deps.drive.loeschen(w.drive_file_id);
      await deps.zeileEntfernen(w.mirror_id);
      entfernt += 1;
    } catch (e) {
      fehler += 1;
      const schluessel: SpiegelFehler = e instanceof DriveFehler ? e.schluessel : "drive_error";
      await deps.fehlerMerken(w.mirror_id, schluessel, e instanceof DriveFehler ? e.detail : String(e));
    }
  }
  return { entfernt, fehler };
}
