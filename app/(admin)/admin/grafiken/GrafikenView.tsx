"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileButton } from "@/components/ui/FileButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import type { Bild, SessionZeile } from "./types";

type Strings = Record<string, string>;

/**
 * Die Arbeitsliste des Marketings: **wo fehlt noch was.**
 *
 * Deshalb steht die Session-Liste vorn und nicht die Bildergalerie — die Frage
 * ist nicht „welche Bilder haben wir", sondern „welcher Auftritt hat noch
 * keines". Der Filter „nur ohne" ist der Standardweg durch diese Seite.
 *
 * Die Slot-Grafik gibt es je Auftritt **einmal** — eine neue ersetzt die alte
 * (die Datenbank setzt sie auf ungültig, gelöscht wird nichts). Bühnenfotos
 * sind viele; dort ersetzt nichts.
 */
export function GrafikenView({
  sessions,
  bilder,
  dateLocale,
  t,
  common,
}: {
  sessions: SessionZeile[];
  bilder: Bild[];
  dateLocale: string;
  t: Strings;
  common: { none: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"alle" | "ohne_foto" | "ohne_grafik">("alle");
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<string | null>(null);
  const [art, setArt] = useState<Record<string, string>>({});
  const [credit, setCredit] = useState<Record<string, string>>({});

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short" });

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter === "ohne_foto" && s.photos > 0) return false;
      if (filter === "ohne_grafik" && s.graphics > 0) return false;
      if (q) {
        const hay = [s.title, s.stage_name, s.speakers].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, filter, suche]);

  const ohneFoto = sessions.filter((s) => s.photos === 0).length;
  const ohneGrafik = sessions.filter((s) => s.graphics === 0).length;

  async function hochladen(sessionId: string, datei: File) {
    const form = new FormData();
    form.set("file", datei);
    form.set("session_id", sessionId);
    form.set("kind", art[sessionId] ?? "stage_photo");
    // Freistellung ist bei der Slot-Grafik erwartet, beim Bühnenfoto nie —
    // deshalb folgt der Haken der Art und ist keine eigene Frage.
    form.set("cutout", String((art[sessionId] ?? "stage_photo") === "slot_graphic"));
    if (credit[sessionId]) form.set("credit", credit[sessionId]);

    const res = await fetch("/api/admin/session-assets", { method: "POST", body: form });
    const json = (await res.json()) as { error?: string; detail?: string };
    if (!res.ok) {
      toast("error", (t[`error_${json.error}`] ?? t.error_unknown) + (json.detail ? ` (${json.detail})` : ""));
      return;
    }
    toast("success", t.uploaded);
    router.refresh();
  }

  async function loeschen(id: string) {
    const res = await fetch(`/api/admin/session-assets?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      toast("error", t[`error_${json.error}`] ?? t.error_unknown);
      return;
    }
    toast("success", t.deleted);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="ct-label text-ink">{t.search}</span>
            <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t.searchHint} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ct-label text-ink">{t.filter}</span>
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              options={[
                { value: "alle", label: t.filterAll },
                { value: "ohne_foto", label: `${t.filterNoPhoto} (${ohneFoto})` },
                { value: "ohne_grafik", label: `${t.filterNoGraphic} (${ohneGrafik})` },
              ]}
            />
          </label>
        </div>
      </Card>

      {gefiltert.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colSession}</Th>
            <Th>{t.colSpeakers}</Th>
            <Th numeric>{t.colPhotos}</Th>
            <Th numeric>{t.colGraphic}</Th>
            <Th>{t.colUpload}</Th>
          </Thead>
          <Tbody>
            {gefiltert.map((s) => (
              <Tr key={s.session_id}>
                <Td>
                  <button
                    type="button"
                    className="ct-link text-left font-medium"
                    onClick={() => setOffen(offen === s.session_id ? null : s.session_id)}
                  >
                    {s.title ?? common.none}
                  </button>
                  <span className="ct-help block text-muted">
                    {[s.stage_name, s.start_at ? zeit.format(new Date(s.start_at)) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Td>
                <Td>
                  <span className="ct-help text-muted">{s.speakers ?? common.none}</span>
                </Td>
                <Td numeric>
                  {s.photos === 0 ? <Badge tone="warning">0</Badge> : s.photos}
                </Td>
                <Td numeric>
                  {s.graphics === 0 ? <Badge tone="warning">0</Badge> : <Badge tone="success">1</Badge>}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label={t.colUpload}
                      className="w-40"
                      value={art[s.session_id] ?? "stage_photo"}
                      onChange={(e) => setArt((a) => ({ ...a, [s.session_id]: e.target.value }))}
                      options={[
                        { value: "stage_photo", label: t.kind_stage_photo },
                        { value: "slot_graphic", label: t.kind_slot_graphic },
                      ]}
                    />
                    <Input
                      aria-label={t.credit}
                      className="w-36"
                      placeholder={t.credit}
                      value={credit[s.session_id] ?? ""}
                      onChange={(e) => setCredit((c) => ({ ...c, [s.session_id]: e.target.value }))}
                    />
                    <FileButton
                      label={t.upload}
                      accept="image/jpeg,image/png,image/webp"
                      disabled={pending}
                      onFile={(datei) => startTransition(async () => hochladen(s.session_id, datei))}
                    />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {offen && (
        <Card>
          <CardHeader
            title={sessions.find((s) => s.session_id === offen)?.title ?? common.none}
            description={t.imagesHint}
            action={
              <Button variant="ghost" onClick={() => setOffen(null)}>
                {t.close}
              </Button>
            }
          />
          <Bilder
            bilder={bilder.filter((b) => b.session_id === offen)}
            t={t}
            pending={pending}
            onDelete={(id) => startTransition(async () => loeschen(id))}
          />
        </Card>
      )}
    </div>
  );
}

function Bilder({
  bilder,
  t,
  pending,
  onDelete,
}: {
  bilder: Bild[];
  t: Strings;
  pending: boolean;
  onDelete: (id: string) => void;
}) {
  if (bilder.length === 0) return <p className="ct-small text-muted">{t.noImages}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {bilder.map((b) => (
        <li key={b.id} className="flex flex-col gap-2 rounded-ct-md border p-3">
          {b.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige URL; kein Loader-Ziel
            <img
              src={b.url}
              alt={b.filename}
              className="aspect-video w-full rounded-ct-sm object-cover"
            />
          ) : (
            <div className="aspect-video w-full rounded-ct-sm bg-surface-hover" />
          )}
          <div className="flex flex-wrap items-center gap-1">
            <Badge tone={b.kind === "slot_graphic" ? "accent" : "neutral"}>
              {t[`kind_${b.kind}`] ?? b.kind}
            </Badge>
            {!b.is_current && <Badge>{t.superseded}</Badge>}
            {b.cutout && <Badge tone="success">{t.cutout}</Badge>}
          </div>
          <span className="ct-help break-all text-muted">{b.filename}</span>
          {b.credit && <span className="ct-help text-muted">© {b.credit}</span>}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDelete(b.id)}>
            {t.delete}
          </Button>
        </li>
      ))}
    </ul>
  );
}
