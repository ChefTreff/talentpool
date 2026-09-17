"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Markdown } from "./Markdown";
import { MAX_FRAGE_ZEICHEN, type Quelle } from "@/lib/wiki/assistent";

type Strings = Record<string, string>;

type Antwort =
  | { stand: "leer" }
  | { stand: "laeuft" }
  | { stand: "ohne_treffer" }
  | { stand: "da"; text: string | null; quellen: Quelle[]; ohneModell: boolean }
  | { stand: "fehler"; schluessel: string };

/**
 * Fragen an das Wiki.
 *
 * Steht **über** den Artikeln, weil die Frage der Einstieg ist: im Alt-Portal
 * war der Assistent auf beiden Hubs das Erste, was man sah. Wer lieber blättert,
 * scrollt einen Absatz weiter — wer eine konkrete Frage hat, tippt sie.
 *
 * Drei Zustände, die man sonst gern vergisst, und die hier den Ausschlag geben:
 *
 * * **Kein Treffer** ist kein Fehler. Dann sagt die Antwort genau das und zeigt,
 *   wen man stattdessen fragt — die Person, die ohnehin zuständig ist.
 * * **Kein Schlüssel hinterlegt** (der Assistent ist noch nicht freigeschaltet):
 *   die gefundenen Abschnitte werden trotzdem verlinkt. Lieber der richtige
 *   Artikel ohne Zusammenfassung als eine Fehlermeldung.
 * * **Zu viele Fragen**: eine ruhige Ansage mit der Zahl, kein roter Alarm.
 */
export function Assistent({
  audience,
  locale,
  kontakt,
  t,
}: {
  audience: string;
  locale: string;
  /** Wen man fragt, wenn das Wiki nichts hergibt. */
  kontakt: { name: string; email: string } | null;
  t: Strings;
}) {
  const [frage, setFrage] = useState("");
  const [antwort, setAntwort] = useState<Antwort>({ stand: "leer" });

  const laeuft = antwort.stand === "laeuft";

  async function fragen() {
    const text = frage.trim();
    if (text === "" || laeuft) return;
    setAntwort({ stand: "laeuft" });
    try {
      const res = await fetch("/api/wiki/frage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, audience, language: locale }),
      });
      const json = (await res.json()) as {
        hit?: boolean;
        answer?: string | null;
        sources?: Quelle[];
        no_model?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setAntwort({ stand: "fehler", schluessel: json.error ?? "unknown" });
        return;
      }
      if (!json.hit) {
        setAntwort({ stand: "ohne_treffer" });
        return;
      }
      setAntwort({
        stand: "da",
        text: json.answer ?? null,
        quellen: json.sources ?? [],
        ohneModell: Boolean(json.no_model),
      });
    } catch {
      setAntwort({ stand: "fehler", schluessel: "unknown" });
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="ct-h3 text-ink">{t.title}</h2>
      <p className="ct-help mt-1">{t.lead}</p>

      <form
        className="mt-4 flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void fragen();
        }}
      >
        <label htmlFor="wiki-frage" className="sr-only">
          {t.label}
        </label>
        <Input
          id="wiki-frage"
          value={frage}
          maxLength={MAX_FRAGE_ZEICHEN}
          placeholder={t.placeholder}
          onChange={(e) => setFrage(e.target.value)}
          className="min-w-64 grow"
        />
        <Button type="submit" disabled={laeuft || frage.trim() === ""} loading={laeuft}>
          {t.ask}
        </Button>
      </form>
      {/* Der Hinweis steht am Feld und nicht im Kleingedruckten: die Frage wird
          protokolliert (ohne Person), und wer hier eine Telefonnummer eintippt,
          soll es vorher wissen. */}
      <p className="ct-help mt-2">{t.privacy}</p>

      {antwort.stand === "ohne_treffer" && (
        <div className="mt-4 border-t pt-4">
          <p className="ct-small">{t.noHit}</p>
          {kontakt && (
            <p className="ct-small mt-2">
              {t.askPerson}{" "}
              <a className="ct-link" href={`mailto:${kontakt.email}`}>
                {kontakt.name}
              </a>
            </p>
          )}
        </div>
      )}

      {antwort.stand === "da" && (
        <div className="mt-4 border-t pt-4">
          {antwort.text ? (
            <Markdown source={antwort.text} />
          ) : (
            <p className="ct-small">{t.foundOnly}</p>
          )}
          {antwort.quellen.length > 0 && (
            <div className="mt-3">
              <p className="ct-eyebrow text-muted">{t.sources}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {antwort.quellen.map((q) => (
                  <li key={q.slug + (q.heading ?? "")}>
                    <a className="ct-link ct-small" href={`#${q.slug}`}>
                      {q.title}
                      {q.heading ? ` — ${q.heading}` : ""}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="ct-help mt-3">{t.disclaimer}</p>
        </div>
      )}

      {antwort.stand === "fehler" && (
        <p className="ct-small mt-4 border-t pt-4 text-error-ink">
          {t[`error_${antwort.schluessel}`] ?? t.error_unknown}
        </p>
      )}
    </Card>
  );
}
