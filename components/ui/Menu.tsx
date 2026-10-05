"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Aufklappmenü für Kopfzeile und Seitenleiste — Profilmenü, Portalauswahl.
 *
 * Kein `<dialog>`: ein Menü ist keine Fokusfalle, man muss mit Tab hinaus- und
 * weiterkommen. Deshalb ein eigenes Aufklappen mit den drei Dingen, die ein
 * Menü braucht und die man sonst vergisst: **Escape** schliesst und gibt den
 * Fokus zurück, ein **Klick daneben** schliesst, und der Auslöser sagt über
 * `aria-expanded`, in welchem Zustand er ist.
 *
 * Die Einträge kommen vom Aufrufer. Damit die Tastatur funktioniert, sind es
 * echte `<a>` oder `<button>` — nichts mit `role="menuitem"` nachgebaut.
 */
export function Menu({
  trigger,
  label,
  align = "start",
  width = "w-56",
  ton = "navy",
  children,
}: {
  /** Inhalt des Auslösers (Name, Avatar, Bereichsname). */
  trigger: ReactNode;
  /** Zugänglicher Name des Auslösers, wenn der Inhalt nur Bild ist. */
  label: string;
  align?: "start" | "end";
  width?: string;
  /**
   * Auf welchem Grund der Auslöser steht: `navy` (Vorgabe: Kopfzeile und Seitenleiste, Hover als Aufhellung)
   * oder `hell` (Fenster, Karte, Seite: der Auslöser hat einen Rand und eine Hover-Fläche wie ein
   * zweitrangiger Knopf, LEAD-055 „Weitere Aktionen“).
   */
  ton?: "navy" | "hell";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const knopf = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      knopf.current?.focus();
    }
    function beiKlick(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", beiTaste);
    document.addEventListener("mousedown", beiKlick);
    return () => {
      document.removeEventListener("keydown", beiTaste);
      document.removeEventListener("mousedown", beiKlick);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrap}>
      <button
        ref={knopf}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 text-left transition-colors",
          ton === "hell"
            ? "min-h-10 rounded-ct-md border border-border-strong bg-surface px-3 ct-label text-ink hover:bg-surface-hover pointer-coarse:min-h-11"
            : "min-h-11 rounded-ct-sm px-2 py-1.5 hover:bg-on-navy/10",
        )}
      >
        {trigger}
        {ton === "hell" && (
          // Der Pfeil sagt „hier klappt etwas auf“ — ohne ihn sah der Auslöser neben einem Hauptknopf wie ein
          // zweiter, gleichrangiger Knopf aus (LEAD-055).
          <svg
            aria-hidden
            focusable="false"
            viewBox="0 0 12 12"
            className={cn("h-3 w-3 shrink-0 text-accent transition-transform duration-150", open && "rotate-180")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        )}
      </button>

      {open && (
        <div
          id={id}
          role="menu"
          // Der Inhalt schliesst beim Klick: jeder Eintrag führt woandershin,
          // ein offenes Menü über der neuen Seite wäre ein Fehler.
          onClick={() => setOpen(false)}
          className={cn(
            "absolute z-30 mt-1 overflow-hidden rounded-ct-md border bg-surface py-1 shadow-sm",
            width,
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Ein Eintrag im Menü. `as` entscheidet, ob Link oder Knopf. */
export function MenuItem({
  children,
  href,
  onSelect,
  icon,
  current,
}: {
  children: ReactNode;
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
  /** Aktueller Eintrag — trägt `aria-current`, nicht nur eine Farbe. */
  current?: boolean;
}) {
  const klassen = cn(
    "flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left ct-label transition-colors",
    current ? "bg-surface-hover text-ink" : "text-muted hover:bg-surface-hover hover:text-ink",
  );
  if (href) {
    return (
      <a href={href} role="menuitem" aria-current={current ? "page" : undefined} className={klassen}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onSelect} className={klassen}>
      {icon}
      {children}
    </button>
  );
}

/** Trennlinie zwischen Gruppen im Menü. */
export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t" />;
}
