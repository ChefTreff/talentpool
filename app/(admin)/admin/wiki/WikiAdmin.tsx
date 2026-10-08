"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { useUrlFilter } from "@/components/ui/useUrlFilter";
import { archiveArticle, publishArticle, saveArticlePair } from "@/components/wiki/actions";
import type { KbAdminArticle } from "@/components/wiki/types";
import { gruppiere, passtArtikel, type WikiArtikel } from "@/lib/wiki/artikel";
import { THEMA_TEXT, type WikiKategorie } from "@/lib/wiki/kategorien";
import { ArtikelFormular } from "./ArtikelFormular";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  published: "success",
  archived: "warning",
};

/**
 * Die Wiki-Übersicht (ADM-103). **Eine Zeile je Artikel** — das Paar aus deutscher und englischer Fassung —, ohne Slug;
 * der Titel öffnet den Artikel. Suche und Filter (Thema, Zielgruppe, Status) gelten sofort und stehen in der Adresszeile.
 * Edition, Slug und Produktbezug stehen nur im Artikel selbst.
 *
 * Die Liste zeigt evergreen und Edition **nebeneinander** (Titel gleich, Edition im Artikel): so sieht man, welcher
 * Artikel dieses Jahr überlagert ist. Der Status steht je Sprache — die englische Fassung darf Entwurf sein, während
 * die deutsche im Portal steht.
 */
