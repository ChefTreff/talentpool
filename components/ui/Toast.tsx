"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; text: string };

const ToastContext = createContext<((tone: ToastTone, text: string) => void) | null>(
  null,
);

/** Kurzes Feedback nach einer Aktion. Wird im Root-Layout einmal montiert. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: ToastTone, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* `popover="manual"` hebt den Streifen in den **Top-Layer** — dieselbe
          Ebene, in der ein `<dialog showModal>` liegt. Ohne das verschwand
          jede Rueckmeldung hinter einem offenen Schubfach: der Top-Layer
          steht ueber allem, `z-50` hilft dagegen nichts (ADM-041).

          `ref` statt `defaultOpen`: ein Popover wird ueber die API geoeffnet,
          es gibt kein Attribut dafuer. Faellt `showPopover` aus (aeltere
          Browser), bleibt das Element ein gewoehnliches `fixed`-Div an
          derselben Stelle — die Meldung ist dann wie bisher sichtbar, nur
          eben nicht ueber Dialogen. Deshalb bleiben die Klassen stehen. */}
      <div
        popover="manual"
        ref={(el) => {
          if (el && typeof el.showPopover === "function" && !el.matches(":popover-open")) {
            try {
              el.showPopover();
            } catch {
              // Schon offen oder nicht unterstuetzt: der Streifen bleibt als
              // normales Element sichtbar, das ist der alte Zustand.
            }
          }
        }}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 inset-y-auto bottom-0 z-50 m-0 w-full max-w-none border-0 bg-transparent p-4 flex flex-col items-center gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} tone={t.tone} text={t.text} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast außerhalb von <ToastProvider>");
  return ctx;
}

const tones: Record<ToastTone, string> = {
  success: "border-success-soft bg-success-soft text-success-ink",
  error: "border-error-soft bg-error-soft text-error-ink",
  info: "border-border bg-surface text-ink",
};

export function ToastItem({ tone, text }: { tone: ToastTone; text: string }) {
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-ct-md border px-4 py-2 ct-label shadow-sm",
        tones[tone],
      )}
    >
      {text}
    </div>
  );
}
