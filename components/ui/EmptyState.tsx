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
      <Triangle />
      <h3 className="ct-h3 mt-4 text-ink">{title}</h3>
      <p className="ct-help mt-1 max-w-[46ch]">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * Ein Dreieck, dezent.
 *
 * Hier stand ein Hexagon — nach dem alten Briefing das „Systemelement der
 * Marke". Im Brandbook Final gehört das Hexagon aber zu **Education**; die
 * Grundform von **Events** ist das Dreieck, der spitze Winkel. Ein Leerzustand
 * darf genau eine solche Form tragen, Strichstärke 1–2 px im Akzent.
 */
function Triangle() {
  return (
    <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden focusable="false">
      <path
        d="M17 2 32 28H2z"
        fill="none"
        stroke="var(--ct-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
