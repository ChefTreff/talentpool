"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "./Badge";
import { Checkbox } from "./Checkbox";
import { cn } from "./cn";
import { SuchFeld } from "./SuchFeld";
import { gewaehlteBeschriftungen, nachListeSortiert, unbekannteWerte, type AuswahlOption } from "./auswahl";

export type { AuswahlOption };

type Gemeinsam = {
  id: string;
  options: AuswahlOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /**
   * Fehlerzustand wie bei `Input`: roter Rand. Die Fassung mit Suche setzt zusätzlich `aria-invalid`; ein Knopf
   * kennt das Attribut nicht — dort liest man die Meldung des `Field` über `describedBy`.
   */
  invalid?: boolean;
  /** Id des Hinweises oder der Meldung unter dem Feld (`Field` vergibt `<id>-hint` und `<id>-error`). */
  describedBy?: string;
};

type MitSuche = Gemeinsam & {
  aufklappbar?: false;
  /** Wonach gesucht wird, z. B. „Thema suchen". */
  placeholder?: string;
  /** `remove` mit `{label}`, z. B. „{label} entfernen". */
  t: { remove: string; noHits: string };
};

type Aufklappbar = Gemeinsam & {
  aufklappbar: true;
  /** Was zugeklappt dasteht, solange nichts gewählt ist („Offen für alle"). */
  leer: string;
  /** Beim Laden offen (wie bei `Block`). */
  offen?: boolean;
};

/**
 * Mehrere Einträge aus einer Liste wählen. **Zwei Gestalten, die Länge der Liste entscheidet:**
 *
 * - **Mit Suche** (Vorgabe, SPK-051): für lange Listen, etwa ab einem Dutzend Einträgen — die Themen einer
 *   Session, die Skills eines Wunschprofils. Was gewählt ist, steht als Marken über dem Feld; die Liste klappt
 *   auf, wenn man ins Feld geht, und schrumpft beim Tippen auf die Treffer.
 * - **Aufklappbar** (`aufklappbar`, PART-128): für kurze Listen, die zu *einer* Frage gehören — Status,
 *   Berufserfahrung, Studienrichtung. Zugeklappt steht **eine Zeile** da, so hoch wie ein Eingabefeld: was
 *   gewählt ist, in der Reihenfolge der Liste, ab zwei Einträgen mit der Zahl daneben; ist nichts gewählt,
 *   steht der Text aus `leer` da („Offen für alle"). Ein Klick öffnet die Kästchen darunter, alle auf einmal.
 *
 * Warum es die zweite Gestalt gibt: die Frage „Wen wünscht ihr euch?" der Company Tour zeigte 27 Kästchen auf
 * einmal (Status 10, Berufserfahrung 8, Studienrichtung 9) — am Handy 1064 px, mehr als einen Bildschirm, für
 * Angaben, die man meist offen lässt (gemessen am 08.10.2026, PART-128). Eine Suche hilft bei neun Einträgen
 * nicht. Sichtbar sein muss, **was gewählt ist**, nicht die Liste.
 *
 * Beschriftung wie bei jedem Feld über ihm (`Field` mit `htmlFor={id}`).
 */
export function MehrfachAuswahl(props: MitSuche | Aufklappbar) {
  return props.aufklappbar === true ? <AufklappAuswahl {...props} /> : <SuchAuswahl {...props} />;
}

/**
 * Die Fassung mit Suche (SPK-051).
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
 */
