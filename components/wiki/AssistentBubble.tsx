"use client";

import { useEffect, useRef, useState } from "react";
import { Assistent } from "./Assistent";

type Strings = Record<string, string>;

/**
 * Der Einstieg zum Wiki-Assistenten auf **jeder** Seite eines Bereichs
 * (QS-028). Vorher hing er allein an der Wiki-Seite: wer auf der Checkliste
 * eine Frage hatte, musste erst wissen, dass es ihn gibt, und dorthin
 * wechseln. Im Alt-Portal war er das Erste, was man sah.
 *
 * **Nur der Rahmen gehört hierher.** Was der Assistent antwortet und wie das
 * Gespräch läuft, steht in `Assistent` (ADM-044); diese Komponente bettet ihn
 * ein. Seit dem Umbau zum Chat ist das Panel eine Spalte: oben der Kopf, in
 * der Mitte der Verlauf, der allein scrollt, unten das Eingabefeld, das immer
 * zu sehen bleibt.
 *
 * Das Panel ist ein `popover="auto"`: es liegt im Top-Layer, also über
 * Dialogen und über dem Toast-Streifen, schliesst bei Klick daneben und mit
 * Escape — und es ist **nicht modal**. Wer etwas nachschlägt, will die Seite
 * daneben weiterlesen können; ein `<dialog showModal>` würde sie sperren.
 *
 * Unter 640 px nimmt das Panel die Breite des Bildschirms: ein 380 px breites
 * Fenster in einer 375-px-Ansicht stünde halb draussen.
 */
export function AssistentBubble({
  audience,
  locale,
  t,
  openLabel,
  closeLabel,
  title,
  vorschlaege,
  wikiHref,
  besitzer,
}: {
  audience: string;
  locale: string;
  /** Die Texte des Assistenten selbst (`t.wikiAssistent`). */
  t: Strings;
  /** Beschriftung des Knopfes für Vorlesesoftware, z. B. „Frage stellen". */
  openLabel: string;
  closeLabel: string;
  title: string;
  /** Fragevorschläge des Bereichs. */
  vorschlaege: string[];
  /** Die Wiki-Seite des Bereichs, für die Links unter den Antworten. */
  wikiHref: string;
  /** Kennung des Kontos, siehe `Assistent`. */
  besitzer: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [offen, setOffen] = useState(false);

  // Der Zustand des Popovers lebt im Browser, nicht in React. Beide
  // auseinanderlaufen zu lassen wäre der häufigste Fehler an dieser Stelle:
  // Escape schliesst das Panel, ohne dass React davon erfährt, und der Knopf
  // meldete danach dauerhaft „geöffnet".
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const beiWechsel = (e: Event) =>
      setOffen((e as ToggleEvent).newState === "open");
    el.addEventListener("toggle", beiWechsel);
    return () => el.removeEventListener("toggle", beiWechsel);
  }, []);

  function umschalten() {
    const el = panel.current;
    if (!el || typeof el.togglePopover !== "function") return;
    el.togglePopover();
  }

  return (
    <>
      <button
        type="button"
        onClick={umschalten}
        aria-expanded={offen}
        aria-label={openLabel}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-strong text-on-navy shadow-sm transition-colors hover:bg-accent-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-4.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z" />
        </svg>
      </button>

      <div
        ref={panel}
        popover="auto"
        aria-label={title}
        className="fixed inset-x-2 bottom-24 top-auto m-0 max-h-[70dvh] w-auto flex-col rounded-ct-lg border bg-surface p-5 open:flex sm:inset-x-auto sm:right-4 sm:w-95"
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
          <h2 className="ct-h3 text-ink">{title}</h2>
          <button
            type="button"
            onClick={umschalten}
            className="rounded-ct-sm px-2 py-1 ct-label text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            {closeLabel}
          </button>
        </div>
        {/* Der Ansprechpartner steht hier nicht: ihn zu laden hiesse, auf
            jeder Seite eine Abfrage mehr zu fahren, nur für den Fall, dass
            jemand das Panel öffnet. Wer ihn braucht, findet ihn im Wiki und
            auf der Kontaktseite. */}
        <Assistent
          audience={audience}
          locale={locale}
          kontakt={null}
          t={t}
          vorschlaege={vorschlaege}
          wikiHref={wikiHref}
          besitzer={besitzer}
          rahmen="panel"
          sichtbar={offen}
        />
      </div>
    </>
  );
}
