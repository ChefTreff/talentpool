"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { removeNextUp, saveNextUp } from "./actions";

export type AdminNextUp = {
  id: string;
  word_de: string | null;
  word_en: string | null;
  title_de: string;
  title_en: string | null;
  teaser_de: string | null;
  teaser_en: string | null;
  link_url: string | null;
  starts_at: string | null;
  visible_from: string | null;
  visible_until: string | null;
  sort_order: number;
  active: boolean;
  updated_at: string;
};

type Strings = Record<string, string>;

/** Ein Zeitpunkt für `datetime-local`: Ortszeit ohne Zone, Minuten genau. */
function fuerEingabe(wert: string | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** Zurück in einen Zeitpunkt mit Zone — die Eingabe gilt in der Ortszeit des Browsers. */
function ausEingabe(wert: string): string {
  return wert ? new Date(wert).toISOString() : "";
}

type Entwurf = Omit<AdminNextUp, "sort_order" | "updated_at"> & { sort_order: string };

const LEER: Entwurf = {
  id: "", word_de: "", word_en: "", title_de: "", title_en: "", teaser_de: "", teaser_en: "",
  link_url: "", starts_at: "", visible_from: "", visible_until: "", sort_order: "0", active: true,
};

/**
 * Die Liste der Hinweise für „Next Up" (TAL-006). Was hier aktiv ist und im
 * Sichtbarkeitsfenster liegt, steht auf Home bei **jeder** angemeldeten
 * Person — deshalb zeigt die Liste den Zustand als Wort, nicht nur als Farbe.
 */
export function NextUpAdmin({
  items, now, t, common, rpcMessages,
}: {
  items: AdminNextUp[];
  /** Zeitpunkt der Seitenabfrage (ms) — für den Zustand je Eintrag. */
  now: number;
  t: Strings;
  common: Strings;
  rpcMessages: Strings;
}) {
  const [offen, setOffen] = useState<Entwurf | null>(null);
  const [loeschen, setLoeschen] = useState<AdminNextUp | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const melden = (key: string, detail?: string) =>
    setFehler((rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : ""));

  const jetzt = now;
  const zustand = (i: AdminNextUp): { tone: "success" | "neutral" | "warning"; label: string } => {
    if (!i.active) return { tone: "neutral", label: t.stateInactive };
    if (i.visible_from && new Date(i.visible_from).getTime() > jetzt) return { tone: "warning", label: t.stateScheduled };
    if (i.visible_until && new Date(i.visible_until).getTime() <= jetzt) return { tone: "neutral", label: t.stateExpired };
    return { tone: "success", label: t.stateLive };
  };

  const bearbeiten = (i: AdminNextUp) =>
    setOffen({
      ...i,
      word_de: i.word_de ?? "", word_en: i.word_en ?? "", title_en: i.title_en ?? "",
      teaser_de: i.teaser_de ?? "", teaser_en: i.teaser_en ?? "", link_url: i.link_url ?? "",
      starts_at: fuerEingabe(i.starts_at), visible_from: fuerEingabe(i.visible_from),
      visible_until: fuerEingabe(i.visible_until), sort_order: String(i.sort_order),
    });

  const set = <K extends keyof Entwurf>(k: K, v: Entwurf[K]) => setOffen((o) => (o ? { ...o, [k]: v } : o));

  return (
    <div className="flex flex-col gap-4">
      {fehler && !offen && (
        <p role="alert" className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setFehler(null); setOffen({ ...LEER }); }}>{t.add}</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyBody} />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y">
            {items.map((i) => {
              const z = zustand(i);
              return (
                <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  {i.word_de && <span className="ct-eyebrow text-muted">{i.word_de}</span>}
                  <span className="ct-label text-ink">{i.title_de}</span>
                  {i.link_url && <span className="ct-help break-all">{i.link_url}</span>}
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Badge tone={z.tone}>{z.label}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => { setFehler(null); bearbeiten(i); }}>{t.edit}</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setLoeschen(i)}>
                      {common.delete}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {loeschen && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody}
          detail={loeschen.title_de}
          confirmLabel={common.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setLoeschen(null)}
          onConfirm={() =>
            start(async () => {
              const res = await removeNextUp(loeschen.id);
              setLoeschen(null);
              if (!res.ok) melden(res.key, res.detail);
            })
          }
        />
      )}

      {offen && (
        <Drawer open error={fehler} onClose={() => setOffen(null)} title={offen.id ? t.edit : t.add}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFehler(null);
              start(async () => {
                const res = await saveNextUp({
                  ...(offen.id ? { id: offen.id } : {}),
                  word_de: offen.word_de, word_en: offen.word_en,
                  title_de: offen.title_de, title_en: offen.title_en,
                  teaser_de: offen.teaser_de, teaser_en: offen.teaser_en,
                  link_url: offen.link_url,
                  starts_at: ausEingabe(offen.starts_at ?? ""),
                  visible_from: ausEingabe(offen.visible_from ?? ""),
                  visible_until: ausEingabe(offen.visible_until ?? ""),
                  sort_order: Number(offen.sort_order) || 0,
                  active: offen.active,
                });
                if (res.ok) setOffen(null);
                else melden(res.key, res.detail);
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldTitleDe} htmlFor="n-title" required>
                <Input id="n-title" value={offen.title_de} required onChange={(e) => set("title_de", e.target.value)} />
              </Field>
              <Field label={t.fieldTitleEn} htmlFor="n-title-en">
                <Input id="n-title-en" value={offen.title_en ?? ""} onChange={(e) => set("title_en", e.target.value)} />
              </Field>
              <Field label={t.fieldWordDe} htmlFor="n-word" hint={t.fieldWordHint}>
                <Input id="n-word" value={offen.word_de ?? ""} onChange={(e) => set("word_de", e.target.value)} />
              </Field>
              <Field label={t.fieldWordEn} htmlFor="n-word-en">
                <Input id="n-word-en" value={offen.word_en ?? ""} onChange={(e) => set("word_en", e.target.value)} />
              </Field>
            </div>
            <Field label={t.fieldTeaserDe} htmlFor="n-teaser">
              <Textarea id="n-teaser" rows={3} value={offen.teaser_de ?? ""} onChange={(e) => set("teaser_de", e.target.value)} />
            </Field>
            <Field label={t.fieldTeaserEn} htmlFor="n-teaser-en">
              <Textarea id="n-teaser-en" rows={3} value={offen.teaser_en ?? ""} onChange={(e) => set("teaser_en", e.target.value)} />
            </Field>
            <Field label={t.fieldLink} htmlFor="n-link" hint={t.fieldLinkHint}>
              <Input id="n-link" value={offen.link_url ?? ""} onChange={(e) => set("link_url", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldStartsAt} htmlFor="n-starts" hint={t.fieldStartsAtHint}>
                <Input id="n-starts" type="datetime-local" value={offen.starts_at ?? ""} onChange={(e) => set("starts_at", e.target.value)} />
              </Field>
              <Field label={t.fieldSort} htmlFor="n-sort">
                <Input id="n-sort" inputMode="numeric" value={offen.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
              </Field>
              <Field label={t.fieldVisibleFrom} htmlFor="n-from">
                <Input id="n-from" type="datetime-local" value={offen.visible_from ?? ""} onChange={(e) => set("visible_from", e.target.value)} />
              </Field>
              <Field label={t.fieldVisibleUntil} htmlFor="n-until">
                <Input id="n-until" type="datetime-local" value={offen.visible_until ?? ""} onChange={(e) => set("visible_until", e.target.value)} />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-4" checked={offen.active} onChange={(e) => set("active", e.target.checked)} />
              <span className="ct-label text-ink">{t.fieldActive}</span>
            </label>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>{common.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setOffen(null)}>{common.cancel}</Button>
            </div>
          </form>
        </Drawer>
      )}
    </div>
  );
}
