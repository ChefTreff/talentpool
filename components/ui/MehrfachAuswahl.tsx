"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "./cn";
import { SuchFeld } from "./SuchFeld";

export type AuswahlOption = { value: string; label: string };

/**
 * Mehrere Einträge aus einer langen Liste wählen — mit Suche (SPK-051).
 *
 * Konrad am 24.09. zu den Themen einer Session: siebzehn Kästchen auf einmal
 * „erschlagen". Hier steht deshalb nur, was gewählt ist, als Marken über dem
 * Feld; die Liste klappt erst auf, wenn man ins Feld geht, und schrumpft beim
 * Tippen auf die Treffer.
 *
 * Kein `<select multiple>`: auf dem Telefon nicht zu bedienen, und was gewählt
 * ist, sieht man darin nicht (dieselbe Begründung wie bei SPK-027).
 *
 * **Zugänglich als Combobox mit Listbox** (WAI-ARIA-Muster): das Feld trägt
 * `role="combobox"`, die Liste `role="listbox"` mit `aria-multiselectable`,
 * die aktive Zeile hängt über `aria-activedescendant` am Feld — der Fokus
 * bleibt beim Tippen im Feld. Tastatur: Pfeile wandern, Enter wählt oder
 * entfernt, Escape schliesst, Rücktaste im leeren Feld nimmt die letzte Marke
 * weg. Ein Klick in die Liste hält sie offen, damit man mehrere wählen kann;
 * nach dem Wählen leert sich die Suche.
 *
 * Beschriftung wie bei jedem Feld über ihm (`Field` mit `htmlFor={id}`).
 */
export function MehrfachAuswahl({
  id,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
  describedBy,
  t,
}: {
  id: string;
  options: AuswahlOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Wonach gesucht wird, z. B. „Thema suchen". */
  placeholder?: string;
  disabled?: boolean;
  /** Fehlerzustand wie bei `Input` (roter Rand, `aria-invalid`). */
  invalid?: boolean;
  /** Id des Hinweises unter dem Feld (`Field` vergibt `<id>-hint`). */
  describedBy?: string;
  /** `remove` mit `{label}`, z. B. „{label} entfernen". */
  t: { remove: string; noHits: string };
}) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const labelOf = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const treffer = useMemo(() => {
    const q = normalisieren(query.trim());
    return q ? options.filter((o) => normalisieren(o.label).includes(q)) : options;
  }, [options, query]);

  function umschalten(v: string) {
    const dazu = !value.includes(v);
    onChange(dazu ? [...value, v] : value.filter((x) => x !== v));
    // Nach dem Wählen steht wieder die ganze Liste da — wer „KI" gesucht und
    // genommen hat, sucht als Nächstes etwas anderes, nicht noch einmal „KI".
    if (dazu && query !== "") {
      setQuery("");
      setActive(0);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const schritt = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (treffer.length === 0 ? 0 : (a + schritt + treffer.length) % treffer.length));
    } else if (e.key === "Enter") {
      // Nie das Formular abschicken, während man in der Liste wählt.
      e.preventDefault();
      const o = treffer[active];
      if (open && o) umschalten(o.value);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const aktiveId = open && treffer[active] ? `${listId}-${active}` : undefined;

  return (
    <div
      ref={wrap}
      className="relative"
      // Schliessen, sobald der Fokus die ganze Auswahl verlässt — nicht schon,
      // wenn er vom Feld auf eine Marke springt.
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((v) => {
            const label = labelOf.get(v) ?? v;
            return (
              <li key={v}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => umschalten(v)}
                  aria-label={t.remove.replace("{label}", label)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-ct-md border border-accent bg-accent-soft px-3 ct-label text-accent-deep transition-colors hover:border-accent-strong disabled:opacity-60"
                >
                  {label}
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden
                    focusable="false"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SuchFeld
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={aktiveId}
        aria-describedby={describedBy}
        invalid={invalid}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={query}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-ct-md border bg-surface py-1 shadow-sm"
        >
          {treffer.length === 0 ? (
            <li className="px-3 py-2 ct-help">{t.noHits}</li>
          ) : (
            treffer.map((o, i) => {
              const gewaehlt = value.includes(o.value);
              return (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={gewaehlt}
                  // Den Fokus im Feld lassen: ohne das wäre die Liste nach dem
                  // ersten Klick schon wieder zu.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => umschalten(o.value)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 ct-label text-ink transition-colors",
                    i === active && "bg-surface-hover",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-ct-sm border-2",
                      gewaehlt ? "border-accent bg-accent text-surface" : "border-border-strong",
                    )}
                  >
                    {gewaehlt && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                      </svg>
                    )}
                  </span>
                  {o.label}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/** Gross/klein und Akzente egal: „okonomie" findet „Ökonomie". */
function normalisieren(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
