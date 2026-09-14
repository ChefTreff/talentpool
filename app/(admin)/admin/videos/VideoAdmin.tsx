"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { removeVideo, saveVideo } from "./actions";

export type AdminVideo = {
  id: string;
  key: string;
  title_de: string | null;
  title_en: string | null;
  url: string;
  audience: string[];
  edition_id: string | null;
  edition_slug: string | null;
  sort_order: number;
};

type Strings = Record<string, string>;
const leer: AdminVideo = {
  id: "", key: "", title_de: "", title_en: "", url: "",
  audience: ["partner"], edition_id: null, edition_slug: null, sort_order: 0,
};

/**
 * Die Videoliste. Der **Schlüssel** steht vorn und nicht der Titel: er ist
 * das, was die Seiten einbinden, und wer ihn ändert, nimmt das Video von der
 * Seite. Der Titel ist Beiwerk.
 */
export function VideoAdmin({
  videos, editions, t, common, rpcMessages,
}: {
  videos: AdminVideo[];
  editions: { id: string; slug: string; name: string }[];
  t: Strings;
  common: Strings;
  rpcMessages: Strings;
}) {
  const [offen, setOffen] = useState<AdminVideo | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const melden = (key: string, detail?: string) =>
    setFehler((rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : ""));

  return (
    <div className="flex flex-col gap-4">
      {fehler && (
        <p role="alert" className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOffen({ ...leer })}>{t.add}</Button>
      </div>

      {videos.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyBody} />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y">
            {videos.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <code className="ct-label text-ink">{v.key}</code>
                <span className="ct-small text-muted">{v.title_de ?? v.title_en ?? ""}</span>
                <span className="ct-help break-all">{v.url}</span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {v.audience.map((a) => <Badge key={a}>{a}</Badge>)}
                  <Badge tone={v.edition_id ? "accent" : "neutral"}>
                    {v.edition_slug ?? t.allEditions}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => setOffen(v)}>{t.edit}</Button>
                  <Button size="sm" variant="ghost" disabled={pending}
                    onClick={() => start(async () => {
                      const res = await removeVideo(v.id);
                      if (!res.ok) melden(res.key, res.detail);
                    })}>
                    {common.delete}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {offen && (
        <Drawer open onClose={() => setOffen(null)} title={offen.id ? t.edit : t.add}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFehler(null);
              start(async () => {
                const res = await saveVideo({
                  ...(offen.id ? { id: offen.id } : {}),
                  key: offen.key, url: offen.url,
                  title_de: offen.title_de, title_en: offen.title_en,
                  audience: offen.audience,
                  edition_id: offen.edition_id ?? "",
                  sort_order: Number(offen.sort_order) || 0,
                });
                if (res.ok) setOffen(null);
                else melden(res.key, res.detail);
              });
            }}
          >
            <Field label={t.fieldKey} htmlFor="v-key" hint={t.fieldKeyHint} required>
              <Input id="v-key" value={offen.key} required
                onChange={(e) => setOffen({ ...offen, key: e.target.value })} />
            </Field>
            <Field label={t.fieldUrl} htmlFor="v-url" hint={t.fieldUrlHint} required>
              <Input id="v-url" type="url" value={offen.url} required
                onChange={(e) => setOffen({ ...offen, url: e.target.value })} />
            </Field>
            <Field label={t.fieldTitleDe} htmlFor="v-title">
              <Input id="v-title" value={offen.title_de ?? ""}
                onChange={(e) => setOffen({ ...offen, title_de: e.target.value })} />
            </Field>
            <Field label={t.fieldTitleEn} htmlFor="v-title-en">
              <Input id="v-title-en" value={offen.title_en ?? ""}
                onChange={(e) => setOffen({ ...offen, title_en: e.target.value })} />
            </Field>
            <Field label={t.fieldAudience} htmlFor="v-aud" hint={t.fieldAudienceHint} required>
              <Input id="v-aud" value={offen.audience.join(", ")} required
                onChange={(e) => setOffen({ ...offen, audience: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </Field>
            <Field label={t.fieldEdition} htmlFor="v-ed" hint={t.fieldEditionHint}>
              <Select
                id="v-ed"
                value={offen.edition_id ?? ""}
                placeholder={t.allEditions}
                options={editions.map((e) => ({ value: e.id, label: e.name }))}
                onChange={(e) => setOffen({ ...offen, edition_id: e.target.value || null })}
              />
            </Field>
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
