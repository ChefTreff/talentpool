"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ausgabeKante, zuschnittDateiname } from "@/lib/bildzuschnitt";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { useBildAusschnitt } from "./useBildAusschnitt";

export type ZuschnittTexte = {
  title: string;
  /** Hinweis bei der Dreiecksform: wohin das Gesicht gehört. */
  hintDreieck: string;
  hintQuadrat: string;
  zoom: string;
  reset: string;
  apply: string;
  cancel: string;
  /** Zugänglicher Name der Zeichenfläche inklusive Tastatur. */
  canvasLabel: string;
  loadFailed: string;
  exportFailed: string;
};

const ZuschnittKontext = createContext<ZuschnittTexte | null>(null);

/**
 * Die Texte des Dialogs, einmal bereitgestellt — im Wurzel-Layout und in der Shell mit der Sprache des
 * Bereichs (wie `FehlerKontextGeber`). Vier Stellen öffnen den Dialog, aus drei Bereichen und mit
 * mehreren Aufrufern je Stelle; jedem die Texte durchzureichen hieße, überall Props nachzuziehen.
 */
export function ZuschnittTexteGeber({ texte, children }: { texte: ZuschnittTexte; children: ReactNode }) {
  return <ZuschnittKontext.Provider value={texte}>{children}</ZuschnittKontext.Provider>;
}

/** Kantenlänge der Zeichenfläche in Bildpunkten. Die Anzeige skaliert; die Rechnung bleibt in diesem Maß. */
const VORSCHAU = 720;
/** Qualität von WebP und JPEG. Fotos von Menschen: sichtbar verlustarm, rund ein Zehntel der Größe eines PNG. */
const QUALITAET = 0.9;

const alsBlob = (canvas: HTMLCanvasElement, typ: string) =>
  new Promise<Blob | null>((fertig) => canvas.toBlob(fertig, typ, QUALITAET));

/**
 * Foto zuschneiden, im Browser (ADM-066, Konrad 02.10.: „die Bilder sitzen komisch“).
 *
 * Die Fotos von Personen erscheinen überall im Dreieck (`PortraitShape`), und ein
 * Hochformat sitzt darin anders als ein Selfie: Nach oben wird die Form schmal, ein
 * Gesicht im oberen Drittel wird abgeschnitten. Statt es dem Zufall zu überlassen, zeigt
 * dieser Dialog **dieselbe Form über dem Bild** — das Außerhalb abgedunkelt — und lässt
 * verschieben und zoomen, bevor etwas hochgeladen wird. Wie die Hear-Me-Speak-Grafik
 * (`GrafikMaske`), nur als Dialog und mit einem Ergebnis: einer fertigen Datei.
 *
 * **Alles im Browser, ohne Dienst.** Das Original verlässt das Gerät nicht; hochgeladen wird
 * nur der Ausschnitt, als WebP bis 2000 px und ohne Metadaten (die Zeichenfläche kennt keine
 * EXIF-Daten: Ort, Kamera und Zeitpunkt der Aufnahme bleiben zurück). Safari kann kein WebP
 * schreiben und liefert dann ein PNG: In dem Fall nehmen wir JPEG, weil ein PNG eines Fotos
 * ein Vielfaches größer wäre. Die Prüfung auf dem Server bleibt, wie sie ist.
 *
 * **Das Bild bedeckt den Rahmen immer** (`lib/bildzuschnitt.ts`): Beim Ziehen und Zoomen
 * kommen keine leeren Ränder zustande, aus denen ein Foto mit schwarzen Kanten würde.
 *
 * Bedienung: Ziehen mit Maus oder Finger, Zoom mit Regler, Mausrad oder zwei Fingern,
 * Pfeiltasten verschieben, Plus und Minus zoomen — ein Foto zu positionieren setzt keine
 * Hand und keine Maus voraus.
 *
 * Verwendung: `{datei && <BildZuschnitt datei={datei} t={…} onFertig={hochladen} onAbbruch={() => setDatei(null)} />}`.
 * Die Prüfung von Typ und Größe der gewählten Datei gehört vorher an die Stelle, die sie kennt.
 */
