"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";

/**
 * Ein Unterpunkt, der innerhalb **derselben Seite** wechselt — über einen Abfrageparameter, nicht über einen
 * Pfad. `param` sagt, welcher Wert ihn aktiv macht; `standard`: er gilt auch, wenn der Parameter fehlt.
 */
export type SidebarKind = {
  href: string;
  label: string;
  count?: number;
  /** Vorlesetext zur Zahl („3 offen“); die sichtbare Zahl ist für Screenreader ausgeblendet. */
  countLabel?: string;
  param?: { name: string; value: string; standard?: boolean };
};
/** `count` und `kinder` sind Zugaben (ADM-080/081, Freigaben): ohne sie ist der Punkt, was er war. */
export type SidebarItem = { href: string; label: string; count?: number; countLabel?: string; kinder?: SidebarKind[] };
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

  // Drei Ebenen, jede an Farbe **und** Form erkennbar (QS-045, Konrad 24.09.:
  // „Ebenen hervorheben"): Gruppenköpfe als Versalienzeile im hellen Lila mit
  // Trennlinie darüber, Punkte in voller Schrift und eingerückt, der aktive
  // Punkt als helle Pille; die Abschnitte der Seite als dritte, kleinste Ebene
  // mit Linie links. Vorher standen Köpfe und Punkte im selben Grau und
  // unterschieden sich nur in der Grösse.
  return (
    <nav aria-label={label} className="flex flex-col gap-4">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group, i) => (
          // Der Index als Schlüssel: zwei Gruppen dürfen dieselbe (auch leere)
          // Überschrift tragen, die Reihenfolge steht fest.
          <div
            key={`${group.label}-${i}`}
            className={cn(i > 0 && group.label !== "" && "border-t border-on-navy/15 pt-4")}
          >
            {/* Ein Bereich mit nur einer Liste braucht keine Überschrift über
                der Liste — der Bereichsname steht schon oben links. */}
            {group.label !== "" && (
              <h2 className="ct-eyebrow mb-2 px-2.5 text-accent-soft">{group.label}</h2>
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
                        "flex items-center rounded-ct-sm py-1.5 pr-2.5 ct-label transition-colors pointer-coarse:min-h-11",
                        group.label !== "" ? "pl-4" : "pl-2.5",
                        active ? "bg-on-navy text-shell-ink" : "text-on-navy hover:bg-on-navy/10",
                      )}
                    >
                      {item.label}
                      {/* Der aktive Punkt ist eine helle Pille: Pink gilt nur auf dunklem Grund (Badge `highlight`),
                          dort nimmt die Zahl den Akzent-Ton. */}
                      {item.count !== undefined && item.count > 0 && (
                        <Zaehler count={item.count} label={item.countLabel} tone={active ? "accent" : "highlight"} />
                      )}
                    </Link>
                    {item.kinder && item.kinder.length > 0 && (
                      <Suspense fallback={null}>
                        <Unterpunkte kinder={item.kinder} elternAktiv={active} />
                      </Suspense>
                    )}
                    {active && abschnitte.length > 1 && (
                      <ul className="mt-0.5 flex flex-col gap-0.5 border-l border-on-navy/20 pl-2.5 ml-2.5">
                        {abschnitte.map((a) => (
                          <li key={a.id}>
                            <a
                              href={`#${a.id}`}
                              className="flex items-center rounded-ct-sm px-2.5 py-1 ct-help text-on-navy-muted transition-colors hover:bg-on-navy/10 hover:text-on-navy pointer-coarse:min-h-11"
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
 * Die Zahl wartender Einträge am Menüpunkt (ADM-080). Die sichtbare Zahl ist für Screenreader
 * ausgeblendet und durch den Vorlesetext ersetzt („3 offen“) — sonst läse er die Zahl zweimal oder
 * ohne Bezug. Zustand steht in Zahl und Wort, nicht in der Farbe allein.
 */
function Zaehler({ count, label, tone }: { count: number; label?: string; tone: "highlight" | "accent" | "text" }) {
  return (
    <>
      {/* Am Elternpunkt eine Pille (die Summe soll auffallen), an den Unterpunkten nur die Zahl: fünf rosa
          Pillen untereinander riefen fünfmal „dringend“ und machten die Leiste unruhig. */}
      <span aria-hidden="true" className="ml-auto pl-2">
        {tone === "text" ? <span className="ct-label tabular-nums">{count}</span> : <Badge tone={tone}>{count}</Badge>}
      </span>
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}

/**
 * Unterpunkte, die innerhalb **derselben Seite** wechseln (ADM-081: die Reiter der Freigaben im Menü).
 *
 * Aktiv ist ein Unterpunkt, wenn der Elternpunkt aktiv ist und der Abfrageparameter seinen Wert trägt.
 * Fehlt der Parameter — oder trägt er einen Wert, den kein Unterpunkt kennt —, wählt die Seite selbst
 * (`waehleArt`); dann gilt der Unterpunkt mit `standard`. Eigene Komponente, weil `useSearchParams`
 * eine Suspense-Grenze verlangt, ohne den Rest der Leiste an die Adresszeile zu hängen.
 */
function Unterpunkte({ kinder, elternAktiv }: { kinder: SidebarKind[]; elternAktiv: boolean }) {
  const suche = useSearchParams();
  return (
    <ul className="mt-0.5 ml-2.5 flex flex-col gap-0.5 border-l border-on-navy/20 pl-2.5">
      {kinder.map((k) => {
        const gesetzt = k.param ? suche.get(k.param.name) : null;
        const bekannt = k.param ? kinder.some((x) => x.param?.value === gesetzt) : false;
        const aktiv =
          elternAktiv && !!k.param && (bekannt ? gesetzt === k.param.value : k.param.standard === true);
        return (
          <li key={k.href}>
            <Link
              href={k.href}
              aria-current={aktiv ? "page" : undefined}
              className={cn(
                "flex items-center rounded-ct-sm px-2.5 py-1 ct-help transition-colors hover:bg-on-navy/10 hover:text-on-navy pointer-coarse:min-h-11",
                aktiv ? "bg-on-navy/10 font-semibold text-on-navy" : "text-on-navy-muted",
              )}
            >
              {k.label}
              {k.count !== undefined && k.count > 0 && <Zaehler count={k.count} label={k.countLabel} tone="text" />}
            </Link>
          </li>
        );
      })}
    </ul>
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
