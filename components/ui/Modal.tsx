"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

/**
 * Was ein `ModalFuss` vom umgebenden `Modal` braucht: die Meldung, um sie über den Knöpfen zu zeigen, und einen Weg,
 * sich an- und abzumelden — solange ein Fuß da ist, zeichnet das `Modal` seine eigene Leiste nicht. Über einen Kontext
 * statt über die Kinder des `Modal`: so gilt es auch, wenn der Fuß in einem eigenen Baustein steckt.
 */
const ModalKontext = createContext<{
  error?: string | null;
  fussAnmelden: (da: boolean) => void;
} | null>(null);

/** Die Meldung zur Aktion — eine Gestalt, ob sie als eigene Leiste unten klebt oder im Fuß über den Knöpfen steht. */
function Meldung({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={cn("border-t border-error-soft bg-error-soft px-4 py-3 ct-small text-error-ink sm:px-6", className)}
    >
      {children}
    </p>
  );
}

/**
 * `<dialog showModal>` — Fokusfalle, Escape und die Abdunklung kommen vom
 * Browser. Deshalb kein eigenes Overlay und keine Tastatur-Logik.
 *
 * `error` wie beim `Drawer` (ADM-041, ADM-062): die Meldung zur Aktion gehört
 * in den Dialog, nicht als Toast an den Bildschirmrand. Sie bleibt sichtbar,
 * wie weit der Inhalt auch gescrollt ist, und steht neben dem Knopf, der sie
 * ausgelöst hat: Hat das Fenster eine klebende Fußleiste (`ModalFuss`), steht
 * sie dort über den Knöpfen — wie beim `Drawer` über dem Fuß. Ohne Fußleiste
 * klebt sie als eigene Leiste am unteren Rand. Beides zugleich gibt es nie:
 * zwei Streifen, die unten kleben, überdecken sich (QS-068). `role="alert"`
 * sagt sie an, ohne den Fokus zu verschieben.
 */
export function Modal({
  label,
  onCancel,
  blocking,
  size = "default",
  error,
  children,
}: {
  /** Zugänglicher Name des Dialogs; sichtbar ist die Überschrift darin. */
  label: string;
  onCancel: () => void;
  /**
   * Lässt Escape und den Zurück-Knopf des Browsers ins Leere laufen — für den
   * einen Fall, in dem der Dialog **die** Aufgabe ist und nicht daneben steht
   * (die Einwilligung beim ersten Anmelden, SPK-024). Sparsam verwenden: ein
   * Dialog, den man nicht schliessen kann, ist eine Sackgasse, wenn das
   * Speichern scheitert — deshalb muss er selbst einen Ausweg anbieten.
   */
  blocking?: boolean;
  /**
   * `wide` für ein Arbeitsfenster mit zwei Spalten statt einer Rückfrage — der
   * Speaker-Kontakt der Leads (LEAD-026: „die Seitenleiste ist zu schmal für die
   * Informationsfülle“). Auf dem Telefon bleibt es eine Spalte.
   */
  size?: "default" | "wide";
  /** Fehlermeldung zur Aktion im Dialog. Siehe oben. */
  error?: string | null;
  children: ReactNode;
}) {
  // Wie viele `ModalFuss` im Fenster stehen: solange einer da ist, zeigt er die Meldung.
  const [fuesse, setFuesse] = useState(0);
  const fussAnmelden = useCallback((da: boolean) => setFuesse((n) => n + (da ? 1 : -1)), []);
  const kontext = useMemo(() => ({ error, fussAnmelden }), [error, fussAnmelden]);

  return (
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      aria-label={label}
      onCancel={(e) => {
        if (blocking) {
          e.preventDefault();
          return;
        }
        onCancel();
      }}
      // `m-auto`: der Browser zentriert einen modalen Dialog über `margin: auto`,
      // und Tailwinds Preflight setzt jedes `margin` auf 0 — ohne das stand
      // jedes Modal links oben (25.09., beim breiten Fenster aufgefallen).
      className={cn(
        // `overscroll-contain`: wer im langen Dialog ans Ende scrollt, zieht nicht
        // die Seite dahinter mit (QS-014, Web Interface Guidelines „Touch“).
        //
        // Das Polster ist am Handy 16 px, ab 640 px 24 (QS-068): bei 375 px blieben von der Breite 327 px für
        // den Inhalt, und ein Formular mit zwei Spalten oder ein langer Text verlor damit 16 px ohne Not. Alles,
        // was gegen das Polster arbeitet — die Meldung unten, `ModalFuss` — nimmt dieselben beiden Maße.
        "m-auto w-full overscroll-contain rounded-ct-lg border bg-surface p-4 text-ink backdrop:bg-navy/40 sm:p-6",
        size === "wide" ? "max-w-5xl" : "max-w-dialog",
      )}
    >
      <ModalKontext.Provider value={kontext}>{children}</ModalKontext.Provider>
      {error && fuesse === 0 && (
        <Meldung className="sticky -bottom-4 -mx-4 -mb-4 mt-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:mt-6">{error}</Meldung>
      )}
    </dialog>
  );
}

