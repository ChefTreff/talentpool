"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { Select } from "@/components/ui/Select";
import { Editor } from "@/components/wiki/Editor";
import type { ArtikelGemeinsam, Sprachtext } from "@/components/wiki/actions";
import { KB_AUDIENCES, KB_PHASES, type KbAdminArticle } from "@/components/wiki/types";
import type { WikiArtikel } from "@/lib/wiki/artikel";

type Strings = Record<string, string>;
type Sprache = "de" | "en";
const SPRACHEN: Sprache[] = ["de", "en"];

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", published: "success", archived: "warning" };

/**
 * Ein Artikel mit beiden Sprachfassungen (ADM-103). Oben die Felder, die für **beide** Sprachen gelten (Zielgruppe,
 * Thema, Phase, Edition, Produktbezug …) — sie gehen beim Speichern in beide Zeilen, damit die Zielgruppe nie in einer
 * Sprache abweicht. Darunter ein Umschalter Deutsch/Englisch mit Titel, Text und dem **Status dieser Fassung**: die
 * englische darf Entwurf sein, während die deutsche im Portal steht.
 *
 * Eine fehlende Sprache entsteht beim Speichern **als Entwurf** — eine Übersetzung geht nie ungeprüft live.
 */
export function ArtikelFormular({
  artikel,
  editions,
  audiences,
  phases,
  topics,
  formats,
  pending,
  t,
  common,
  onSave,
  onPublish,
  onArchive,
}: {
  artikel: WikiArtikel | null;
  editions: { id: string; slug: string; name: string }[];
  audiences: Record<string, string>;
  phases: Record<string, string>;
  topics: Record<string, string>;
  formats: Record<string, string>;
  pending: boolean;
  t: Strings;
  common: { save: string; cancel: string; close: string; required: string };
  onSave: (
    input: { slug: string; edition_id: string | null; shared: ArtikelGemeinsam; de: Sprachtext | null; en: Sprachtext | null },
    okText: string,
  ) => void;
  onPublish: (id: string, published: boolean, okText: string) => void;
  onArchive: (id: string) => void;
}) {
  const start = {
    slug: artikel?.slug ?? "",
    edition_id: artikel?.edition_id ?? "",
    phase: artikel?.phase ?? "evergreen",
    roles: (artikel?.roles ?? []).join(", "),
    audience: artikel?.audience ?? [],
    valid_until: artikel?.valid_until?.slice(0, 10) ?? "",
    // ADM-064: Thema wie es im Portal erscheint — auch bei Bestand ohne Eintrag das abgeleitete (nur wenn es ein echtes Thema ist).
    category: (artikel?.de ?? artikel?.en)?.category ?? (artikel && artikel.thema !== "weitere" ? artikel.thema : ""),
    product_formats: artikel?.product_formats ?? [],
  };
  const textStart: Record<Sprache, Sprachtext> = {
    de: { title: artikel?.de?.title ?? "", body_md: artikel?.de?.body_md ?? "" },
    en: { title: artikel?.en?.title ?? "", body_md: artikel?.en?.body_md ?? "" },
  };
  const [form, setForm] = useState(start);
  const [text, setText] = useState(textStart);
  const [sprache, setSprache] = useState<Sprache>("de");
  const fassung = artikel?.[sprache] ?? null;

  const ohneZielgruppe = form.audience.length === 0;
  const textGeaendert = (s: Sprache) => text[s].title !== textStart[s].title || text[s].body_md !== textStart[s].body_md;
  const gemeinsamGeaendert =
    JSON.stringify({ ...form, slug: "" }) !== JSON.stringify({ ...start, slug: "" });
  const neu = artikel === null;
  const kannSpeichern = !pending && !ohneZielgruppe && (neu ? form.slug.trim() !== "" && text.de.title.trim() !== "" : textGeaendert("de") || textGeaendert("en") || gemeinsamGeaendert);

  function speichern() {
    const nimm = (s: Sprache): Sprachtext | null => {
      // Neu: die deutsche Fassung ist Pflicht, die englische nur, wenn etwas drinsteht.
      if (neu) return s === "de" || text[s].title.trim() !== "" || text[s].body_md.trim() !== "" ? text[s] : null;
      return textGeaendert(s) ? text[s] : null;
    };
    onSave(
      {
        slug: form.slug.trim(),
        edition_id: form.edition_id || null,
        shared: {
          audience: form.audience,
          roles: form.roles.split(",").map((r) => r.trim()).filter(Boolean),
          phase: form.phase,
          category: form.category || null,
          valid_until: form.valid_until || null,
          // Ohne Partner-Zielgruppe ist der Produktbezug ohne Sinn — dann leeren, nicht still behalten.
          product_formats: form.audience.includes("partner") ? form.product_formats : [],
        },
        de: nimm("de"),
        en: nimm("en"),
      },
      t.saved,
    );
  }

  const statusName = (z: KbAdminArticle) => t[`status${z.status[0].toUpperCase()}${z.status.slice(1)}`] ?? z.status;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label={t.sharedTitle} className="flex flex-col gap-4">
        <div>
          <h3 className="ct-h3 text-ink">{t.sharedTitle}</h3>
          <p className="ct-help">{t.sharedBody}</p>
        </div>

        {artikel?.abweichend && <p className="ct-small rounded-ct-md border border-warning-soft bg-warning-soft p-3 text-warning-ink">{t.differs}</p>}

        {neu ? (
          <Field label={t.fieldSlug} htmlFor="slug" hint={t.slugHint}>
            <Input id="slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
          </Field>
        ) : (
          <p className="ct-help">
            {t.fieldSlug}: <span className="font-mono">{artikel.slug}</span>
          </p>
        )}

        {/* ADM-008: Die Zielgruppe ist Pflicht — sie steuert Sichtbarkeit und Assistent. Die Tabelle prüft es weiterhin
            (kb_article_audience_chk); das Formular sagt es vorher. */}
        <Field label={t.fieldAudience} htmlFor="audience" required requiredLabel={common.required} hint={ohneZielgruppe ? undefined : t.audienceRequired} error={ohneZielgruppe ? t.audienceRequired : undefined}>
          <MehrfachAuswahl
            aufklappbar
            id="audience"
            leer={t.audienceNone}
            offen={artikel === null}
            options={KB_AUDIENCES.map((a) => ({ value: a, label: audiences[a] ?? a }))}
            value={form.audience}
            onChange={(next) => setForm((f) => ({ ...f, audience: next }))}
            invalid={ohneZielgruppe}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fieldTopic} htmlFor="topic" hint={t.fieldTopicHint}>
            <Select
              id="topic"
              value={form.category}
              options={[{ value: "", label: t.fieldTopicNone }, ...Object.entries(topics).map(([value, label]) => ({ value, label }))]}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldPhase} htmlFor="phase">
            <Select
              id="phase"
              value={form.phase}
              options={KB_PHASES.map((p) => ({ value: p, label: phases[p] ?? p }))}
              onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldEdition} htmlFor="edition" hint={neu ? t.overlayHint : undefined}>
            <Select
              id="edition"
              value={form.edition_id}
              disabled={!neu}
              options={[{ value: "", label: t.evergreen }, ...editions.map((e) => ({ value: e.id, label: e.name }))]}
              onChange={(e) => setForm((f) => ({ ...f, edition_id: e.target.value }))}
            />
          </Field>
          <Field label={t.fieldValidUntil} htmlFor="valid">
            <Input id="valid" type="date" value={form.valid_until} onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))} />
          </Field>
        </div>

        {/* PART-103: Produktbezug. Leer = der Artikel gilt für alle Partner; sonst sieht ihn im Portal nur, wer ein Produkt
            dieses Formats gebucht hat. Relevanz, kein Zugriffsschutz. */}
        {form.audience.includes("partner") && (
          <Field label={t.fieldProducts} htmlFor="products" hint={form.product_formats.length === 0 ? t.fieldProductsAll : t.fieldProductsSome}>
            <MehrfachAuswahl
              aufklappbar
              id="products"
              leer={t.productsAll}
              options={Object.entries(formats).map(([value, label]) => ({ value, label }))}
              value={form.product_formats}
              onChange={(next) => setForm((f) => ({ ...f, product_formats: next }))}
            />
          </Field>
        )}

        {form.audience.includes("volunteer") && (
          <Field label={t.fieldRoles} htmlFor="roles">
            <Input id="roles" value={form.roles} onChange={(e) => setForm((f) => ({ ...f, roles: e.target.value }))} />
          </Field>
        )}
      </section>

      <section aria-label={t.versionsTitle} className="flex flex-col gap-4">
        <div role="tablist" aria-label={t.languageLabel} className="flex gap-2">
          {SPRACHEN.map((s) => (
            <Button
              key={s}
              size="sm"
              role="tab"
              aria-selected={sprache === s}
              variant={sprache === s ? "secondary" : "ghost"}
              onClick={() => setSprache(s)}
            >
              {s === "de" ? t.languageDe : t.languageEn}
              {!neu && !artikel?.[s] && <span className="ml-1 text-warning-ink">· {t.missing}</span>}
              {textGeaendert(s) && <span aria-label={t.unsavedMark} className="ml-1">•</span>}
            </Button>
          ))}
        </div>

        {!neu && fassung === null && <p className="ct-help text-muted">{t.missingLanguage}</p>}

        {/* Status je Sprache: veröffentlichen, zurückziehen, archivieren, wieder veröffentlichen (ADM-104). */}
        {fassung && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="ct-label text-ink">{t.statusRow}</span>
            <Badge tone={STATUS_TONE[fassung.status] ?? "neutral"}>{statusName(fassung)}</Badge>
            {fassung.status !== "archived" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => onPublish(fassung.id, fassung.status !== "published", fassung.status === "published" ? t.unpublished : t.published)}
              >
                {fassung.status === "published" ? t.unpublish : t.publish}
              </Button>
            )}
            {fassung.status === "archived" && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => onPublish(fassung.id, true, t.republished)}>
                {t.republish}
              </Button>
            )}
            {fassung.status !== "archived" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onArchive(fassung.id)}>
                {t.archive}
              </Button>
            )}
          </div>
        )}

        <Field label={t.fieldTitleDe} htmlFor="title">
          <Input id="title" value={text[sprache].title} onChange={(e) => setText((x) => ({ ...x, [sprache]: { ...x[sprache], title: e.target.value } }))} />
        </Field>

        {/* F9.7: „Redaktionsoberfläche … vergleichbar mit dem Notion-Editor". Dahinter bleibt Markdown — der Renderer erzeugt
            nur React-Knoten, und gespeichertes HTML wäre genau der Weg, den wir nicht bauen wollen. */}
        <fieldset className="flex flex-col gap-1">
          <legend className="ct-label text-ink">{t.fieldBody}</legend>
          <Editor
            key={sprache}
            value={text[sprache].body_md}
            onChange={(next) => setText((x) => ({ ...x, [sprache]: { ...x[sprache], body_md: next } }))}
            t={t}
          />
        </fieldset>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!kannSpeichern} onClick={speichern}>
          {common.save}
        </Button>
      </div>
    </div>
  );
}
