"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Markdown } from "./Markdown";
import { useGespraech } from "./useGespraech";
import { MAX_FRAGE_ZEICHEN, type Quelle } from "@/lib/wiki/assistent";
import type { Zug } from "@/lib/wiki/gespraech";

type Strings = Record<string, string>;

/**
 * Chefi, der Wiki-Assistent — als Gespräch (ADM-044, PART-058).
 *
 * Vorher wirkte er wie ein durchsuchbares FAQ: eine Frage, ein Kasten mit
 * Antwort, Quellenblock und Hinweis, und die nächste Frage ersetzte alles.
 * Jetzt ist es ein Chat: Fragen und Antworten stehen untereinander, man kann
 * nachfragen („und bis wann?"), und das Gespräch bleibt bis zum Neustart —
 * über Seitenwechsel und Neuladen hinweg, bis der Tab schließt oder jemand
 * „Neues Gespräch" drückt (`useGespraech`, nur im Browser).
 *
 * Was bleibt, wie es war:
 *
 * * **Kein Treffer** ist kein Fehler. Dann sagt die Antwort genau das und zeigt,
 *   wen man stattdessen fragt — die Person, die ohnehin zuständig ist.
 * * **Kein Schlüssel hinterlegt:** die passenden Artikel werden trotzdem
 *   verlinkt. Lieber der richtige Artikel ohne Antwort als eine Fehlermeldung.
 * * **Zu viele Fragen:** eine ruhige Ansage, kein roter Alarm.
 *
 * Neu: **Fragevorschläge je Bereich** über dem leeren Gespräch (ein Speaker
 * sieht keine Partner-Themen), und unter jeder Antwort die Artikel, aus denen
 * sie stammt, als Links ins Wiki des Bereichs. Der Hinweis „fasst zusammen, im
 * Zweifel gilt der Artikel" ist weg (Konrad 21.09.).
 *
 * `rahmen="karte"` steht über den Artikeln der Wiki-Seite, `rahmen="panel"`
 * in der Bubble. Beide teilen sich das Gespräch.
 */
export function Assistent({
  audience,
  locale,
  kontakt,
  t,
  vorschlaege,
  wikiHref,
  besitzer,
  rahmen = "karte",
  sichtbar = true,
}: {
  audience: string;
  locale: string;
  /** Wen man fragt, wenn das Wiki nichts hergibt. */
  kontakt: { name: string; email: string } | null;
  t: Strings;
  /** Fragen, mit denen das leere Gespräch beginnen kann — je Bereich. */
  vorschlaege: string[];
  /** Die Wiki-Seite des Bereichs; ohne Angabe verweisen die Links auf diese Seite. */
  wikiHref: string | null;
  /** Kennung des Kontos — trennt die Gespräche, wenn sich im selben Tab jemand anderes anmeldet. */
  besitzer: string;
  rahmen?: "karte" | "panel";
  /** Ob die Ansicht gerade zu sehen ist — die Bubble meldet das Öffnen. */
  sichtbar?: boolean;
}) {
  const { zuege, laeuft, fragen, neu } = useGespraech({
    besitzer,
    zielgruppe: audience,
    sprache: locale,
    nichtsText: t.noHit,
  });
  const [eingabe, setEingabe] = useState("");
  const feldId = useId();
  const feld = useRef<HTMLInputElement>(null);
  const verlauf = useRef<HTMLDivElement>(null);

  // Die neueste Nachricht ins Bild — nur im Verlauf, nicht auf der ganzen
  // Seite. Auch beim Öffnen der Bubble: solange sie zu ist, hat der Verlauf
  // keine Höhe, und ein Scrollen davor ginge ins Leere.
  useEffect(() => {
    const el = verlauf.current;
    if (el && sichtbar) el.scrollTop = el.scrollHeight;
  }, [zuege.length, laeuft, sichtbar]);

  function absenden(text: string) {
    const frage = text.trim();
    if (!frage || laeuft) return;
    setEingabe("");
    void fragen(frage);
  }

  const leer = zuege.length === 0 && !laeuft;

  const gespraech = (
    <div
      ref={verlauf}
      role="log"
      aria-label={t.transcript}
      // Ein Bereich, der scrollt, muss mit der Tastatur erreichbar sein.
      tabIndex={leer ? undefined : 0}
      className={
        rahmen === "panel"
          ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          : "flex max-h-96 flex-col gap-3 overflow-y-auto"
      }
    >
      {zuege.map((z, i) => (
        <ZugAnsicht key={i} zug={z} t={t} kontakt={kontakt} wikiHref={wikiHref} />
      ))}
      {laeuft && <p className="ct-help mr-8">{t.thinking}</p>}
    </div>
  );

  const inhalt = (
    <>
      {leer && vorschlaege.length > 0 && (
        <div className="mt-4">
          <p className="ct-help">{t.suggestionsLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {vorschlaege.map((v) => (
              <Button
                key={v}
                variant="secondary"
                size="sm"
                onClick={() => {
                  absenden(v);
                  feld.current?.focus();
                }}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!leer && <div className={rahmen === "panel" ? "flex min-h-0 flex-1 flex-col" : "mt-4"}>{gespraech}</div>}

      <form
        className="mt-4 flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          absenden(eingabe);
        }}
      >
        <label htmlFor={feldId} className="sr-only">
          {t.label}
        </label>
        <Input
          ref={feld}
          id={feldId}
          value={eingabe}
          maxLength={MAX_FRAGE_ZEICHEN}
          placeholder={zuege.length === 0 ? t.placeholder : t.placeholderNext}
          onChange={(e) => setEingabe(e.target.value)}
          className="w-auto min-w-0 flex-1"
        />
        <Button type="submit" disabled={laeuft || eingabe.trim() === ""} loading={laeuft}>
          {t.ask}
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* Der Hinweis steht am Feld und nicht im Kleingedruckten: die Frage wird
            protokolliert (ohne Person), und wer hier eine Telefonnummer
            eintippt, soll es vorher wissen. */}
        <p className="ct-help">{t.privacy}</p>
        {zuege.length > 0 && (
          <Button variant="ghost" size="sm" disabled={laeuft} onClick={neu}>
            {t.reset}
          </Button>
        )}
      </div>
    </>
  );

  if (rahmen === "panel") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {leer && <p className="ct-help">{t.lead}</p>}
        {inhalt}
      </div>
    );
  }

  return (
    <Card className="mb-6">
      <h2 className="ct-h3 text-ink">{t.title}</h2>
      <p className="ct-help mt-1">{t.lead}</p>
      {inhalt}
    </Card>
  );
}

