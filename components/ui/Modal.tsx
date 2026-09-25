"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

/**
 * `<dialog showModal>` — Fokusfalle, Escape und die Abdunklung kommen vom
 * Browser. Deshalb kein eigenes Overlay und keine Tastatur-Logik.
 */
export function Modal({
  label,
  onCancel,
  blocking,
  size = "default",
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
  children: ReactNode;
}) {
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
        "m-auto w-full overscroll-contain rounded-ct-lg border bg-surface p-6 text-ink backdrop:bg-navy/40",
        size === "wide" ? "max-w-5xl" : "max-w-[560px]",
      )}
    >
      {children}
    </dialog>
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
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onCancel={onCancel} label={title}>
      <h2 className="ct-h3">{title}</h2>
      <p className="ct-help mt-2">{body}</p>
      {detail && <div className="mt-3">{detail}</div>}
      <div className="mt-6 flex gap-2">
        <Button onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Modal>
  );
}
