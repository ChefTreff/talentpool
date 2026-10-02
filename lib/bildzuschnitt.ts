/**
 * Die Rechnung hinter dem Bild-Zuschnitt (ADM-066) — ohne Zeichenfläche, damit sie
 * sich prüfen lässt. `components/ui/BildZuschnitt.tsx` zeichnet nur noch.
 *
 * Maße: `kante` ist die Kantenlänge des quadratischen Ausschnitts auf der Zeichenfläche
 * (Bildpunkte der Vorschau), `breite`/`hoehe` die Maße des Bildes. Die **Lage** ist der
 * Zoom und die Verschiebung des Bildes gegen die Mitte des Ausschnitts (Vorschau-Pixel).
 *
 * Grundmaß: Bei Zoom 1 deckt das Bild den Ausschnitt gerade ab (`cover`) — „1“ heißt
 * immer: nichts ist leer. Die Verschiebung ist begrenzt, sodass das auch beim Ziehen
 * so bleibt (anders als die Hear-Me-Speak-Maske, die leere Ränder zulässt: dort ist der
 * Rahmen eine Grafik, hier käme ein Foto mit schwarzen Kanten heraus).
 */

export type Lage = { zoom: number; x: number; y: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** Längste Kante der fertigen Datei (Plan 02.10.: WebP bis 2000 px). */
export const MAX_KANTE = 2000;

/** Wie viele Bildpunkte der Vorschau ein Bildpunkt der Quelle belegt, bei Zoom 1. */
export function deckung(breite: number, hoehe: number, kante: number): number {
  return Math.max(kante / breite, kante / hoehe);
}

/** Klemmt `wert` in den Bereich; `-0` wird zu `0`, damit Vergleiche und Anzeige nichts Merkwürdiges sehen. */
const zwischen = (wert: number, von: number, bis: number) => {
  const z = Math.min(bis, Math.max(von, wert));
  return z === 0 ? 0 : z;
};

export function begrenzeZoom(zoom: number): number {
  return zwischen(zoom, ZOOM_MIN, ZOOM_MAX);
}

/** Verschiebung und Zoom so halten, dass das Bild den Ausschnitt ganz bedeckt. */
export function begrenze(l: Lage, breite: number, hoehe: number, kante: number): Lage {
  const zoom = begrenzeZoom(l.zoom);
  const s = deckung(breite, hoehe, kante) * zoom;
  const maxX = Math.max(0, (breite * s - kante) / 2);
  const maxY = Math.max(0, (hoehe * s - kante) / 2);
  return { zoom, x: zwischen(l.x, -maxX, maxX), y: zwischen(l.y, -maxY, maxY) };
}

/**
 * Zoomt um die Mitte des Ausschnitts: Der Bildpunkt, der in der Mitte steht, bleibt dort.
 * Dafür wächst die Verschiebung mit dem Zoom (`s' / s = zoom' / zoom`).
 */
export function zoomeAuf(l: Lage, neuerZoom: number, breite: number, hoehe: number, kante: number): Lage {
  const zoom = begrenzeZoom(neuerZoom);
  const verhaeltnis = l.zoom > 0 ? zoom / l.zoom : 1;
  return begrenze({ zoom, x: l.x * verhaeltnis, y: l.y * verhaeltnis }, breite, hoehe, kante);
}

/** Der sichtbare Ausschnitt in Bildpunkten der Quelle: linke obere Ecke und Kantenlänge. */
export function ausschnitt(l: Lage, breite: number, hoehe: number, kante: number): { sx: number; sy: number; sw: number } {
  const s = deckung(breite, hoehe, kante) * l.zoom;
  const sw = kante / s;
  return { sx: (breite - sw) / 2 - l.x / s, sy: (hoehe - sw) / 2 - l.y / s, sw };
}

/**
 * Kantenlänge der fertigen Datei: so groß wie der Ausschnitt in der Quelle (nie hochgerechnet),
 * höchstens `MAX_KANTE`.
 */
export function ausgabeKante(sw: number): number {
  return Math.max(1, Math.min(MAX_KANTE, Math.round(sw)));
}

/** Dateiname der Zuschnitt-Datei: der alte Name ohne Endung, bereinigt, mit der neuen Endung. */
export function zuschnittDateiname(original: string, mime: "image/webp" | "image/jpeg"): string {
  // Nur der Dateiname, falls ein Pfad mitkommt (ein Browser liefert keinen, aber der Aufrufer muss sich nicht darauf verlassen).
  const name = original.split(/[\\/]/).pop() ?? "";
  const ohneEndung = name.replace(/\.[^.]+$/, "");
  const basis =
    ohneEndung
      .replace(/ä/gi, (m) => (m === "ä" ? "ae" : "Ae"))
      .replace(/ö/gi, (m) => (m === "ö" ? "oe" : "Oe"))
      .replace(/ü/gi, (m) => (m === "ü" ? "ue" : "Ue"))
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "foto";
  return `${basis}.${mime === "image/webp" ? "webp" : "jpg"}`;
}
