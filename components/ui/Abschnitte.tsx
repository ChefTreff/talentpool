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
 * **Sie ist als Menü zu erkennen** (QS-042, Konrad 24.09.: „farblich
 * hervorheben, sodass sie sofort als Menü erkennbar ist — der erste visuelle
 * Anker der Seite"). Vorher stand sie als graue Zeile mit Umriss-Knöpfen auf
 * dem Seitengrund und ging zwischen Titel und erster Karte unter. Jetzt liegt
 * sie auf einer Akzent-Soft-Fläche, die Einträge sind weisse Knöpfe mit einem
 * Pfeil nach unten: eine Fläche, die sich vom Grund **und** von den Karten
 * abhebt, und ein Zeichen, das sagt, dass der Link auf dieser Seite bleibt.
 * Gemessen: Text `accent-deep` auf Weiss 6,82:1, Zeile darüber auf der Fläche
 * 5,65:1.
 *
 * Verwendung: `<AbschnittsNavigation items={…} />` direkt unter dem
 * Seitenkopf, und jeder Abschnitt bekommt `<Sektion id="…">` (oder eine Karte
 * mit `id`). Die Ids stehen an einer Stelle und werden von beiden benutzt,
 * damit kein Anker ins Leere zeigt. Die Seitenleiste liest dieselbe Liste und
 * zeigt sie als eingerückte Unterpunkte (`SidebarNav`).
 */
export function AbschnittsNavigation({
  items,
  label,
  className,
}: {
  items: Abschnitt[];
  /** Zugänglicher Name, z. B. „Auf dieser Seite" (`common.onThisPage`). */
  label: string;
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <nav
      data-abschnitts-navigation
      aria-label={label}
      className={cn("mb-8 rounded-ct-lg bg-accent-soft px-4 py-3 sm:px-5", className)}
    >
      <p className="ct-eyebrow mb-2 text-accent-deep">{label}</p>
      <ul className="flex flex-wrap gap-2">
        {items.map((a) => (
          <li key={a.id}>
            <a
              href={`#${a.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-ct-md border border-transparent bg-surface px-3 ct-label text-accent-deep transition-colors hover:border-accent hover:text-accent-strong"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0"
                aria-hidden
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3v10m0 0-4-4m4 4 4-4" />
              </svg>
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
