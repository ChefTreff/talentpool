"use client";

import { useEffect, useRef } from "react";

/**
 * Ein Editor, der **unter** einer Liste aufklappt, muss beim Öffnen ins Bild
 * kommen (QS-066).
 *
 * Im Produktstamm und bei den Vorlagen erschien er als Karte hinter der
 * Tabelle. Wer in einer Liste mit sechzig Zeilen „Bearbeiten“ drückt, sah
 * nichts: Der Editor stand zweitausend Pixel tiefer, der Fokus blieb am Knopf.
 * Ein Knopf, der scheinbar nichts tut, ist schlimmer als ein langsamer.
 *
 * Verwendung (Editor ohne Schubfach, weil er die ganze Breite braucht):
 *
 *     const aufmachen = useEditorImBild(entwurf, "produkt-editor");
 *     …onClick={() => { aufmachen(); setEntwurf(zeile); }}
 *     {entwurf && <Card id="produkt-editor">…</Card>}
 *
 * Die Karte über ihre `id` zu finden hält den Eingriff klein: kein Wrapper, der
 * hunderte Zeilen neu einrückt. (`Card` setzt bei einer `id` selbst
 * `scroll-mt-20`.) `aufmachen()` merkt sich nur, dass **der Mensch gerade
 * geöffnet hat**: Der Entwurf ändert sich bei jedem Tastendruck, und es soll
 * nicht bei jedem Zeichen gesprungen werden. Dann springt die Seite zum Editor
 * (ohne Animation, Regel 6) und der Fokus geht in dessen erstes Feld.
 */
export function useEditorImBild(entwurf: unknown, id: string): () => void {
  const geoeffnet = useRef(false);

  useEffect(() => {
    if (!geoeffnet.current || !entwurf) return;
    geoeffnet.current = false;
    const editor = document.getElementById(id);
    if (!editor) return;
    editor.scrollIntoView({ block: "start" });
    // `preventScroll`: Der Sprung ist schon passiert, ein zweiter würde das Feld an den Rand schieben.
    editor
      .querySelector<HTMLElement>("input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])")
      ?.focus({ preventScroll: true });
  }, [entwurf, id]);

  return () => {
    geoeffnet.current = true;
  };
}
