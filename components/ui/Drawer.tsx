"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Seiten-Panel für Detail-/Bearbeitungsansichten.
 * Nutzt <dialog showModal> — Fokusfalle, Escape und Inertisierung des
 * Hintergrunds kommen damit vom Browser statt aus eigenem JS.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = "Schließen",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
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
          className="rounded-ct-sm px-2 py-1 text-[14px] font-semibold text-muted hover:bg-surface-hover hover:text-ink"
        >
          {closeLabel}
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      {footer && <footer className="border-t px-6 py-4">{footer}</footer>}
    </dialog>
  );
}
