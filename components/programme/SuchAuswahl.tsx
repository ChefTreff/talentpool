"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export type Treffer = { id: string; name: string; hint: string | null };

/**
 * Eine Person oder Organisation per Suche auswählen — genau eine (LEAD-019).
 *
 * Für Moderation und Partner am Slot. Die Mehrfachauswahl der Speaker bleibt
 * eigen, weil sie Reihenfolge und Bestätigung trägt; hier gibt es nur „wer"
 * oder „niemand".
 *
 * **Gewählt ist, was als Karte darüber steht**, nicht was im Feld steht: das
 * Feld ist zum Suchen da. Wer eine Auswahl ändern will, nimmt sie erst weg —
 * so wird nie aus Versehen jemand ersetzt, weil man im Feld weitertippt.
 */
export function SuchAuswahl({
  id,
  label,
  hint,
  value,
  disabled,
  suchen,
  onChange,
  t,
}: {
  id: string;
  label: string;
  hint?: string;
  value: { id: string; name: string | null } | null;
  disabled?: boolean;
  suchen: (query: string) => Promise<Treffer[]>;
  onChange: (next: Treffer | null) => void;
  t: { remove: string; noHits: string };
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Treffer[]>([]);
  const [gesucht, setGesucht] = useState(false);

  // Mit kleiner Verzögerung, damit nicht jeder Tastendruck eine Anfrage wird
  // — wie bei der Speakersuche daneben.
  useEffect(() => {
    const handle = setTimeout(() => {
      const term = query.trim();
      if (term.length < 2) {
        setHits([]);
        setGesucht(false);
        return;
      }
      void suchen(term).then((h) => {
        setHits(h);
        setGesucht(true);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, suchen]);

  if (value) {
    return (
      <Field label={label} htmlFor={id} hint={hint}>
        <span className="inline-flex w-fit items-center gap-2 rounded-ct-md border bg-surface px-2.5 py-1.5 ct-small">
          <span id={id}>{value.name ?? "—"}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label={`${t.remove}: ${value.name ?? ""}`}
            className="text-muted hover:text-error-ink disabled:opacity-60"
          >
            ×
          </button>
        </span>
      </Field>
    );
  }

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {hits.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(h);
                  setQuery("");
                  setHits([]);
                  setGesucht(false);
                }}
                className="w-full rounded-ct-sm px-2 py-1 text-left ct-small hover:bg-surface-hover"
              >
                {h.name}
                {h.hint && <span className="ct-help"> · {h.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        // Ohne diesen Satz sieht „nichts gefunden" genauso aus wie „sucht noch"
        // — und genau das hiess im Board bisher „die Suche funktioniert nicht".
        gesucht && <p className="ct-help mt-2">{t.noHits}</p>
      )}
    </Field>
  );
}
