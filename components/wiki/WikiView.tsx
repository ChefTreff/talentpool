"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { cn } from "@/components/ui/cn";
import { THEMA_TEXT, gruppiereNachKategorie, wikiKategorie } from "@/lib/wiki/kategorien";
import { leseAnker } from "./anker";
import { Markdown } from "./Markdown";
import { abschnitte } from "./markdown-parse";
import type { KbArticle } from "./types";

type Strings = Record<string, string>;

/** Ab so vielen Abschnitten lohnt „Auf diesem Artikel“ — darunter ist der Text kürzer als die Übersicht. */
const MIN_ABSCHNITTE = 4;

/** Wie viele Artikel „Mehr zu …“ höchstens nennt. */
const MAX_VERWANDT = 5;

/** Unter 1024 px steht entweder die Liste oder der Artikel (wie `lg:` im Markup). */
const DESKTOP = "(min-width: 1024px)";
const istDesktop = () => window.matchMedia(DESKTOP).matches;
function abonniereBreite(melde: () => void) {
  const m = window.matchMedia(DESKTOP);
  m.addEventListener("change", melde);
  return () => m.removeEventListener("change", melde);
}

/**
 * Das Wiki im Bereich: links die Artikel nach Thema, rechts der gelesene.
 *
 * **Themen statt Phasen** (PART-058, Konrad 21./24.09.: „bessere
 * Kategorisierung statt Phasen“). Die Liste ist nach Aufgaben gruppiert
 * (`lib/wiki/kategorien.ts`); die Phase steht weiter als Marke am geöffneten
 * Artikel, ist aber kein Weg mehr, ihn zu finden. Der Name ist bewusst
 * „Thema“, nicht „Kategorie“: Im Admin heißt die Zielgruppe eines Artikels
 * schon so („Die Kategorie steuert, wer den Artikel sieht“).
 *
 * Gesucht wird über Titel **und** Text — wer „Parkplatz" tippt, sucht nicht
 * die Überschrift, sondern die Antwort. Die Trefferzahl steht als Statusmeldung
 * da, damit sie auch Vorlesesoftware erreicht.
 *
 * **Am Handy Liste oder Artikel, nie beides übereinander.** Vorher stand der
 * Artikel unter einer 26 Einträge langen Liste: ein Tipp auf einen Titel
 * änderte scheinbar nichts, weil die Antwort weit unten stand. Jetzt ersetzt
 * der Artikel die Liste, „Alle Artikel“ führt zurück, und der Fokus folgt
 * (Titel des Artikels bzw. der zuletzt gelesene Eintrag der Liste). Ab 1024 px
 * stehen beide nebeneinander, und der erste Artikel ist offen.
 *
 * **Die Adresse ist die Kennung des Artikels** (`#slug`, so verlinken die
 * Quellen des Assistenten) — `#slug/abschnitt` springt in einen Abschnitt.
 * „Auf diesem Artikel“ nutzt dafür die Übersicht des Kits, ihre Anker tragen
 * den Artikel mit.
 *
 * **Der Artikel ist die Seite** (PART-104, Konrad 08.10.2026, K-73): sein Titel ist der
 * Seitentitel (`h1`, über dem Artikel und der Liste), darunter Thema und Stand, in der Karte
 * folgen die Abschnitte als `h2` und die Unterabschnitte als `h3` (`Markdown`). „Wiki“ bleibt der
 * Titel, solange am Handy die Liste steht, und steht schon in der Seitenleiste. Der Titel hängt
 * damit vom offenen Artikel ab — deshalb zog der Seitenkopf aus `WikiPage` (Server) hierher. Beide
 * Köpfe stehen im Markup, einer davon ist per CSS ausgeblendet (wie die zwei Fassungen von „Auf
 * diesem Artikel“): so springt beim Laden nichts, und für Vorlesesoftware gibt es immer genau einen.
 * Der gewählte Artikel trägt in der Liste einen Balken links in Akzent und weiße Fläche — vorher
 * war es `bg-surface-hover` auf dem Seitengrund, Kontrast 1,03 : 1.
 */
