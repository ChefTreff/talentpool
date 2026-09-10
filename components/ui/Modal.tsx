"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * `<dialog showModal>` — Fokusfalle, Escape und die Abdunklung kommen vom
 * Browser. Deshalb kein eigenes Overlay und keine Tastatur-Logik.
 */
export function Modal({
  label,
  onCancel,
  children,
}: {
  /** Zugänglicher Name des Dialogs; sichtbar ist die Überschrift darin. */
  label: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      aria-label={label}
      onCancel={onCancel}
      className="w-full max-w-[560px] rounded-ct-lg border bg-surface p-6 text-ink backdrop:bg-navy/40"
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
