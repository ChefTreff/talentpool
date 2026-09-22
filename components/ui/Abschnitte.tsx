import type { ReactNode } from "react";
import { cn } from "./cn";

export type Abschnitt = { id: string; label: string };

/**
 * Die Abschnitte einer langen Seite — als Übersicht oben, die zu Ankern
 * springt (QS-026).
 *
 * **Die Seite benennt ihre Abschnitte selbst**, statt dass hier Überschriften
 * aus dem Markup gelesen werden (Konrads Entscheidung, 22.09.). Das automatisch
 * zu tun wäre bequemer und überall sofort da, hinge aber daran, dass jede
 * Seite ihre Überschriften sauber und vollständig setzt — und es liefe jedes
 * Mal neu, wenn sich der Inhalt ändert. Eine Liste, die man nicht steuern
 * kann, ist an der Stelle schlechter als eine, die man pflegen muss: Die
 * Übersicht soll die **wichtigen** Abschnitte zeigen, nicht alle.
 *
 * Verwendung: `<AbschnittsNavigation items={…} />` oben auf der Seite, und
 * jeder Abschnitt bekommt `<Sektion id="…">`. Die Ids stehen an einer Stelle
 * und werden von beiden benutzt, damit kein Anker ins Leere zeigt.
 */
export function AbschnittsNavigation({
  items,
  label,
  className,
}: {
  items: Abschnitt[];
  /** Zugänglicher Name, z. B. „Auf dieser Seite". */
  label: string;
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <nav data-abschnitts-navigation aria-label={label} className={cn("mb-8", className)}>
      <p className="ct-eyebrow mb-2 text-muted">{label}</p>
      <ul className="flex flex-wrap gap-x-2 gap-y-1">
        {items.map((a) => (
          <li key={a.id}>
            <a
              href={`#${a.id}`}
              className="inline-flex min-h-11 items-center rounded-ct-sm border border-border px-3 ct-label text-ink transition-colors hover:border-accent hover:text-accent-strong"
            >
              {a.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Ein Abschnitt mit Anker. `scroll-mt` hält die Überschrift nach dem Sprung
 * frei von der klebenden Kopfzeile — ohne das landet der Titel darunter und
 * man sieht, wo man ist, gerade nicht.
 */
export function Sektion({
  id,
  title,
  children,
  className,
}: {
  id: string;
  /** Sichtbare Überschrift. Sie trägt den Anker, nicht der Rahmen darum. */
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)}>
      {title && <h2 className="ct-h2 mb-4 text-ink">{title}</h2>}
      {children}
    </section>
  );
}
