/**
 * Eine Präsentation ansehen oder herunterladen (LEAD-060) — der Ablauf, rein und mit eingereichten Abhängigkeiten, damit `npm test` ihn **ausführt**
 * (welche Option das Signieren bekommt, was bei einem Fehler passiert), ohne Browser und ohne Speicher.
 *
 * Der Bucket `speaker-assets` ist privat: die Adresse wird **beim Klick** mit der Sitzung signiert (60 Sekunden), nicht beim Laden der Liste — eine Liste, die
 * eine Stunde offen steht, hätte sonst tote Links. Wer lesen darf, entscheidet die Pfadregel `speaker_asset_path_allowed` (Stage Lead: die Dateien seiner betreuten
 * Profile, Team und Admin alle); schlägt sie zu, kommt hier kein Link zurück.
 *
 * **Ansehen** (nur PDF, siehe `istPdf`): die Adresse öffnet in einem neuen Fenster (mit `noopener`, Regel QS-034 — der Aufruf liefert dann immer `null`, ein
 * blockiertes Fenster ist also nicht zu erkennen; „Herunterladen“ bleibt der Weg daneben). **Herunterladen**: die Adresse trägt `Content-Disposition: attachment`
 * (`download`), ein Anker löst den Download aus, die Liste bleibt stehen.
 */

export type HolenAbhaengigkeiten = {
  /** Signiert den Pfad (60 s); mit `download` trägt die Adresse `Content-Disposition: attachment`. `url` ist `null`, wenn das Signieren scheitert. */
  signieren: (pfad: string, optionen?: { download: string }) => Promise<{ url: string | null }>;
  /** Öffnet die Adresse in einem neuen Fenster (`window.open(url, "_blank", "noopener")`). */
  oeffnen: (url: string) => void;
  /** Löst den Download einer Adresse aus (ein Anker mit `download`). */
  herunterladen: (url: string, dateiname: string) => void;
};

export type HolenModus = "ansehen" | "laden";
/** `fehler`: kein Link (Recht fehlt, Datei weg, Netz). */
export type HolenErgebnis = "ok" | "fehler";

export async function holeFassung(
  modus: HolenModus,
  fassung: { storage_path: string; filename: string },
  d: HolenAbhaengigkeiten,
): Promise<HolenErgebnis> {
  let url: string | null = null;
  try {
    url = (await d.signieren(fassung.storage_path, modus === "laden" ? { download: fassung.filename } : undefined)).url;
  } catch {
    url = null;
  }
  if (!url) return "fehler";

  if (modus === "ansehen") d.oeffnen(url);
  else d.herunterladen(url, fassung.filename);
  return "ok";
}
