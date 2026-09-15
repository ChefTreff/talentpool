"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Drawer } from "@/components/ui/Drawer";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { Editor } from "@/components/wiki/Editor";
import { archiveArticle, publishArticle, saveArticle } from "@/components/wiki/actions";
import { KB_AUDIENCES, KB_PHASES, type KbAdminArticle } from "@/components/wiki/types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  published: "success",
  archived: "warning",
};

/**
 * Der Editor. Eine Liste, ein Schubfach — kein eigener Seitenbaum, weil ein
 * Wiki mit dreissig Artikeln keine Navigation braucht, sondern eine Übersicht.
 *
 * Die Liste zeigt evergreen und Edition **nebeneinander**, sortiert nach Slug:
 * so sieht man auf einen Blick, welcher Artikel dieses Jahr überlagert ist und
 * welcher noch auf der alten Fassung steht.
 */
export function WikiAdmin({
  articles,
  editions,
  audiences,
  phases,
  t,
  common,
  rpcMessages,
}: {
  articles: KbAdminArticle[];
  editions: { id: string; slug: string; name: string }[];
  audiences: Record<string, string>;
  phases: Record<string, string>;
  t: Strings;
  common: { save: string; cancel: string; close: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<KbAdminArticle | "neu" | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4">
        <Button onClick={() => setOpen("neu")}>{t.newArticle}</Button>
      </div>

      {articles.length === 0 ? (
        <EmptyState title={t.emptyAdmin} description={t.emptyAdminBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colSlug}</Th>
            <Th>{t.colTitle}</Th>
            <Th>{t.colAudience}</Th>
            <Th>{t.colEdition}</Th>
            <Th>{t.colLanguage}</Th>
            <Th>{t.colStatus}</Th>
            <Th aria-label={t.edit} />
          </Thead>
          <Tbody>
            {articles.map((a) => (
              <Tr key={a.id}>
                <Td className="text-muted">{a.slug}</Td>
                <Td><span className="ct-label">{a.title}</span></Td>
                <Td className="text-muted">{a.audience.map((x) => audiences[x] ?? x).join(", ")}</Td>
                <Td className="text-muted">{a.edition_slug ?? t.evergreen}</Td>
                <Td className="text-muted uppercase">{a.language}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>
                    {t[`status${a.status[0].toUpperCase()}${a.status.slice(1)}`] ?? a.status}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(a)}>
                      {t.edit}
                    </Button>
                    {a.status !== "archived" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(
                            publishArticle(a.id, a.status !== "published"),
                            a.status === "published" ? t.unpublished : t.published,
                          )
                        }
                      >
                        {a.status === "published" ? t.unpublish : t.publish}
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {open && (
        <Drawer
          open
          onClose={() => setOpen(null)}
          title={open === "neu" ? t.newArticle : open.title}
          closeLabel={common.close}
        >
          <ArticleForm
            article={open === "neu" ? null : open}
            editions={editions}
            audiences={audiences}
            phases={phases}
            pending={pending}
            t={t}
            common={common}
            onSave={(input, okText) => run(saveArticle(input), okText)}
            onArchive={(id) => run(archiveArticle(id), t.archived)}
          />
        </Drawer>
      )}
    </>
  );
}

function ArticleForm({
  article,
  editions,
  audiences,
  phases,
  pending,
  t,
  common,
  onSave,
  onArchive,
}: {
  article: KbAdminArticle | null;
  editions: { id: string; slug: string; name: string }[];
  audiences: Record<string, string>;
  phases: Record<string, string>;
  pending: boolean;
  t: Strings;
  common: { save: string; cancel: string; close: string };
  onSave: (input: Record<string, unknown>, okText: string) => void;
  onArchive: (id: string) => void;
}) {
  const [form, setForm] = useState({
    slug: article?.slug ?? "",
    title: article?.title ?? "",
    body_md: article?.body_md ?? "",
    language: article?.language ?? "de",
    phase: article?.phase ?? "evergreen",
    edition_id: article?.edition_id ?? "",
    roles: (article?.roles ?? []).join(", "),
    audience: article?.audience ?? ["volunteer"],
    valid_until: article?.valid_until?.slice(0, 10) ?? "",
  });

  const toggle = (key: string) =>
    setForm((f) => ({
      ...f,
      audience: f.audience.includes(key) ? f.audience.filter((x) => x !== key) : [...f.audience, key],
    }));

  return (
    <div className="flex flex-col gap-4">
      <Field label={t.fieldSlug} htmlFor="slug" hint={article ? undefined : t.overlayHint}>
        <Input
          id="slug"
          value={form.slug}
          disabled={Boolean(article)}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        />
      </Field>

      <Field label={t.fieldTitleDe} htmlFor="title">
        <Input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="ct-label mb-1">{t.fieldAudience}</legend>
        <div className="flex flex-wrap gap-3">
          {KB_AUDIENCES.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={form.audience.includes(a)} onChange={() => toggle(a)} />
              <span>{audiences[a] ?? a}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <Field label={t.fieldLanguage} htmlFor="language">
          <Select
            id="language"
            className="w-32"
            value={form.language}
            options={[{ value: "de", label: "DE" }, { value: "en", label: "EN" }]}
            onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
          />
        </Field>
        <Field label={t.fieldPhase} htmlFor="phase">
          <Select
            id="phase"
            className="w-40"
            value={form.phase}
            options={KB_PHASES.map((p) => ({ value: p, label: phases[p] ?? p }))}
            onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
          />
        </Field>
        <Field label={t.fieldEdition} htmlFor="edition">
          <Select
            id="edition"
            className="w-48"
            value={form.edition_id}
            options={[{ value: "", label: t.evergreen }, ...editions.map((e) => ({ value: e.id, label: e.name }))]}
            onChange={(e) => setForm((f) => ({ ...f, edition_id: e.target.value }))}
          />
        </Field>
        <Field label={t.fieldValidUntil} htmlFor="valid">
          <Input
            id="valid"
            type="date"
            className="w-44"
            value={form.valid_until}
            onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
          />
        </Field>
      </div>

      {form.audience.includes("volunteer") && (
        <Field label={t.fieldRoles} htmlFor="roles">
          <Input id="roles" value={form.roles} onChange={(e) => setForm((f) => ({ ...f, roles: e.target.value }))} />
        </Field>
      )}

      {/* F9.7: „Redaktionsoberfläche … vergleichbar mit dem Notion-Editor".
          Dahinter bleibt Markdown — der Renderer erzeugt nur React-Knoten, und
          gespeichertes HTML wäre genau der Weg, den wir nicht bauen wollen. */}
      <fieldset className="flex flex-col gap-1">
        <legend className="ct-label text-ink">{t.fieldBody}</legend>
        <Editor
          value={form.body_md}
          onChange={(next) => setForm((f) => ({ ...f, body_md: next }))}
          t={t}
        />
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            onSave(
              {
                ...(article ? { id: article.id } : { slug: form.slug }),
                title: form.title,
                body_md: form.body_md,
                language: form.language,
                phase: form.phase,
                audience: form.audience,
                roles: form.roles.split(",").map((r) => r.trim()).filter(Boolean),
                edition_id: form.edition_id || null,
                valid_until: form.valid_until || null,
              },
              t.saved,
            )
          }
        >
          {common.save}
        </Button>
        {article && article.status !== "archived" && (
          <Button variant="ghost" disabled={pending} onClick={() => onArchive(article.id)}>
            {t.archive}
          </Button>
        )}
      </div>
    </div>
  );
}