export function BildZuschnitt({
  datei,
  form = "dreieck",
  t: textProp,
  onFertig,
  onAbbruch,
}: {
  datei: File;
  /** `dreieck` für Personen (Standard), `quadrat` für alles andere. */
  form?: "dreieck" | "quadrat";
  /** Ohne Angabe die Texte aus `ZuschnittTexteGeber`. */
  t?: ZuschnittTexte;
  /** Bekommt die fertige Datei (WebP, ersatzweise JPEG). Der Dialog schließt der Aufrufer. */
  onFertig: (zugeschnitten: File) => void;
  onAbbruch: () => void;
}) {
  const ausKontext = useContext(ZuschnittKontext);
  const t = textProp ?? ausKontext;
  if (!t) throw new Error("BildZuschnitt: keine Texte — ZuschnittTexteGeber im Layout oder die Eigenschaft t angeben");

  const a = useBildAusschnitt(datei, VORSCHAU);
  const { bild } = a;
  const [exportfehler, setExportfehler] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);

  async function uebernehmen() {
    if (!bild) return;
    setArbeitet(true);
    setExportfehler(false);
    let ergebnis: File | null = null;
    try {
      const flaeche = a.ausschnitt();
      if (!flaeche) throw new Error("kein Bild");
      const { sx, sy, sw } = flaeche;
      const kante = ausgabeKante(sw);
      const zeichne = (grund?: string) => {
        const c = document.createElement("canvas");
        c.width = kante;
        c.height = kante;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("kein Zeichenkontext");
        if (grund) {
          ctx.fillStyle = grund;
          ctx.fillRect(0, 0, kante, kante);
        }
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bild, sx, sy, sw, sw, 0, 0, kante, kante);
        return c;
      };
      let mime: "image/webp" | "image/jpeg" = "image/webp";
      let blob = await alsBlob(zeichne(), "image/webp");
      if (!blob || blob.type !== "image/webp") {
        // JPEG kennt keine Transparenz: ein freigestelltes PNG bekäme sonst einen schwarzen Grund.
        // Die Farbe kommt aus dem Token, nicht als Hex-Wert im Code (Skill-Regel 2).
        const weiss = getComputedStyle(document.documentElement).getPropertyValue("--ct-surface").trim();
        mime = "image/jpeg";
        blob = await alsBlob(zeichne(weiss || "white"), "image/jpeg");
      }
      if (blob) ergebnis = new File([blob], zuschnittDateiname(datei.name, mime), { type: mime, lastModified: Date.now() });
    } catch {
      ergebnis = null;
    }
    if (!ergebnis) {
      setExportfehler(true);
      setArbeitet(false);
      return;
    }
    // Zuletzt: Der Aufrufer schließt den Dialog, danach gibt es nichts mehr zu setzen.
    onFertig(ergebnis);
  }

  const dreieck = form === "dreieck";

  return (
    <Modal label={t.title} onCancel={onAbbruch} error={a.ladefehler ? t.loadFailed : exportfehler ? t.exportFailed : null}>
      <h2 className="ct-h3 text-ink">{t.title}</h2>
      <p className="ct-help mt-1">{dreieck ? t.hintDreieck : t.hintQuadrat}</p>

      <div className="relative mx-auto mt-4 w-full max-w-md">
        <canvas
          {...a.canvasProps}
          role="img"
          aria-label={t.canvasLabel}
          className={`block aspect-square w-full rounded-ct-sm border bg-accent-soft ${
            bild ? "cursor-grab touch-none active:cursor-grabbing" : ""
          }`}
        />
        {/* Die Form des Portals über dem Bild: was außerhalb liegt, ist abgedunkelt, der Umriss steht in Akzent.
            Dieselben Punkte wie `--ct-shape-triangle` (Spitze oben Mitte, Basis unten). */}
        {dreieck && (
          <svg
            aria-hidden
            focusable="false"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <path d="M0 0H100V100H0Z M50 0L100 100L0 100Z" fillRule="evenodd" className="fill-navy/55" />
            <polygon
              points="50,0 100,100 0,100"
              fill="none"
              className="stroke-accent"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>

      <div className="mx-auto mt-4 max-w-md">
        <div className="flex items-center justify-between gap-3">
          <label className="ct-label" htmlFor="zuschnitt-zoom">
            {t.zoom}
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={!bild || arbeitet}
            onClick={a.zuruecksetzen}
          >
            {t.reset}
          </Button>
        </div>
        <input
          id="zuschnitt-zoom"
          type="range"
          {...a.regler}
          // 44 px Höhe für grobe Zeiger: der Regler selbst ist nur 16 px hoch (wie bei der Hear-Me-Speak-Grafik).
          className="mt-1 w-full accent-accent pointer-coarse:h-11"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button disabled={!bild || arbeitet} loading={arbeitet} onClick={uebernehmen}>
          {t.apply}
        </Button>
        <Button variant="secondary" disabled={arbeitet} onClick={onAbbruch}>
          {t.cancel}
        </Button>
      </div>
    </Modal>
  );
}
