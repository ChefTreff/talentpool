"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";

type Strings = Record<string, string>;

/** Kantenlänge der fertigen Grafik. Das Template ist quadratisch. */
const GROESSE = 1200;
const TEMPLATE = "/brand/hear-me-speak-fls26.png";
const MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/** Wie weit sich das Porträt vergrössern lässt, bezogen auf „füllt das Loch". */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_SCHRITT = 0.02;
/** Ein Tastendruck verschiebt um so viele Bildpunkte der fertigen Grafik. */
const TASTEN_SCHRITT = 20;

type Lage = { zoom: number; x: number; y: number };

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rahmenRef = useRef<HTMLImageElement | null>(null);
  const bildRef = useRef<HTMLImageElement | null>(null);
  const ziehen = useRef<{ x: number; y: number } | null>(null);

  const [bereit, setBereit] = useState(false);
  const [hatBild, setHatBild] = useState(false);
  const [lage, setLage] = useState<Lage>({ zoom: 1, x: 0, y: 0 });

  // Den Rahmen einmal laden. Ohne ihn zeigt die Fläche nichts — deshalb wartet
  // der Leerzustand darauf und nicht auf das Porträt.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      rahmenRef.current = img;
      setBereit(true);
    };
    img.src = TEMPLATE;
  }, []);

  const zeichnen = useCallback(() => {
    const canvas = canvasRef.current;
    const rahmen = rahmenRef.current;
    if (!canvas || !rahmen) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, GROESSE, GROESSE);

    const bild = bildRef.current;
    if (bild) {
      // Grundmass: das Porträt deckt das Quadrat gerade ab (cover). Von dort
      // aus wirkt der Zoom, damit „1" immer heisst: nichts ist leer.
      const deckung = Math.max(GROESSE / bild.naturalWidth, GROESSE / bild.naturalHeight);
      const f = deckung * lage.zoom;
      const b = bild.naturalWidth * f;
      const h = bild.naturalHeight * f;
      ctx.drawImage(bild, (GROESSE - b) / 2 + lage.x, (GROESSE - h) / 2 + lage.y, b, h);
    } else {
      // Ohne Porträt eine ruhige Fläche, damit man den Ausschnitt sieht. Die
      // Farbe kommt aus dem Token, nicht als Hex-Wert im Code: eine Leinwand
      // kennt keine Tailwind-Klassen, den Wert holen wir uns trotzdem von dort
      // (Skill-Regel 2). Der Rückfall greift nur, falls die Variable fehlt.
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue("--ct-accent-soft")
        .trim();
      ctx.fillStyle = token || "transparent";
      ctx.fillRect(0, 0, GROESSE, GROESSE);
    }

    ctx.drawImage(rahmen, 0, 0, GROESSE, GROESSE);
  }, [lage]);

  useEffect(() => {
    zeichnen();
  }, [zeichnen, bereit]);

  function onFile(datei: File) {
    if (datei.size > MAX_BYTES) {
      toast("error", t.tooBig);
      return;
    }
    if (datei.type && !MIME.includes(datei.type)) {
      toast("error", t.wrongType);
      return;
    }
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => {
      bildRef.current = img;
      setHatBild(true);
      setLage({ zoom: 1, x: 0, y: 0 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast("error", t.loadFailed);
    };
    img.src = url;
  }

  /** Pixel der Anzeige in Bildpunkte der Grafik umrechnen. */
  function faktor(): number {
    const el = canvasRef.current;
    return el && el.clientWidth ? GROESSE / el.clientWidth : 1;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!hatBild) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    ziehen.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const start = ziehen.current;
    if (!start) return;
    const f = faktor();
    const dx = (e.clientX - start.x) * f;
    const dy = (e.clientY - start.y) * f;
    ziehen.current = { x: e.clientX, y: e.clientY };
    setLage((l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
  }

  function onPointerUp() {
    ziehen.current = null;
  }

  /**
   * Tastatur: dieselbe Bewegung wie mit der Maus.
   *
   * Ohne sie wäre die Maske für alle unbedienbar, die nicht ziehen können —
   * und ein Bild zu positionieren ist keine Aufgabe, die eine Hand voraussetzt.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!hatBild) return;
    const schritt = e.shiftKey ? TASTEN_SCHRITT * 5 : TASTEN_SCHRITT;
    const nach: Record<string, [number, number]> = {
      ArrowLeft: [-schritt, 0],
      ArrowRight: [schritt, 0],
      ArrowUp: [0, -schritt],
      ArrowDown: [0, schritt],
    };
    const d = nach[e.key];
    if (!d) return;
    e.preventDefault();
    setLage((l) => ({ ...l, x: l.x + d[0], y: l.y + d[1] }));
  }

  function herunterladen() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("error", t.exportFailed);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${vorschlag}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast("success", t.downloaded);
    }, "image/png");
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Card className="lg:max-w-xl lg:flex-1">
        <canvas
          ref={canvasRef}
          width={GROESSE}
          height={GROESSE}
          tabIndex={hatBild ? 0 : -1}
          role="img"
          aria-label={hatBild ? t.canvasWithImage : t.canvasEmpty}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
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
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_SCHRITT}
              value={lage.zoom}
              disabled={!hatBild}
              onChange={(e) => setLage((l) => ({ ...l, zoom: Number(e.target.value) }))}
              className="mt-2 w-full accent-accent"
            />
          </label>

          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            disabled={!hatBild}
            onClick={() => setLage({ zoom: 1, x: 0, y: 0 })}
          >
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