/**
 * Die klebende Fußleiste eines langen Fensters (QS-068): „Speichern“ soll nicht erst nach dem Scrollen zu finden
 * sein. Sie läuft über das Polster des `Modal` hinaus bis an den Rand und klebt unten — dafür stehen hier **beide**
 * Maße des Polsters (16 px am Handy, 24 ab 640 px), und keine Seite muss sie kennen. Vorher setzte das Personen-Fenster
 * der Leads `-mx-6 -mb-6` von Hand; mit dem kleineren Polster am Handy hätte das 8 px über den Rand hinaus gereicht
 * und das Fenster seitlich scrollbar gemacht. Ein Test zählt nach, dass keine Seite mehr mit dem alten Maß arbeitet.
 *
 * **Die `error`-Meldung des Fensters steht hier, über den Knöpfen** — wie beim `Drawer` über dem Fuß. Die eigene Leiste
 * des `Modal` klebte ebenfalls unten und deckte die Knöpfe zu, solange nicht ganz bis ans Ende gescrollt war (gemessen
 * bei 375 px: 85 px). Das Fenster merkt, dass ein Fuß da ist, und lässt seine Leiste weg.
 *
 * Als letztes Kind des `Modal` setzen. Die Knöpfe stehen nebeneinander und brechen um; die eine Hauptaktion zuerst.
 * `className` gilt für die Zeile mit den Knöpfen (zum Beispiel `justify-end`).
 */
export function ModalFuss({ children, className }: { children: ReactNode; className?: string }) {
  const kontext = useContext(ModalKontext);
  const anmelden = kontext?.fussAnmelden;
  // Stabil, damit sich der Fuß nur beim Einhängen und Aushängen meldet und nicht bei jedem Zeichnen.
  const ref = useCallback((el: HTMLDivElement | null) => anmelden?.(el !== null), [anmelden]);

  return (
    <div ref={ref} className="sticky -bottom-4 -mx-4 -mb-4 mt-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:mt-6">
      {kontext?.error && <Meldung>{kontext.error}</Meldung>}
      <div className={cn("flex flex-wrap gap-2 border-t bg-surface px-4 py-4 sm:px-6", className)}>{children}</div>
    </div>
  );
}

/** Rückfrage vor einer Entscheidung, die etwas anderes verdrängt oder beendet. */
export function ConfirmDialog({
  title,
  body,
  detail,
  confirmLabel,
  cancelLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  /** Optionale Aufzählung dessen, was die Bestätigung konkret betrifft. */
  detail?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  /**
   * Scheitert die Aktion, **bleibt die Rückfrage offen** und sagt es hier (ADM-062, Abnahme Team & Zugänge 09.10.2026):
   * vorher schloss die Seite den Dialog und meldete den Fehler als Toast — wer eine Sperre bestätigt hatte, sah nicht mehr,
   * wozu die Meldung gehörte. Dieselbe Meldung wie beim `Modal` (`role="alert"`, klebt unten).
   */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onCancel={onCancel} label={title} error={error}>
      <h2 className="ct-h3">{title}</h2>
      <p className="ct-help mt-2">{body}</p>
      {detail && <div className="mt-3">{detail}</div>}
      {/* `type="button"`: steht die Rückfrage in einem `<form>` (QS-051 rendert sie
          im Formular), wären die Knöpfe sonst Absenden-Knöpfe — „Weiter
          bearbeiten“ hätte das Formular gespeichert. */}
      <div className="mt-6 flex gap-2">
        <Button type="button" onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}
