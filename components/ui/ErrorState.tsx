import type { ReactNode } from "react";

/**
 * Fehlerzustand einer Seite (QS-023): was passiert ist, die Fehler-ID und ein
 * Weg zurück. Das Gegenstück zu `EmptyState` — derselbe Aufbau, dieselbe
 * Fläche, damit ein Fehler nicht wie eine andere Anwendung aussieht.
 *
 * Die Form ist das Dreieck der Events-Marke, hier als Warnzeichen: Strich und
 * Ausrufezeichen in `error-ink` (5,7:1 auf `surface`). Rot steht nie allein —
 * Titel und Text sagen dasselbe.
 *
 * Die Überschrift ist `h1`, weil der Fehler die Seite ersetzt und mit ihr
 * deren Titel; in der Bausteinschau steht sie als `h3` unter einem Abschnitt.
 * `tabIndex={-1}` macht sie fokussierbar: Die Grenze legt den Fokus darauf,
 * weil das Element, das ihn hatte, mit der Seite verschwunden ist.
 */
export function ErrorState({
  title,
  description,
  idLabel,
  id,
  actions,
  level = 1,
}: {
  title: string;
  description: ReactNode;
  /** Beschriftung vor der ID, z. B. „Fehler-ID". */
  idLabel: string;
  /** Wonach man in den Logs sucht. Nie die Meldung des Fehlers. */
  id: string;
  /** Genau eine primäre Aktion, daneben höchstens sekundäre. */
  actions?: ReactNode;
  level?: 1 | 2 | 3;
}) {
  const Ueberschrift = `h${level}` as const;
  return (
    <div className="flex flex-col items-center rounded-ct-lg border bg-surface px-6 py-12 text-center">
      <WarnDreieck />
      <Ueberschrift tabIndex={-1} className="ct-h3 mt-4 text-ink">
        {title}
      </Ueberschrift>
      <p className="ct-help mt-1 max-w-meldung">{description}</p>
      <p className="ct-small mt-4 text-muted">
        {idLabel}: <span className="select-all text-ink tabular-nums">{id}</span>
      </p>
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}

function WarnDreieck() {
  return (
    <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden focusable="false">
      <path
        d="M17 2 32 28H2z"
        fill="none"
        className="stroke-error-ink"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M17 11v7" className="stroke-error-ink" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="22.5" r="1.25" className="fill-error-ink" />
    </svg>
  );
}