/** Ein Zug im Gespräch. Wer spricht, sagt die Seite in Form (Seite) und Farbe — und für Vorlesesoftware in Worten. */
function ZugAnsicht({
  zug,
  t,
  kontakt,
  wikiHref,
}: {
  zug: Zug;
  t: Strings;
  kontakt: { name: string; email: string } | null;
  wikiHref: string | null;
}) {
  if (zug.art === "frage") {
    return (
      <div className="ml-8 self-end rounded-ct-md bg-canvas p-3 ct-small text-ink">
        <span className="sr-only">{t.you}: </span>
        <span className="whitespace-pre-line">{zug.text}</span>
      </div>
    );
  }

  if (zug.art === "hinweis") {
    return (
      <p className="mr-8 self-start rounded-ct-md border bg-surface p-3 ct-small text-muted">
        {t[`error_${zug.schluessel}`] ?? t.error_unknown}
      </p>
    );
  }

  // Links stehen hier in `accent-deep`: `accent-strong`, die Farbe von
  // `.ct-link`, hat auf `accent-soft` nur 4,41:1 (gemessen, Soll 4,5).
  return (
    <div className="mr-8 self-start rounded-ct-md border border-accent-soft bg-accent-soft p-3 ct-small text-ink [&_.ct-link]:text-accent-deep">
      <span className="sr-only">{t.assistant}: </span>
      {zug.art === "antwort" && <Markdown source={zug.text} kompakt />}
      {zug.art === "abschnitte" && <p>{t.foundOnly}</p>}
      {zug.art === "nichts" && (
        <>
          <p>{t.noHit}</p>
          {kontakt && (
            <p className="mt-2">
              {t.askPerson}{" "}
              <a className="ct-link" href={`mailto:${kontakt.email}`}>
                {kontakt.name}
              </a>
            </p>
          )}
        </>
      )}
      {(zug.art === "antwort" || zug.art === "abschnitte") && zug.quellen.length > 0 && (
        <Artikel quellen={zug.quellen} label={t.inWiki} wikiHref={wikiHref} />
      )}
    </div>
  );
}

/**
 * Die Artikel hinter einer Antwort, als Links ins Wiki des Bereichs. Von einer
 * anderen Seite aus führt der Link auf die Wiki-Seite, und dort öffnet der
 * Anker den Artikel (`WikiView` liest ihn beim Laden).
 *
 * **Auf der Wiki-Seite selbst ein schlichter Anker**, kein `Link`: `Link`
 * setzt die Adresse über die History-API, und dabei feuert kein `hashchange` —
 * `WikiView` bekäme nicht mit, dass ein anderer Artikel gemeint ist.
 */
function Artikel({ quellen, label, wikiHref }: { quellen: Quelle[]; label: string; wikiHref: string | null }) {
  const pfad = usePathname();
  const hier = wikiHref === null || pfad === wikiHref;
  return (
    <p className="mt-2 ct-help">
      {label}{" "}
      {quellen.map((q, i) => {
        const anker = `#${encodeURIComponent(q.slug)}`;
        return (
          <span key={q.slug}>
            {i > 0 && " · "}
            {hier ? (
              <a className="ct-link" href={anker}>
                {q.title}
              </a>
            ) : (
              <Link className="ct-link" href={`${wikiHref}${anker}`}>
                {q.title}
              </Link>
            )}
          </span>
        );
      })}
    </p>
  );
}
