import { aenderungsbereich } from "@/lib/markdown-werkzeuge";

/**
 * Ändert den Text eines Eingabefelds **als Eingabe**, damit Strg+Z funktioniert (ADM-102 f, Hinweis Design-Chat): wer den
 * Text über den React-Zustand setzt, leert den Rückgängig-Verlauf des Browsers. Hier wird nur der Bereich ersetzt, der sich
 * ändert, und zwar mit `execCommand("insertText")` — das ist zwar als veraltet markiert, aber das **einzige** Mittel, das den
 * Verlauf des Browsers heil lässt, und es läuft in allen Browsern, die wir bedienen. Das Feld meldet dabei sein normales
 * `input`-Ereignis; `onChange` der Seite führt den Zustand nach.
 *
 * Liefert `false`, wenn der Browser die Änderung nicht angenommen hat (dann setzt der Aufrufer den Text wie bisher).
 */
export function ersetzeAlsEingabe(feld: HTMLTextAreaElement | HTMLInputElement, neu: string): boolean {
  const alt = feld.value;
  if (alt === neu) return true;
  const { von, bisAlt, ersatz } = aenderungsbereich(alt, neu);
  feld.focus();
  feld.setSelectionRange(von, bisAlt);
  try {
    // Ein leerer Ersatz löscht die Auswahl.
    return ersatz === "" ? document.execCommand("delete") : document.execCommand("insertText", false, ersatz);
  } catch {
    return false;
  }
}

/** Rückgängig oder Wiederholen im Feld (Verlauf des Browsers). */
export function verlaufBefehl(feld: HTMLTextAreaElement | HTMLInputElement, befehl: "undo" | "redo"): void {
  feld.focus();
  try {
    document.execCommand(befehl);
  } catch {
    /* Ohne Verlauf bleibt der Knopf wirkungslos — kein Fehler. */
  }
}
