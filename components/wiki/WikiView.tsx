"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { Markdown } from "./Markdown";
import type { KbArticle } from "./types";

type Strings = Record<string, string>;

/**
 * Das Wiki im Bereich: links die Artikel, rechts der gelesene.
 *
 * Gesucht wird über Titel **und** Text — wer „Parkplatz" tippt, sucht nicht
 * die Überschrift, sondern die Antwort. Die Phase filtert daneben, weil am
 * Aufbautag anderes zählt als zwei Wochen vorher.
 */
export function WikiView({
  articles,
  phases,
  locale,
  t,
}: {
  articles: KbArticle[];
  /** Beschriftungen der Phasen aus dem Vokabular. */
  phases: Record<string, string>;
  /** Sprache der Seite — Artikel, die davon abweichen, werden gekennzeichnet. */
  locale: string;
  t: Strings;
}) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("");
  const [openId, setOpenId] = useState<string | null>(articles[0]?.id ?? null);

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
      const slug = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!slug) return;
      const treffer = articles.find((a) => a.slug === slug);
      if (treffer) setOpenId(treffer.id);
    };
    ausAdresse();
    window.addEventListener("hashchange", ausAdresse);
    return () => window.removeEventListener("hashchange", ausAdresse);
  }, [articles]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (phase && a.phase !== phase) return false;
      if (!needle) return true;
      return `${a.title} ${a.body_md}`.toLowerCase().includes(needle);
    });
  }, [articles, query, phase]);

  const open = visible.find((a) => a.id === openId) ?? visible[0] ?? null;

  if (articles.length === 0) {
    return <EmptyState title={t.empty} description={t.emptyBody} />;
  }

  const usedPhases = [...new Set(articles.map((a) => a.phase))];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex shrink-0 flex-col gap-3 lg:w-[280px]">
        <Input
          aria-label={t.search}
          placeholder={t.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {usedPhases.length > 1 && (
          <Select
            aria-label={t.phase}
            value={phase}
            options={[
              { value: "", label: t.allPhases },
              ...usedPhases.map((p) => ({ value: p, label: phases[p] ?? p })),
            ]}
            onChange={(e) => setPhase(e.target.value)}
          />
        )}
        <ul className="flex flex-col gap-0.5">
          {visible.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-current={open?.id === a.id ? "true" : undefined}
                className={cn(
                  "ct-label w-full rounded-ct-sm px-2.5 py-1.5 text-left transition-colors",
                  open?.id === a.id ? "bg-surface-hover text-ink" : "text-muted hover:bg-surface-hover hover:text-ink",
                )}
                onClick={() => {
                  setOpenId(a.id);
                  // Die Adresse zeigt, was offen ist — ohne die Historie mit
                  // jedem Klick in der Liste zu füllen.
                  window.history.replaceState(null, "", `#${encodeURIComponent(a.slug)}`);
                }}
              >
                {a.title}
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 && <p className="ct-help">{t.noMatch}</p>}
      </aside>

      <article className="min-w-0 flex-1 rounded-ct-lg border bg-surface p-6">
        {open ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="ct-h2">{open.title}</h2>
              {open.phase !== "evergreen" && <Badge>{phases[open.phase] ?? open.phase}</Badge>}
              {/* „Für diese Edition" sagt: das hier ist die diesjährige Fassung. */}
              {open.is_overlay && <Badge tone="accent">{t.thisEdition}</Badge>}
              {/* Die Redaktion pflegt DE und EN nicht im Gleichschritt. Gibt es
                  den Artikel nur in der anderen Sprache, liefert die RPC ihn
                  trotzdem (0088) — dann sagen wir es, statt ihn wegzulassen. */}
              {open.language !== locale && <Badge>{t.otherLanguage}</Badge>}
            </div>
            <Markdown source={open.body_md} />
          </>
        ) : (
          <p className="ct-help">{t.noMatch}</p>
        )}
      </article>
    </div>
  );
}