function SuchAuswahl({ id, options, value, onChange, placeholder, disabled, invalid, describedBy, t }: MitSuche) {
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

/**
 * Die aufklappbare Fassung (PART-128): ein Knopf mit der Zusammenfassung, darunter — nur wenn offen — die Kästchen.
 *
 * **Ein Aufklapp-Feld, keine Combobox.** Der Knopf trägt `aria-expanded` und `aria-controls`, die Kästchen sind
 * gewöhnliche `Checkbox`en in einer Gruppe, die nach dem Feld benannt ist. Es gibt kein Pfeiltasten-Modell und kein
 * Schließen beim Verlassen des Felds: die Liste steht im Fluss der Seite, nicht über ihr, und schiebt die folgenden
 * Felder nur nach unten. Das hat zwei Vorteile gegenüber der aufklappenden Liste der Fassung mit Suche — ein Dialog
 * oder ein Schubfach schneidet sie nie ab, und am Handy liegt kein Scrollbereich im Scrollbereich.
 *
 * **Die Wahl kommt immer in der Reihenfolge der Liste zurück** (`nachListeSortiert`): wer ein Kästchen abwählt und wieder
 * wählt, hat dieselbe Liste wie vorher, und ein Formular, das Listen vergleicht, sieht keine Änderung.
 *
 * Mit `disabled` bleibt der Knopf bedienbar — wer nichts ändern darf, kann trotzdem lesen, was gewählt ist; gesperrt sind
 * die Kästchen. Nur eine Liste ohne jeden Eintrag sperrt auch den Knopf: es gäbe nichts zu öffnen. Ein gewählter Wert,
 * den die Liste nicht (mehr) kennt, bekommt eine eigene Zeile mit seinem Schlüssel, damit er sich abwählen lässt.
 *
 * Die Beschriftung steht wie bei jedem Feld darüber (`Field` mit `htmlFor={id}`) und benennt den Knopf; die Zusammenfassung
 * hängt als Beschreibung an ihm. Die Zahl neben der Zeile ist nur für Augen (`aria-hidden`): die Zeile nennt alles beim Namen.
 * Das Zeichen dreht sich ohne Übergang (Skill-Regel 6).
 */
function AufklappAuswahl({ id, options, value, onChange, leer, offen = false, disabled, invalid, describedBy }: Aufklappbar) {
  const basis = useId();
  const listeId = `${basis}-liste`;
  const zeileId = `${basis}-zeile`;
  const [auf, setAuf] = useState(offen);

  const beschriftungen = gewaehlteBeschriftungen(options, value);
  const zeilen = [...options, ...unbekannteWerte(options, value).map((v) => ({ value: v, label: v }))];
  const text = beschriftungen.join(", ");

  function umschalten(v: string) {
    onChange(nachListeSortiert(options, value.includes(v) ? value.filter((x) => x !== v) : [...value, v]));
  }

  return (
    <div className={cn("rounded-ct-md border", invalid ? "border-error" : "border-border-strong", disabled ? "bg-surface-hover" : "bg-surface")}>
      <button
        type="button"
        id={id}
        aria-expanded={auf}
        aria-controls={listeId}
        aria-describedby={[zeileId, describedBy].filter(Boolean).join(" ")}
        disabled={zeilen.length === 0}
        onClick={() => setAuf((a) => !a)}
        className={cn("flex h-10 w-full items-center gap-2 px-3 text-left pointer-coarse:min-h-11 hover:bg-surface-hover", auf ? "rounded-t-ct-md" : "rounded-ct-md")}
      >
        <span id={zeileId} className={cn("min-w-0 flex-1 truncate leading-6", text && !disabled ? "text-ink" : "text-muted")}>
          {text || leer}
        </span>
        {beschriftungen.length > 1 && (
          <span aria-hidden className="shrink-0">
            <Badge tone="accent">{beschriftungen.length}</Badge>
          </span>
        )}
        <svg
          viewBox="0 0 12 12"
          className={cn("h-3 w-3 shrink-0 text-muted", auf && "rotate-180")}
          aria-hidden
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>
      <div id={listeId} hidden={!auf}>
        <div role="group" aria-labelledby={id} className="border-t border-border px-3 py-1 sm:columns-2 sm:gap-x-6 sm:px-4">
          {zeilen.map((o) => (
            <Checkbox
              key={o.value}
              label={o.label}
              checked={value.includes(o.value)}
              disabled={disabled}
              onChange={() => umschalten(o.value)}
              className="break-inside-avoid py-2"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Gross/klein und Akzente egal: „okonomie" findet „Ökonomie". */
function normalisieren(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
