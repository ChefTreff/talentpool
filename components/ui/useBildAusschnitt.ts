"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ausschnitt as rechneAusschnitt,
  begrenze,
  deckung,
  zoomeAuf,
  type Lage,
} from "@/lib/bildzuschnitt";

const ZOOM_SCHRITT = 0.02;
/** Ein Tastendruck verschiebt um so viele Bildpunkte der Zeichenfläche; mit Umschalt das Fünffache. */
const TASTEN_SCHRITT = 16;
const START: Lage = { zoom: 1, x: 0, y: 0 };

/**
 * Ein Foto in einem quadratischen Rahmen verschieben und zoomen — die Interaktion hinter
 * dem Zuschnitt-Dialog (ADM-066), losgelöst von dessen Hülle, damit sie auch andere Flächen
 * tragen können (eine Grafik mit Rahmen, eine Vorschau).
 *
 * Der Hook lädt die Datei, zeichnet sie in das Canvas, das `canvasProps` bekommt, und
 * kümmert sich um Ziehen (Maus, Finger mit Pointer-Capture), Pinch mit zwei Fingern,
 * Mausrad, Pfeiltasten sowie Plus und Minus. Die Rechnung steht in `lib/bildzuschnitt.ts`
 * (getestet); das Bild bedeckt den Rahmen immer.
 *
 * ```tsx
 * const a = useBildAusschnitt(datei, 720);
 * <canvas {...a.canvasProps} />
 * <input type="range" {...a.regler} />
 * ```
 *
 * `zeichneUeber` läuft nach dem Bild (und auch ohne Bild, auf der leeren Fläche): hier legt
 * eine Fläche ihren Rahmen oder ihre Maske darüber. Ein stabiler Verweis (`useCallback`)
 * vermeidet unnötiges Neuzeichnen.
 */
export function useBildAusschnitt(
  datei: File | null,
  kante: number,
  optionen: { zeichneUeber?: (ctx: CanvasRenderingContext2D, hatBild: boolean) => void } = {},
) {
  const { zeichneUeber } = optionen;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const abstand = useRef<number | null>(null);

  const [bild, setBild] = useState<HTMLImageElement | null>(null);
  const [ladefehler, setLadefehler] = useState(false);
  const [lage, setLage] = useState<Lage>(START);

  useEffect(() => {
    if (!datei) return;
    const url = URL.createObjectURL(datei);
    const img = new Image();
    let weg = false;
    img.onload = () => {
      if (weg) return;
      setLadefehler(false);
      setBild(img);
      setLage(START);
    };
    img.onerror = () => {
      if (!weg) setLadefehler(true);
    };
    img.src = url;
    return () => {
      weg = true;
      URL.revokeObjectURL(url);
    };
  }, [datei]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, kante, kante);
    if (bild) {
      const s = deckung(bild.naturalWidth, bild.naturalHeight, kante) * lage.zoom;
      const b = bild.naturalWidth * s;
      const h = bild.naturalHeight * s;
      ctx.drawImage(bild, (kante - b) / 2 + lage.x, (kante - h) / 2 + lage.y, b, h);
    }
    zeichneUeber?.(ctx, !!bild);
  }, [bild, lage, kante, zeichneUeber]);

  /** Pixel der Anzeige in Bildpunkte der Zeichenfläche umrechnen. */
  const faktor = useCallback(() => {
    const el = canvasRef.current;
    return el && el.clientWidth ? kante / el.clientWidth : 1;
  }, [kante]);

  const verschiebe = useCallback(
    (dx: number, dy: number) => {
      if (!bild) return;
      setLage((l) => begrenze({ ...l, x: l.x + dx, y: l.y + dy }, bild.naturalWidth, bild.naturalHeight, kante));
    },
    [bild, kante],
  );

  const zoome = useCallback(
    (neu: (alt: number) => number) => {
      if (!bild) return;
      setLage((l) => zoomeAuf(l, neu(l.zoom), bild.naturalWidth, bild.naturalHeight, kante));
    },
    [bild, kante],
  );

  // Mausrad: ein eigener, nicht-passiver Hörer, damit das Rad die Seite dahinter nicht mitscrollt.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bild) return;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const faktor = Math.exp(-e.deltaY * 0.0015);
      zoome((z) => z * faktor);
    };
    canvas.addEventListener("wheel", rad, { passive: false });
    return () => canvas.removeEventListener("wheel", rad);
  }, [bild, zoome]);

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!bild) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Der Zeiger ist schon weg (Finger gehoben, bevor der Hörer lief): dann gibt es nichts zu halten.
    }
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zeiger.current.size === 2) {
      const [a, b] = [...zeiger.current.values()];
      abstand.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const alt = zeiger.current.get(e.pointerId);
    if (!alt) return;
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zeiger.current.size === 1) {
      const f = faktor();
      verschiebe((e.clientX - alt.x) * f, (e.clientY - alt.y) * f);
    } else if (zeiger.current.size === 2) {
      // Zwei Finger: der Abstand zwischen ihnen ist der Zoom.
      const [a, b] = [...zeiger.current.values()];
      const neu = Math.hypot(a.x - b.x, a.y - b.y);
      // Den alten Abstand jetzt festhalten: die Funktion in `zoome` läuft erst beim nächsten Rendern,
      // und bis dahin steht in `abstand.current` schon der neue.
      const vorher = abstand.current;
      abstand.current = neu;
      if (vorher) {
        const faktor = neu / vorher;
        zoome((z) => z * faktor);
      }
    }
  }

  function onPointerEnde(e: PointerEvent<HTMLCanvasElement>) {
    zeiger.current.delete(e.pointerId);
    if (zeiger.current.size < 2) abstand.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    if (!bild) return;
    const schritt = e.shiftKey ? TASTEN_SCHRITT * 5 : TASTEN_SCHRITT;
    const nach: Record<string, [number, number]> = {
      ArrowLeft: [-schritt, 0],
      ArrowRight: [schritt, 0],
      ArrowUp: [0, -schritt],
      ArrowDown: [0, schritt],
    };
    if (nach[e.key]) {
      e.preventDefault();
      verschiebe(...nach[e.key]);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoome((z) => z + 0.1);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoome((z) => z - 0.1);
    }
  }

  return {
    bild,
    ladefehler,
    lage,
    zuruecksetzen: () => setLage(START),
    /** Der sichtbare Ausschnitt in Bildpunkten der Quelle (`null`, solange kein Bild geladen ist). */
    ausschnitt: () => (bild ? rechneAusschnitt(lage, bild.naturalWidth, bild.naturalHeight, kante) : null),
    /** Auf das `<canvas>` verteilen (`{...canvasProps}`); die Klassen und der zugängliche Name bleiben Sache der Fläche. */
    canvasProps: {
      ref: canvasRef,
      width: kante,
      height: kante,
      tabIndex: bild ? 0 : -1,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnde,
      onPointerCancel: onPointerEnde,
      onKeyDown,
    },
    /** Auf `<input type="range">` verteilen. */
    regler: {
      min: ZOOM_MIN,
      max: ZOOM_MAX,
      step: ZOOM_SCHRITT,
      value: lage.zoom,
      disabled: !bild,
      onChange: (e: { target: { value: string } }) => zoome(() => Number(e.target.value)),
    },
  };
}
