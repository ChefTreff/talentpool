"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";

export type SidebarItem = { href: string; label: string };
export type SidebarGroup = { label: string; items: SidebarItem[] };

/**
 * Die Liste in der Navy-Leiste. Client-Komponente allein wegen `usePathname()`
 * — welcher Punkt aktiv ist, weiß ein Layout auf dem Server nicht.
 *
 * **Unter dem aktiven Punkt stehen die Abschnitte der Seite** (QS-026), solange
 * man auf ihr ist. Sie werden nicht ein zweites Mal gepflegt, sondern aus der
 * Übersicht gelesen, die die Seite ohnehin rendert (`AbschnittsNavigation`).
 * Eine zweite Liste derselben Abschnitte wäre beim ersten Umbenennen
 * auseinandergelaufen.
 *
 * Warum aus dem DOM und nicht über einen Context: Die Seiten sind Server-
 * Komponenten und liegen **unter** der Shell. Sie könnten ihre Abschnitte
 * nicht nach oben reichen, ohne dass jede Seite sie zusätzlich an das Layout
 * gibt — und dann stünden sie doch wieder zweimal.
 */
export function SidebarNav({
  label,
  groups,
  /** Pfad des Bereichseinstiegs; nur er markiert exakt, alle anderen mit Präfix. */
  rootHref,
}: {
  label: string;
  groups: SidebarGroup[];
  rootHref: string;
}) {
  const pathname = usePathname();
  const abschnitte = useSeitenAbschnitte(pathname);

  return (
    <nav aria-label={label} className="flex flex-col gap-5">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group, i) => (
          // Der Index als Schlüssel: zwei Gruppen dürfen dieselbe (auch leere)
          // Überschrift tragen, die Reihenfolge steht fest.
          <div key={`${group.label}-${i}`}>
            {/* Ein Bereich mit nur einer Liste braucht keine Überschrift über
                der Liste — der Bereichsname steht schon oben links. */}
            {group.label !== "" && (
              <h2 className="ct-eyebrow mb-2 px-2.5 text-on-navy-muted">{group.label}</h2>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === rootHref
                    ? pathname === rootHref
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-ct-sm px-2.5 py-1.5 ct-label transition-colors",
                        active
                          ? "bg-on-navy/15 text-on-navy"
                          : "text-on-navy-muted hover:bg-on-navy/10 hover:text-on-navy",
                      )}
                    >
                      {item.label}
                    </Link>
                    {active && abschnitte.length > 1 && (
                      <ul className="mt-0.5 flex flex-col gap-0.5 border-l border-on-navy/20 pl-2.5 ml-2.5">
                        {abschnitte.map((a) => (
                          <li key={a.id}>
                            <a
                              href={`#${a.id}`}
                              className="block rounded-ct-sm px-2.5 py-1 ct-help text-on-navy-muted transition-colors hover:bg-on-navy/10 hover:text-on-navy"
                            >
                              {a.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </nav>
  );
}

/**
 * Liest die Abschnitte aus der Übersicht, die die Seite rendert.
 *
 * Über einen `MutationObserver`, nicht einmalig: Bei einer Client-Navigation
 * wechselt der Pfad, bevor der neue Inhalt steht — ein einmaliges Auslesen
 * fände dann noch die Abschnitte der **vorigen** Seite. Der Beobachter meldet
 * sich, sobald der neue Inhalt da ist, und wird beim Verlassen abgeräumt.
 */
function useSeitenAbschnitte(pathname: string) {
  const [abschnitte, setAbschnitte] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    const lesen = () => {
      const liste = document.querySelector<HTMLElement>(
        '[data-abschnitts-navigation] a[href^="#"]',
      )?.closest("nav");
      const links = liste
        ? [...liste.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
        : [];
      setAbschnitte(
        links.map((a) => ({
          id: a.getAttribute("href")!.slice(1),
          label: a.textContent?.trim() ?? "",
        })),
      );
    };
    lesen();
    const ziel = document.getElementById("content");
    if (!ziel) return;
    const beobachter = new MutationObserver(lesen);
    beobachter.observe(ziel, { childList: true, subtree: true });
    return () => beobachter.disconnect();
  }, [pathname]);

  return abschnitte;
}
