import type { ReactNode } from "react";

/** Kurze Erklärung + genau eine primäre Aktion (Design-Briefing §5). */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-ct-lg border border-dashed bg-surface px-6 py-12 text-center">
      <Hexagon />
      <h3 className="ct-h3 mt-4 text-ink">{title}</h3>
      <p className="ct-help mt-1 max-w-[46ch]">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Hexagon = Systemelement der Marke (Design-Briefing §5), hier dezent. */
function Hexagon() {
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" aria-hidden focusable="false">
      <path
        d="M16 1 30 9v18l-14 8L2 27V9z"
        fill="none"
        stroke="var(--ct-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
