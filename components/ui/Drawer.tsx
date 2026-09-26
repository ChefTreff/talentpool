"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Seiten-Panel für Detail-/Bearbeitungsansichten.
 * Nutzt <dialog showModal> — Fokusfalle, Escape und Inertisierung des
 * Hintergrunds kommen damit vom Browser statt aus eigenem JS.
 *
 * **`error` gehört hierher und nicht in die Seite** (ADM-041). Ein
 * `<dialog showModal>` liegt über allem; eine Fehlermeldung, die die Seite
 * oben anzeigt, ist dahinter unsichtbar. Man klickt auf Speichern, nichts
 * passiert, der Grund ist nicht zu sehen — das hat Konrad zweimal Zeit
 * gekostet. Drei Seiten hatten daraufhin ihre eigene Meldung in den Dialog
 * gebaut, jede ein bisschen anders.
 *
 * Die Meldung sitzt **über dem Fuß und außerhalb des scrollenden Bereichs**:
 * sie gehört neben den Knopf, der sie ausgelöst hat, und bleibt sichtbar,
 * egal wie weit der Inhalt gescrollt ist. `role="alert"` sagt sie auch
 * Vorlesesoftware an, ohne dass der Fokus springt.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  error,
  closeLabel = "Schließen",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Fehlermeldung zur Aktion im Fuß. Siehe Kopf dieser Datei. */
  error?: string | null;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
      className={
        "ml-auto mr-0 h-dvh max-h-none w-full max-w-[520px] rounded-none border-l bg-surface p-0 " +
        "text-ink backdrop:bg-navy/40 open:flex open:flex-col"
      }
    >
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="ct-h3">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-ct-sm px-2 py-1 ct-label text-muted hover:bg-surface-hover hover:text-ink"
        >
          {closeLabel}
        </button>
      </header>
      {/* `overscroll-contain`: am Ende des Schubfachs scrollt nicht die Seite
          dahinter weiter (QS-014, Web Interface Guidelines „Touch“). */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">{children}</div>
      {error && (
        <p
          role="alert"
          className="border-t border-error-soft bg-error-soft px-6 py-3 ct-small text-error-ink"
        >
          {error}
        </p>
      )}
      {footer && <footer className="border-t px-6 py-4">{footer}</footer>}
    </dialog>
  );
}
