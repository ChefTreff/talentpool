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
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
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
        "pointer-events-auto rounded-ct-md border px-4 py-2 text-[14px] font-semibold shadow-sm",
        tones[tone],
      )}
    >
      {text}
    </div>
  );
}
