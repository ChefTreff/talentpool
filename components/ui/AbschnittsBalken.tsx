"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { aktiverAbschnitt } from "@/components/ui/abschnitts-spion";
import type { Abschnitt } from "@/components/ui/Abschnitte";

/**
 * Ab diesem Abstand vom oberen Fensterrand gilt ein Abschnitt als erreicht. Ein Sprung über den Anker landet bei 80 px
 * (`scroll-mt-20` an `Sektion`, `Block` und `Card` mit `id`; der Balken ist 45 px hoch), die Linie liegt 16 px darunter, damit
 * Rundung den gerade angesprungenen Abschnitt nicht verfehlt.
 */
const LINIE = 96;

/**
 * „Auf dieser Seite“ als **klebender Balken** unter dem Seitenkopf (ADM-093, Vorschlag 10-09, Abschnitt 4) — die zweite Fassung von
 * `AbschnittsNavigation` (`variante="balken"`); die Seite wählt sie dort, nicht hier.
 *
 * * **Text mit Unterstrich, nicht Chips:** Chips gehören den Reitern (`SectionTabs`), die die Seite wechseln; der Balken springt nur
 *   innerhalb der Seite. Der Abschnitt im Bild trägt den Unterstrich in Akzent und `aria-current="location"`.
 * * **Welcher Abschnitt im Bild ist,** entscheidet `aktiverAbschnitt` beim Scrollen (eine Messung je Bild, kein Beobachter je
 *   Abschnitt); am Seitenende gilt der letzte.
 * * **Am Handy waagerecht scrollbar,** der Abschnitt im Bild rutscht in die Mitte der Leiste (ohne Animation bei
 *   `prefers-reduced-motion`); kein Umbruch, kein Menü.
 * * **Der Fokusring liegt innen** (`-outline-offset-2`), sonst schnitte ihn die scrollbare Leiste oben und unten ab.
 * * `data-abschnitts-navigation` bleibt, solange die Seitenleiste die Abschnitte als Unterpunkte liest (QS-026); ob sie danach
 *   entfallen, entscheidet Konrad (K-95).
 * * **Ankerziele bleiben unter dem Balken** ohne weiteres Zutun: `Sektion`, `Block` und `Card` mit `id` tragen `scroll-mt-20` (80 px),
 *   mehr als der Balken braucht. Eine zweite Regel an `html` (`scroll-padding-top`) verdoppelte den Abstand (gemessen: 152 px).
 */
export function AbschnittsBalken({ items, label, className }: { items: Abschnitt[]; label: string; className?: string }) {
  const [aktiv, setAktiv] = useState(0);
  const liste = useRef<HTMLUListElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  /** Nach einem Klick gilt der angeklickte Abschnitt, bis die Person selbst scrollt oder 1,5 s um sind — sonst überstimmte „am Ende gilt der letzte“ den Sprung zum vorletzten. */
  const gesperrtBis = useRef(0);
  const schluessel = items.map((a) => a.id).join("|");

  useEffect(() => {
    const ids = schluessel.split("|");
    let wartet = false;
    const pruefen = () => {
      wartet = false;
      if (performance.now() < gesperrtBis.current) return;
      const oberkanten = ids.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? null);
      const amEnde = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setAktiv(aktiverAbschnitt(oberkanten, LINIE, amEnde));
    };
    const melden = () => {
      if (wartet) return;
      wartet = true;
      requestAnimationFrame(pruefen);
    };
    const selbst = () => {
      gesperrtBis.current = 0;
    };
    pruefen();
    window.addEventListener("scroll", melden, { passive: true });
    window.addEventListener("resize", melden);
    for (const ereignis of ["wheel", "touchmove", "keydown"]) window.addEventListener(ereignis, selbst, { passive: true });
    return () => {
      window.removeEventListener("scroll", melden);
      window.removeEventListener("resize", melden);
      for (const ereignis of ["wheel", "touchmove", "keydown"]) window.removeEventListener(ereignis, selbst);
    };
  }, [schluessel]);

  useEffect(() => {
    const ul = liste.current;
    const a = links.current[aktiv];
    if (!ul || !a || ul.scrollWidth <= ul.clientWidth) return;
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ul.scrollTo({ left: a.offsetLeft - (ul.clientWidth - a.offsetWidth) / 2, behavior: ruhig ? "auto" : "smooth" });
  }, [aktiv]);

  return (
    <nav data-abschnitts-navigation data-abschnitts-balken aria-label={label} className={cn("sticky top-0 z-20 mb-8 border-b bg-canvas", className)}>
      <ul ref={liste} className="relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((a, i) => (
          <li key={a.id} className="shrink-0">
            <a
              ref={(el) => {
                links.current[i] = el;
              }}
              href={`#${a.id}`}
              aria-current={i === aktiv ? "location" : undefined}
              onClick={() => {
                gesperrtBis.current = performance.now() + 1500;
                setAktiv(i);
              }}
              className={cn(
                "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 ct-label transition-colors focus-visible:-outline-offset-2",
                i === aktiv ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {a.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
