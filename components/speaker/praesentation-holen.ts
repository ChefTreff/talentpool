/**
 * Eine Präsentation ansehen oder herunterladen (LEAD-060) — der Ablauf, rein und mit eingereichten Abhängigkeiten, damit `npm test` ihn **ausführt**
 * (Reihenfolge der Schritte, Fehlerfälle), ohne Browser und ohne Speicher.
 *
 * Der Bucket `speaker-assets` ist privat: die Adresse wird **beim Klick** mit der Sitzung signiert (60 Sekunden), nicht beim Laden der Liste — eine Liste, die
 * eine Stunde offen steht, hätte sonst tote Links. Wer lesen darf, entscheidet die Pfadregel `speaker_asset_path_allowed` (Stage Lead: die Dateien seiner betreuten
 * Profile, Team und Admin alle); schlägt sie zu, kommt hier kein Link zurück.
 *
 * **Ansehen** (nur PDF, siehe `istPdf`): ein neues Fenster, das **im Klick** geöffnet wird — Safari blockiert `window.open` nach einem `await` — und danach die
 * Adresse bekommt; der Opener wird gekappt (`noopener`-Ersatz). **Herunterladen**: die Adresse trägt `Content-Disposition: attachment` (`download`), ein Anker
 * löst den Download aus, die Liste bleibt stehen.
 */

/** Was von einem geöffneten Fenster gebraucht wird (`window.open("", "_blank")` liefert es). */
export type FensterGriff = { opener: unknown; location: { href: string }; close: () => void };

export type HolenAbhaengigkeiten = {
  /** Signiert den Pfad (60 s); mit `download` trägt die Adresse `Content-Disposition: attachment`. `url` ist `null`, wenn das Signieren scheitert. */
  signieren: (pfad: string, optionen?: { download: string }) => Promise<{ url: string | null }>;
  /** Öffnet ein leeres Fenster — **synchron**, vor dem ersten `await`. `null`, wenn der Browser es blockiert. */
  fensterOeffnen: () => FensterGriff | null;
  /** Löst den Download einer Adresse aus (ein Anker mit `download`). */
  herunterladen: (url: string, dateiname: string) => void;
};

export type HolenModus = "ansehen" | "laden";
/** `fehler`: kein Link (Recht fehlt, Datei weg, Netz); `blockiert`: das Fenster zum Ansehen kam nicht auf. */
export type HolenErgebnis = "ok" | "fehler" | "blockiert";

export async function holeFassung(
  modus: HolenModus,
  fassung: { storage_path: string; filename: string },
  d: HolenAbhaengigkeiten,
): Promise<HolenErgebnis> {
  // Zuerst das Fenster, dann signieren — in dieser Reihenfolge, sonst ist die Geste des Klicks verbraucht.
  const fenster = modus === "ansehen" ? d.fensterOeffnen() : null;
  if (modus === "ansehen" && !fenster) return "blockiert";

  let url: string | null = null;
  try {
    url = (await d.signieren(fassung.storage_path, modus === "laden" ? { download: fassung.filename } : undefined)).url;
  } catch {
    url = null;
  }
  if (!url) {
    fenster?.close();
    return "fehler";
  }

  if (fenster) {
    fenster.opener = null;
    fenster.location.href = url;
  } else {
    d.herunterladen(url, fassung.filename);
  }
  return "ok";
}