export function WikiAdmin({
  articles,
  editions,
  audiences,
  phases,
  topics,
  formats,
  t,
  common,
  rpcMessages,
}: {
  articles: KbAdminArticle[];
  editions: { id: string; slug: string; name: string }[];
  audiences: Record<string, string>;
  phases: Record<string, string>;
  topics: Record<string, string>;
  formats: Record<string, string>;
  t: Strings;
  common: { save: string; cancel: string; close: string; required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<WikiArtikel | "neu" | null>(null);
  // Fehler aus dem Schubfach stehen im Schubfach, nicht unten am Rand (ADM-041, Skill-Verbotsliste).
  const [fehler, setFehler] = useState<string | null>(null);
  const [f, setF] = useUrlFilter({ q: "", thema: "", zielgruppe: "", status: "" }, { zielgruppe: "zielgruppe" });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const alle = useMemo(() => gruppiere(articles), [articles]);
  const sichtbar = alle.filter((a) => passtArtikel(a, f));
  const zeit = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

  // Nach dem Neuladen zeigt das Schubfach den frischen Stand desselben Artikels.
  const aktuell = open && open !== "neu" ? (alle.find((a) => a.schluessel === open.schluessel) ?? open) : open;

  function run(
    action: Promise<{ ok: boolean; key?: string; detail?: string }>,
    okText: string,
    /** Kommt die Aktion aus dem Schubfach? Dann gehört der Fehler hinein — und das Schubfach bleibt offen. */
    imSchubfach = false,
    schliessen = true,
  ) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        const text = message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : "");
        if (imSchubfach) setFehler(text);
        else toast("error", text);
        return;
      }
      setFehler(null);
      toast("success", okText);
      if (schliessen) setOpen(null);
      router.refresh();
    });
  }

  const statusBadge = (z: KbAdminArticle | null) =>
    z ? (
      <Badge tone={STATUS_TONE[z.status] ?? "neutral"}>
        {t[`status${z.status[0].toUpperCase()}${z.status.slice(1)}`] ?? z.status}
      </Badge>
    ) : (
      <Badge tone="warning">{t.missing}</Badge>
    );

  return (
    <>
      <div className="mb-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.searchLabel} htmlFor="wiki-q">
            <SuchFeld id="wiki-q" value={f.q} placeholder={t.searchPlaceholder} onChange={(e) => setF({ q: e.target.value })} />
          </Field>
          <Field label={t.filterTopic} htmlFor="wiki-thema">
            <Select
              id="wiki-thema"
              value={f.thema}
              placeholder={t.filterAll}
              options={[...Object.keys(THEMA_TEXT)].map((k) => ({ value: k, label: t[THEMA_TEXT[k as WikiKategorie]] }))}
              onChange={(e) => setF({ thema: e.target.value })}
            />
          </Field>
          <Field label={t.filterAudience} htmlFor="wiki-zielgruppe">
            <Select
              id="wiki-zielgruppe"
              value={f.zielgruppe}
              placeholder={t.filterAll}
              options={Object.entries(audiences).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setF({ zielgruppe: e.target.value })}
            />
          </Field>
          <Field label={t.colStatus} htmlFor="wiki-status">
            <Select
              id="wiki-status"
              value={f.status}
              placeholder={t.filterAll}
              options={[
                { value: "draft", label: t.statusDraft },
                { value: "published", label: t.statusPublished },
                { value: "archived", label: t.statusArchived },
                { value: "missing", label: t.filterMissingEn },
              ]}
              onChange={(e) => setF({ status: e.target.value })}
            />
          </Field>
        </div>
        <div>
          <Button onClick={() => setOpen("neu")}>{t.newArticle}</Button>
        </div>
      </div>

      {alle.length === 0 ? (
        <EmptyState title={t.emptyAdmin} description={t.emptyAdminBody} />
      ) : sichtbar.length === 0 ? (
        <EmptyState title={t.noMatch} description={t.noResultsBody} />
      ) : (
        <>
          <p className="ct-label mb-2 text-ink">{t.countArticles.replace("{n}", String(sichtbar.length))}</p>
          <Table stapeln>
            <Thead>
              <Th>{t.colTitle}</Th>
              <Th>{t.colTopic}</Th>
              <Th>{t.colAudience}</Th>
              <Th>{t.colGerman}</Th>
              <Th>{t.colEnglish}</Th>
              <Th>{t.colUpdated}</Th>
            </Thead>
            <Tbody>
              {sichtbar.map((a) => (
                <Tr key={a.schluessel}>
                  <Td>
                    {/* Der Titel öffnet den Artikel (ADM-103 e) — als Link gestaltet, aber ein Knopf: er führt nicht auf eine Seite. */}
                    <button type="button" className="ct-link ct-label min-h-8 text-left pointer-coarse:min-h-11" onClick={() => { setFehler(null); setOpen(a); }}>
                      {a.titel}
                    </button>
                  </Td>
                  <Td label={t.colTopic} className="text-muted">{t[THEMA_TEXT[a.thema as WikiKategorie]]}</Td>
                  <Td label={t.colAudience} className="text-muted">{a.audience.map((x) => audiences[x] ?? x).join(", ")}</Td>
                  <Td label={t.colGerman}>{statusBadge(a.de)}</Td>
                  <Td label={t.colEnglish}>{statusBadge(a.en)}</Td>
                  <Td label={t.colUpdated} className="text-muted">{zeit.format(new Date(a.geaendert))}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <p className="ct-help mt-3">{t.topicHint}</p>
        </>
      )}

      {aktuell && (
        <Drawer
          open
          error={fehler}
          onClose={() => {
            setFehler(null);
            setOpen(null);
          }}
          title={aktuell === "neu" ? t.newArticle : aktuell.titel}
          closeLabel={common.close}
        >
          <ArtikelFormular
            key={aktuell === "neu" ? "neu" : aktuell.schluessel}
            artikel={aktuell === "neu" ? null : aktuell}
            editions={editions}
            audiences={audiences}
            phases={phases}
            topics={topics}
            formats={formats}
            pending={pending}
            t={t}
            common={common}
            onSave={(input, okText) => run(saveArticlePair(input), okText, true)}
            onPublish={(id, published, okText) => run(publishArticle(id, published), okText, true, false)}
            onArchive={(id) => run(archiveArticle(id), t.archived, true, false)}
          />
        </Drawer>
      )}
    </>
  );
}
