"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";
import { useBildAusschnitt } from "@/components/ui/useBildAusschnitt";

type Strings = Record<string, string>;

/** Kantenlänge der fertigen Grafik. Das Template ist quadratisch. */
const GROESSE = 1200;
const TEMPLATE = "/brand/hear-me-speak-fls26.png";
const MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Die „Hear me speak"-Grafik im Portal (SPK-013).
 *
 * Bisher kam sie über einen Fremddienst. Konrad am 17.09.: „super wichtig" —
 * Porträt hochladen, im Template positionieren, prüfen, als PNG herunterladen.
 *
 * **Alles bleibt im Browser.** Das Porträt wird nicht hochgeladen, nicht
 * gespeichert und nicht an einen Dienst geschickt; es wird hier gezeichnet und
 * hier heruntergeladen. Das ist nicht nur sparsamer, es nimmt der Sache auch
 * die datenschutzrechtliche Seite: ein Bild, das nie irgendwo ankommt, muss
 * niemand löschen.
 *
 * **Der Rahmen liegt über dem Porträt.** Das Template ist eine PNG-Datei, aus
 * der die Ellipse herausgestanzt ist; was ausserhalb liegt, deckt der Rahmen ab.
 * Deshalb braucht die Maske keine Ellipsen-Mathematik und trifft die Form auf
 * den Pixel genau — auch die dünnen Linien, die im Entwurf über dem Porträt
 * liegen, tun das hier wieder.
 *
 * **Die Bedienung kommt aus dem gemeinsamen Kern** (SPK-080): Laden, Lage,
 * Ziehen, Pinch, Mausrad, Tasten und der Regler stecken in `useBildAusschnitt`
 * (ADM-066, Design) — derselbe Hook trägt den Zuschnitt-Dialog. Diese Maske legt
 * nur ihren Rahmen darüber (`zeichneUeber`) und lädt das Ergebnis herunter. Das
 * Bild bedeckt den Rahmen dabei immer: beim Verschieben entstehen keine leeren
 * Ränder (vorher gab es sie, der Rahmen deckte sie meist ab).
 */
export function GrafikMaske({
  vorschlag,
  t,
}: {
  /** Dateiname-Vorschlag, damit der Download nicht „download.png" heisst. */
  vorschlag: string;
  t: Strings;
}) {
  const toast = useToast();
  const [rahmen, setRahmen] = useState<HTMLImageElement | null>(null);
  const [datei, setDatei] = useState<File | null>(null);

  // Den Rahmen einmal laden. Ohne ihn zeigt die Fläche nichts — deshalb wartet
  // der Leerzustand darauf und nicht auf das Porträt.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setRahmen(img);
    img.src = TEMPLATE;
  }, []);

  // Der Rahmen kommt nach dem Porträt, auch ohne Porträt. Ein neuer Verweis, sobald
  // er geladen ist, lässt den Hook neu zeichnen.
  const zeichneUeber = useCallback(
    (ctx: CanvasRenderingContext2D, hatBild: boolean) => {
      if (!rahmen) return;
      if (!hatBild) {
        // Ohne Porträt eine ruhige Fläche, damit man den Ausschnitt sieht. Die
        // Farbe kommt aus dem Token, nicht als Hex-Wert im Code: eine Leinwand
        // kennt keine Tailwind-Klassen, den Wert holen wir uns trotzdem von dort
        // (Skill-Regel 2). Der Rückfall greift nur, falls die Variable fehlt.
        const token = getComputedStyle(document.documentElement).getPropertyValue("--ct-accent-soft").trim();
        ctx.fillStyle = token || "transparent";
        ctx.fillRect(0, 0, GROESSE, GROESSE);
      }
      ctx.drawImage(rahmen, 0, 0, GROESSE, GROESSE);
    },
    [rahmen],
  );

  const a = useBildAusschnitt(datei, GROESSE, { zeichneUeber });
  const hatBild = a.bild !== null;

  useEffect(() => {
    if (a.ladefehler) toast("error", t.loadFailed);
  }, [a.ladefehler, toast, t.loadFailed]);

  function onFile(gewaehlt: File) {
    if (gewaehlt.size > MAX_BYTES) {
      toast("error", t.tooBig);
      return;
    }
    if (gewaehlt.type && !MIME.includes(gewaehlt.type)) {
      toast("error", t.wrongType);
      return;
    }
    setDatei(gewaehlt);
  }

  function herunterladen() {
    const canvas = a.canvasProps.ref.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("error", t.exportFailed);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${vorschlag}.png`;
      link.click();
      URL.revokeObjectURL(url);
      toast("success", t.downloaded);
    }, "image/png");
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Card className="lg:max-w-xl lg:flex-1">
        <canvas
          {...a.canvasProps}
          role="img"
          aria-label={hatBild ? t.canvasWithImage : t.canvasEmpty}
          className={`w-full rounded-ct-sm border ${
            hatBild ? "cursor-grab touch-none active:cursor-grabbing" : ""
          }`}
        />
        {hatBild && <p className="ct-help mt-3">{t.dragHint}</p>}
      </Card>

      <div className="flex flex-1 flex-col gap-4">
        <div>
          <h2 className="ct-h3 text-ink">{t.stepUpload}</h2>
          <p className="ct-help mt-1">{t.stepUploadBody}</p>
          <FileButton
            className="mt-3"
            label={hatBild ? t.replacePhoto : t.choosePhoto}
            accept={MIME.join(",")}
            hint={t.rules}
            onFile={onFile}
          />
        </div>

        <div>
          <h2 className="ct-h3 text-ink">{t.stepPlace}</h2>
          <p className="ct-help mt-1">{t.stepPlaceBody}</p>

          <label className="mt-3 block" htmlFor="zoom">
            <span className="ct-label">{t.zoom}</span>
            <input
              id="zoom"
              type="range"
              {...a.regler}
              // 44 px Höhe für grobe Zeiger (SPK-079): der Regler selbst ist nur 16 px
              // hoch — am Handy war die Größe kaum zu greifen. Die Fläche wächst,
              // die Spur bleibt dünn und mittig; am Rechner ändert sich nichts.
              className="mt-2 w-full accent-accent pointer-coarse:h-11"
            />
          </label>

          <Button className="mt-3" variant="secondary" size="sm" disabled={!hatBild} onClick={a.zuruecksetzen}>
            {t.reset}
          </Button>
        </div>

        <div>
          <h2 className="ct-h3 text-ink">{t.stepDownload}</h2>
          <p className="ct-help mt-1">{t.stepDownloadBody}</p>
          <Button className="mt-3" disabled={!hatBild} onClick={herunterladen}>
            {t.download}
          </Button>
        </div>

        <p className="ct-help">{t.privacyNote}</p>
      </div>
    </div>
  );
}
