"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  MAX_EINGABE_ZEICHEN,
  type Nachricht,
  type Vorschlag,
} from "@/lib/speaker/titel-assistent";

type Strings = Record<string, string>;

/**
 * Titel und Beschreibung im Gespräch finden (SPK-012).
 *
 * Konrad am 17.09.: „Speaker tun sich mit Titel und Beschreibung schwer."
 * Deshalb kein Formular mit Tipps, sondern ein Gespräch: beschreiben, was man
 * vorhat, einen Vorschlag bekommen, sagen was nicht passt.
 *
 * **Der Knopf „Übernehmen" ist der Punkt.** Ein Assistent, aus dem man Text
 * abtippen muss, ist ein Assistent, den niemand benutzt. Der Vorschlag wandert
 * mit einem Klick in die Felder darüber — geschickt wird er erst, wenn die
 * Person das Formular selbst absendet.
 *
 * Aufgeklappt wird er von Hand. Wer schon weiss, wie sein Vortrag heisst, soll
 * nicht an einem Assistenten vorbeischreiben müssen.
 */
export function TitelAssistent({
  format,
  language,
  onUebernehmen,
  t,
}: {
  format: string | null;
  language: "de" | "en";
  /** Trägt den Vorschlag in die Felder ein — gespeichert wird dort. */
  onUebernehmen: (v: Vorschlag) => void;
  t: Strings;
}) {
  const toast = useToast();
  const [offen, setOffen] = useState(false);
  const [verlauf, setVerlauf] = useState<Nachricht[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const endeRef = useRef<HTMLDivElement | null>(null);

  async function senden() {
    const text = eingabe.trim();
    if (!text || laeuft) return;

    const neu: Nachricht[] = [...verlauf, { role: "user", content: text }];
    setVerlauf(neu);
    setEingabe("");
    setHinweis(null);
    setLaeuft(true);
    try {
      const res = await fetch("/api/speaker/titel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: neu, language, format }),
      });
      if (res.status === 429) {
        setHinweis(t.rateLimited);
        return;
      }
      if (!res.ok) {
        setHinweis(t.failed);
        return;
      }
      const json = (await res.json()) as {
        answer: string | null;
        suggestion: Vorschlag | null;
        no_model?: boolean;
        failed?: boolean;
      };
      if (json.no_model) {
        setHinweis(t.noModel);
        return;
      }
      if (json.failed || !json.answer) {
        setHinweis(t.failed);
        return;
      }
      setVerlauf((v) => [...v, { role: "assistant", content: json.answer as string }]);
      if (json.suggestion) setVorschlag(json.suggestion);
      requestAnimationFrame(() => endeRef.current?.scrollIntoView({ block: "nearest" }));
    } catch {
      setHinweis(t.failed);
    } finally {
      setLaeuft(false);
    }
  }

  if (!offen) {
    return (
      <div className="mt-6 border-t pt-4">
        <h3 className="ct-label mb-1 text-ink">{t.title}</h3>
        <p className="ct-help">{t.teaser}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => setOffen(true)}>
          {t.open}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="ct-label text-ink">{t.title}</h3>
        <Button variant="ghost" size="sm" onClick={() => setOffen(false)}>
          {t.close}
        </Button>
      </div>
      <p className="ct-help mt-1">{t.intro}</p>

      {verlauf.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3" aria-live="polite">
          {verlauf.map((m, i) => (
            <li
              key={i}
              className={
                m.role === "user"
                  ? "rounded-ct-md bg-canvas p-3 ct-small"
                  : "rounded-ct-md border border-accent-soft bg-accent-soft p-3 ct-small text-accent-deep"
              }
            >
              <span className="ct-help block">
                {m.role === "user" ? t.you : t.assistant}
              </span>
              <span className="whitespace-pre-line">{m.content}</span>
            </li>
          ))}
          <div ref={endeRef} />
        </ul>
      )}

      {vorschlag && (
        <div className="mt-4 rounded-ct-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="accent">{t.suggestion}</Badge>
            <Button
              size="sm"
              onClick={() => {
                onUebernehmen(vorschlag);
                toast("success", t.taken);
              }}
            >
              {t.take}
            </Button>
          </div>
          <p className="ct-label mt-2 text-ink">{vorschlag.titel}</p>
          <p className="ct-small mt-1 whitespace-pre-line leading-6">{vorschlag.beschreibung}</p>
          <p className="ct-help mt-2">{t.takeHint}</p>
        </div>
      )}

      {hinweis && (
        <p role="alert" className="mt-4 rounded-ct-md border bg-canvas p-3 ct-small">
          {hinweis}
        </p>
      )}

      <div className="mt-4">
        <label className="ct-label" htmlFor="ta-eingabe">
          {verlauf.length === 0 ? t.firstPrompt : t.nextPrompt}
        </label>
        <Textarea
          id="ta-eingabe"
          rows={3}
          className="mt-2"
          maxLength={MAX_EINGABE_ZEICHEN}
          value={eingabe}
          placeholder={verlauf.length === 0 ? t.placeholder : t.placeholderNext}
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => {
            // Absenden mit Strg/Cmd + Enter: ein Textfeld mit mehreren Zeilen
            // darf nicht bei jedem Enter abschicken.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void senden();
            }
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => void senden()} loading={laeuft} disabled={!eingabe.trim()}>
            {verlauf.length === 0 ? t.start : t.refine}
          </Button>
          {verlauf.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={laeuft}
              onClick={() => {
                setVerlauf([]);
                setVorschlag(null);
                setHinweis(null);
              }}
            >
              {t.reset}
            </Button>
          )}
        </div>
        <p className="ct-help mt-3">{t.privacyNote}</p>
      </div>
    </div>
  );
}
