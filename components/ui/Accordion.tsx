import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Aufklappbare Frage — FAQ und Hilfe in jedem Bereich.
 *
 * Website-Vorbild: FAQ Section (`54:3972`). Dort steht die Frage in
 * Versalien; im Portal bleibt sie gemischt — eine Frage in Versalien liest
 * sich als Schild, nicht als Frage, und in einer Hilfeseite stehen zehn
 * davon untereinander.
 *
 * Umsetzung mit `<details>/<summary>`: Aufklappen, Tastatur und die
 * Vorlesesoftware kommen dann vom Browser. Ein nachgebautes Aufklappen mit
 * `aria-expanded` müsste all das selbst können, und es kann es meistens
 * nicht. Suchen im Browser (⌘F) findet ausserdem auch zugeklappten Text.
 */
export function Accordion({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2", className)}>{children}</div>;
}

export function AccordionItem({
  question,
  children,
  defaultOpen,
  className,
}: {
  question: string;
  children: ReactNode;
  /** Der erste Eintrag einer Hilfeseite darf offen stehen. */
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group rounded-ct-md border bg-surface open:border-accent", className)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 ct-label text-ink [&::-webkit-details-marker]:hidden">
        {question}
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 12 12"
          className="h-3 w-3 shrink-0 text-accent transition-transform duration-150 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </summary>
      <div className="border-t px-4 py-3 text-muted">{children}</div>
    </details>
  );
}