export function WikiView({
  articles,
  phases,
  locale,
  lead,
  assistent,
  t,
}: {
  articles: KbArticle[];
  /** Beschriftungen der Phasen aus dem Vokabular. */
  phases: Record<string, string>;
  /** Sprache der Seite — Artikel, die davon abweichen, werden gekennzeichnet. */
  locale: string;
  /**
   * Der Einleitungssatz (beim Partner mit dem Satz zum Produktfilter): unter „Wiki“, solange am
   * Handy die Liste steht, und ab 1024 px über der Suche.
   */
  lead: string;
  /** Der Assistent: steht in der Liste, unter der Suche (K-92); ohne Artikel unter dem Seitenkopf. */
  assistent?: ReactNode;
  t: Strings;
}) {
  const [query, setQuery] = useState("");
  // Server und erster Aufbau: Handy. Danach die echte Breite — und sie folgt dem Drehen des Geräts.
  const desktop = useSyncExternalStore(abonniereBreite, istDesktop, () => false);
  // `null`: nichts gewählt. Am Handy zeigt das die Liste, ab 1024 px den ersten Artikel.
  const [openId, setOpenId] = useState<string | null>(null);

  const titelRef = useRef<HTMLHeadingElement>(null);
  /** Wohin der Fokus nach dem Wechsel soll (nur am Handy gesetzt). */
  const fokusZiel = useRef<"titel" | "liste" | null>(null);
  /** Zuletzt gelesener Eintrag — dorthin springt der Fokus bei „Alle Artikel“. */
  const zuletzt = useRef<string | null>(null);
  /** Abschnitt, der nach dem Öffnen eines anderen Artikels angesteuert wird (Adresse mit `/abschnitt`). */
  const abschnittZiel = useRef<string | null>(null);
  const offenRef = useRef<string | null>(null);
  useEffect(() => {
    offenRef.current = openId;
  });

  /**
   * Der Anker in der Adresse öffnet den Artikel.
   *
   * Die Quellenangaben des Assistenten verweisen auf `#slug`. Ohne diese
   * Kopplung wäre das ein Link ins Leere: rechts steht immer nur **ein**
   * Artikel, es gibt also kein Sprungziel im Dokument. Nebenbei wird damit
   * jeder Artikel verlinkbar — auch aus einer Mail.
   */
  useEffect(() => {
    const ausAdresse = () => {
      const anker = leseAnker(window.location.hash);
      if (!anker) return;
      const treffer = articles.find((a) => a.slug === anker.slug);
      if (!treffer) return;
      if (treffer.id !== offenRef.current) {
        // Springt die Adresse in den Artikel, der schon offen ist, hat der Browser
        // den Abschnitt selbst angesteuert. Nur wo erst geöffnet werden muss, wird
        // das Ziel gemerkt und nach dem Zeichnen angesprungen.
        if (anker.abschnitt) abschnittZiel.current = `${treffer.slug}/${anker.abschnitt}`;
        if (!istDesktop()) fokusZiel.current = "titel";
      }
      setOpenId(treffer.id);
    };
    ausAdresse();
    window.addEventListener("hashchange", ausAdresse);
    return () => window.removeEventListener("hashchange", ausAdresse);
  }, [articles]);

  // Nach dem Wechsel: Fokus setzen bzw. den Abschnitt der Adresse ansteuern.
  useEffect(() => {
    const ziel = fokusZiel.current;
    fokusZiel.current = null;
    if (ziel === "titel") {
      window.scrollTo({ top: 0 });
      titelRef.current?.focus();
    } else if (ziel === "liste" && zuletzt.current) {
      document.getElementById(`wiki-artikel-${zuletzt.current}`)?.focus();
    }
    const abschnitt = abschnittZiel.current;
    abschnittZiel.current = null;
    if (abschnitt) document.getElementById(abschnitt)?.scrollIntoView();
  }, [openId]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (!needle) return true;
      return `${a.title} ${a.body_md}`.toLowerCase().includes(needle);
    });
  }, [articles, query]);

  const gruppen = useMemo(() => gruppiereNachKategorie(visible, locale), [visible, locale]);
  const themen = useMemo(() => gruppiereNachKategorie(articles, locale), [articles, locale]);

  // Ohne Auswahl ist der erste Eintrag **der angezeigten Liste** offen (ab 1024 px), nicht der
  // erste der Rohliste: sonst stünde oben links ein anderer Titel als rechts im Artikel.
  const erster = gruppen[0]?.artikel[0] ?? null;
  const open = visible.find((a) => a.id === openId) ?? erster;
  /** Am Handy ersetzt der Artikel die Liste, sobald einer gewählt wurde. */
  const imArtikel = openId !== null && visible.some((a) => a.id === openId);

  /**
   * Der Eintrag, dessen Artikel gerade zu sehen ist. Am Handy ist das nur nach einer
   * Wahl so; ohne sie steht dort die Liste, und ein hervorgehobener erster Eintrag
   * täuschte eine Auswahl vor.
   */
  const markiert = (id: string) => open?.id === id && (desktop || imArtikel);

  const thema = open ? wikiKategorie(open) : null;
  const themaName = thema ? t[THEMA_TEXT[thema]] : "";
  const verwandt = useMemo(() => {
    if (!open || !thema) return [];
    const gruppe = themen.find((g) => g.kategorie === thema);
    return (gruppe?.artikel ?? []).filter((a) => a.id !== open.id).slice(0, MAX_VERWANDT);
  }, [open, thema, themen]);
  const abschnittsListe = useMemo(
    () => (open ? abschnitte(open.body_md).map((a) => ({ id: `${open.slug}/${a.id}`, label: a.label })) : []),
    [open],
  );

  const stand = useMemo(() => {
    if (!open) return "";
    const d = new Date(open.updated_at);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Europe/Berlin",
    }).format(d);
  }, [open, locale]);

  function waehle(id: string, slug: string) {
    if (!istDesktop()) fokusZiel.current = "titel";
    zuletzt.current = id;
    setOpenId(id);
    // Die Adresse zeigt, was offen ist — ohne die Historie mit jedem Klick in
    // der Liste zu füllen.
    window.history.replaceState(null, "", `#${encodeURIComponent(slug)}`);
  }

  function zurueck() {
    if (!istDesktop()) fokusZiel.current = "liste";
    zuletzt.current = openId ?? zuletzt.current;
    setOpenId(null);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  if (articles.length === 0) {
    return (
      <>
        <PageHeader word={t.word} title={t.title} description={lead} />
        {assistent}
        <EmptyState title={t.empty} description={t.emptyBody} />
      </>
    );
  }

  /** Die Zeile unter dem Artikeltitel: Thema und Stand, dahinter die Marken (Phase, diese Edition, andere Sprache). */
  const artikelZeile = open ? (
    <>
      {[themaName, stand ? t.updated.replace("{date}", stand) : ""].filter(Boolean).join(" · ")}
      {(open.phase !== "evergreen" || open.is_overlay || open.language !== locale) && (
        <span className="ml-2 inline-flex flex-wrap items-center gap-2 align-middle">
          {open.phase !== "evergreen" && <Badge>{phases[open.phase] ?? open.phase}</Badge>}
          {/* „Für diese Edition" sagt: das hier ist die diesjährige Fassung. */}
          {open.is_overlay && <Badge tone="accent">{t.thisEdition}</Badge>}
          {/* Die Redaktion pflegt DE und EN nicht im Gleichschritt. Gibt es
              den Artikel nur in der anderen Sprache, liefert die RPC ihn
              trotzdem (0088) — dann sagen wir es, statt ihn wegzulassen. */}
          {open.language !== locale && <Badge>{t.otherLanguage}</Badge>}
        </span>
      )}
    </>
  ) : null;

  const treffer = query.trim()
    ? visible.length === 1
      ? t.foundOne
      : t.foundMany.replace("{n}", String(visible.length))
    : "";

  return (
    <>
      {/* „Wiki“: der Titel der Liste (Handy). Ab 1024 px ist immer ein Artikel offen, dann gilt der andere Kopf. */}
      <div className={cn(imArtikel ? "hidden" : "lg:hidden")}>
        <PageHeader word={t.word} title={t.title} description={lead} />
      </div>
      {/* Der Artikel ist die Seite: sein Titel ist der `h1`, und der Fokus springt am Handy auf ihn. */}
      {open && (
        <div className={cn(imArtikel ? "block" : "hidden lg:block")}>
          <PageHeader
            word={t.word}
            title={open.title}
            description={artikelZeile}
            titleId="wiki-titel"
            titleRef={titelRef}
            titleLang={open.language !== locale ? open.language : undefined}
          />
        </div>
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className={cn("shrink-0 flex-col gap-4 lg:flex lg:w-72", imArtikel ? "hidden" : "flex")}>
          {/* Über der Suche: am Desktop steht der Satz hier, am Handy unter „Wiki“. */}
          <p className="ct-help hidden lg:block">{lead}</p>
          <SuchFeld
            aria-label={t.search}
            placeholder={t.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/* Statusmeldung: Vorlesesoftware kündigt die Trefferzahl beim Tippen an. */}
          <p role="status" className="ct-help min-h-5">
            {treffer}
          </p>

          {/* Der Assistent steht **in der Liste** (K-92, Konrad 09.10.2026): er gehört zum Finden, nicht zum Lesen — zwischen
              Seitentitel und Artikeltext trennte er beides, am Handy um fast 500 px. Dasselbe Gespräch wie in der Bubble
              (`useGespraech`): wer hier fragt, macht auf jeder anderen Seite des Bereichs weiter. In einem eigenen Element und
              nicht lose zwischen den Geschwistern: ein vom Server gebautes Element ohne Schlüssel in der Kindliste löste sonst
              die Warnung „unique key“ aus. Am Handy steht mit dem Artikel auch die Liste nicht mehr da; die Bubble bleibt. */}
          <div>{assistent}</div>

          <nav aria-labelledby="wiki-liste">
            {/* Eine Ebene zwischen Seitentitel und Themen, nur für die Gliederung. */}
            <h2 id="wiki-liste" className="sr-only">
              {t.listLabel}
            </h2>
            <div className="flex flex-col gap-4">
              {gruppen.map((g) => (
                <section key={g.kategorie} aria-labelledby={`wiki-thema-${g.kategorie}`}>
                  <h3 id={`wiki-thema-${g.kategorie}`} className="ct-eyebrow mb-1 px-2.5 text-muted">
                    {t[THEMA_TEXT[g.kategorie]]}
                  </h3>
                  <ul className="flex flex-col gap-0.5">
                    {g.artikel.map((a) => (
                      <li key={a.id}>
                        <button
                          id={`wiki-artikel-${a.id}`}
                          type="button"
                          aria-current={markiert(a.id) ? "true" : undefined}
                          className={cn(
                            "ct-label min-h-11 w-full rounded-r-ct-sm border-l-2 px-2.5 py-1.5 text-left transition-colors",
                            markiert(a.id)
                              ? "border-accent bg-surface text-ink"
                              : "border-transparent text-muted hover:bg-surface-hover hover:text-ink",
                          )}
                          onClick={() => waehle(a.id, a.slug)}
                        >
                          {a.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </nav>
          {visible.length === 0 && <p className="ct-help">{t.noMatch}</p>}
        </aside>

        <article
          aria-labelledby="wiki-titel"
          lang={open && open.language !== locale ? open.language : undefined}
          className={cn(
            "min-w-0 flex-1 rounded-ct-lg border bg-surface p-6 lg:block",
            imArtikel ? "block" : "hidden",
          )}
        >
          {open ? (
            <>
              {/* Nur am Handy: dort ersetzt der Artikel die Liste. */}
              <Button variant="ghost" size="sm" className="-ml-3 mb-2 lg:hidden" onClick={zurueck}>
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4 shrink-0"
                  aria-hidden
                  focusable="false"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 8H3m0 0 4-4M3 8l4 4" />
                </svg>
                {t.allArticles}
              </Button>

              {abschnittsListe.length >= MIN_ABSCHNITTE && (
                <>
                  {/* Ab 1024 px die Übersicht des Kits, offen. */}
                  <AbschnittsNavigation items={abschnittsListe} label={t.onThisArticle} className="hidden lg:block" />
                  {/* Am Handy zugeklappt: Bei neun Fragen stünden neun Kacheln untereinander,
                      bevor der Text beginnt (gemessen rund 600 px). Beide Fassungen stehen im
                      Markup, eine davon ist ausgeblendet — so gibt es beim Laden kein Umspringen. */}
                  <details className="group mb-8 rounded-ct-lg bg-accent-soft lg:hidden">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 ct-label text-accent-deep [&::-webkit-details-marker]:hidden">
                      {t.onThisArticle} ({abschnittsListe.length})
                      <svg
                        viewBox="0 0 16 16"
                        className="h-4 w-4 shrink-0 group-open:rotate-180"
                        aria-hidden
                        focusable="false"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m4 6 4 4 4-4" />
                      </svg>
                    </summary>
                    <ul className="flex flex-col px-4 pb-3">
                      {abschnittsListe.map((a) => (
                        <li key={a.id}>
                          <a
                            href={`#${a.id}`}
                            className="inline-flex min-h-11 w-full items-center ct-label text-accent-deep underline-offset-2 hover:underline"
                          >
                            {a.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}

              <Markdown source={open.body_md} idPrefix={open.slug} />

              {verwandt.length > 0 && (
                <nav aria-labelledby="wiki-verwandt" className="mt-8 border-t pt-4">
                  <h2 id="wiki-verwandt" className="ct-h3 mb-2">
                    {t.moreOn.replace("{topic}", themaName)}
                  </h2>
                  <ul className="flex flex-col">
                    {verwandt.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="ct-link inline-flex min-h-11 items-center text-left"
                          onClick={() => waehle(a.id, a.slug)}
                        >
                          {a.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </>
          ) : (
            <p className="ct-help">{t.noMatch}</p>
          )}
        </article>
      </div>
    </>
  );
}
