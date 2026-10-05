"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { postJson, readJson } from "@/lib/fetch-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Bild, SessionZeile } from "./types";

type Strings = Record<string, string>;

const BUCKET = "session-assets";
/** Wie der Bucket selbst (`20260917185916_v6_session_grafiken`): 25 MB. */
const MAX_BYTES = 25 * 1024 * 1024;
const ERLAUBT = ["image/jpeg", "image/png", "image/webp"];

/**
 * Die Arbeitsliste des Marketings: **wo fehlt noch was.**
 *
 * Deshalb steht die Session-Liste vorn und nicht die Bildergalerie — die Frage
 * ist nicht „welche Bilder haben wir", sondern „welcher Auftritt hat noch
 * keines". Der Filter „ohne Foto“ und „ohne Grafik“ ist der Standardweg durch
 * diese Seite, und er steht als Auswahlknöpfe mit der Zahl dabei.
 *
 * **Eine Zeile, ein ruhiger Knopf** (ADM-075, Konrad 05.10.: „die Buttons sauberer
 * strukturieren, das sieht total doof aus“). Vorher stand in jeder Zeile ein
 * Bündel aus Auswahl, Bildnachweis und einem großen Primärknopf, der in die
 * zweite Zeile umbrach — acht Primärknöpfe untereinander, und was sie
 * bewirkten, war nirgends beschriftet. Jetzt zeigt die Zeile den Stand (Wort
 * **und** Farbe) und einen Knopf „Bilder“. Der öffnet ein Schubfach mit allem zu
 * diesem Auftritt: ein beschriftetes Formular zum Hinzufügen (Art, Bildnachweis,
 * Datei), darunter die vorhandenen Bilder.
 *
 * **Fehler und Erfolg stehen im Schubfach, nicht als Toast**: ein
 * `<dialog showModal>` liegt über der Seite, ein Toast dahinter wäre unsichtbar
 * (ADM-041).
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
  common: { none: string; cancel: string; upload: string; chooseOtherFile: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"alle" | "ohne_foto" | "ohne_grafik">("alle");
  const [suche, setSuche] = useState("");
  /** Das Schubfach: zu welchem Auftritt gerade Bilder gezeigt und hinzugefügt werden. */
  const [offen, setOffen] = useState<string | null>(null);
  const [art, setArt] = useState("stage_photo");
  const [credit, setCredit] = useState("");
  /** Meldungen des Schubfachs. */
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  /** Das Bild, dessen Löschen gerade bestätigt wird — es ist danach weg, auch aus dem Speicher. */
  const [zuLoeschen, setZuLoeschen] = useState<Bild | null>(null);

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
  const aktuell = offen ? sessions.find((s) => s.session_id === offen) : undefined;

  function oeffnen(sessionId: string) {
    setOffen(sessionId);
    setArt("stage_photo");
    setCredit("");
    setFehler(null);
    setErfolg(null);
  }

  function schliessen() {
    setOffen(null);
    setZuLoeschen(null);
  }

  /**
   * Ein Fehler wird gesagt, nicht verschluckt — und nie geworfen. Im Schubfach steht er im Schubfach,
   * sonst als Toast.
   */
  function melden(key: string, detail?: string) {
    const text = (t[`error_${key}`] ?? t.error_unknown) + (detail ? ` (${detail})` : "");
    setErfolg(null);
    if (offen) setFehler(text);
    else toast("error", text);
  }

  /**
   * Hochladen in drei Zügen: Platz holen, Bytes direkt zu Supabase, Zeile
   * anlegen.
   *
   * **Die Datei geht nicht durch unseren Server.** Sie ging es bis zum
   * 21.09.2026, und dann hielt die Plattform sie bei gut 4 MB an — mit einer
   * HTML-Seite, an der `res.json()` zerbrach. Weil das hier in einer
   * `startTransition` läuft, riss der Fehler die ganze Seite mit („This page
   * couldn't load", Konrads Befund). Beides ist behoben: die Bytes nehmen den
   * kurzen Weg, und gelesen wird nur noch über `postJson`, das nie wirft.
   */
  async function hochladen(sessionId: string, datei: File) {
    const kind = art;
    setFehler(null);
    setErfolg(null);
    try {
      // Zuerst hier prüfen: der Bucket weist es ohnehin ab, aber dann hätte
      // der Upload schon begonnen — und das dauert bei 20 MB.
      if (!ERLAUBT.includes(datei.type)) return melden("wrong_type", datei.type || undefined);
      if (datei.size > MAX_BYTES) return melden("file_too_large");

      const platz = await postJson<{ path: string; token: string }>(
        "/api/admin/session-assets?step=url",
        {
          session_id: sessionId,
          kind,
          content_type: datei.type,
          size_bytes: datei.size,
          filename: datei.name,
        },
      );
      if (!platz.ok) return melden(platz.key, platz.detail);

      const browser = createSupabaseBrowserClient();
      const { error } = await browser.storage
        .from(BUCKET)
        .uploadToSignedUrl(platz.data.path, platz.data.token, datei, { contentType: datei.type });
      if (error) return melden("upload_failed");

      // Freistellung ist bei der Slot-Grafik erwartet, beim Bühnenfoto nie —
      // deshalb folgt der Haken der Art und ist keine eigene Frage.
      const zeile = await postJson<{ id: string }>("/api/admin/session-assets", {
        path: platz.data.path,
        session_id: sessionId,
        kind,
        filename: datei.name,
        mime: datei.type,
        size_bytes: datei.size,
        cutout: kind === "slot_graphic",
        ...(credit ? { credit } : {}),
      });
      if (!zeile.ok) return melden(zeile.key, zeile.detail);

      // Der Bildnachweis gilt für dieses Bild; die Art bleibt, denn oft folgen mehrere Fotos.
      setCredit("");
      setErfolg(t.uploaded);
      router.refresh();
    } catch {
      // Letzte Grenze. Was hier ankommt, hat niemand vorhergesehen — aber es
      // darf die Seite nicht mehr kosten.
      melden("unknown");
    }
  }

  async function loeschen(id: string) {
    try {
      const res = await fetch(`/api/admin/session-assets?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await readJson<{ error?: string }>(res);
        melden(json?.error ?? "unknown");
        return;
      }
      setFehler(null);
      setErfolg(t.deleted);
      router.refresh();
    } catch {
      melden("network");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-64 flex-1">
          <SuchFeld aria-label={t.search} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t.searchHint} />
        </div>
        {/* Die Auswahl, die am häufigsten gebraucht wird, liegt offen da — mit der Zahl dabei. */}
        <div role="group" aria-label={t.filter} className="flex flex-wrap gap-1">
          <Chip aktiv={filter === "alle"} onClick={() => setFilter("alle")}>
            {t.filterAll} ({sessions.length})
          </Chip>
          <Chip aktiv={filter === "ohne_foto"} onClick={() => setFilter("ohne_foto")}>
            {t.filterNoPhoto} ({ohneFoto})
          </Chip>
          <Chip aktiv={filter === "ohne_grafik"} onClick={() => setFilter("ohne_grafik")}>
            {t.filterNoGraphic} ({ohneGrafik})
          </Chip>
        </div>
      </div>

      {gefiltert.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Table stapeln>
          <Thead>
            <Th>{t.colSession}</Th>
            <Th>{t.colSpeakers}</Th>
            <Th>{t.colPhotos}</Th>
            <Th>{t.colGraphic}</Th>
            <Th>
              <span className="sr-only">{t.colActions}</span>
            </Th>
          </Thead>
          <Tbody>
            {gefiltert.map((s) => (
              <Tr key={s.session_id}>
                <Td className="relative">
                  <button
                    type="button"
                    className="ct-link ct-ziel text-left font-medium"
                    onClick={() => oeffnen(s.session_id)}
                  >
                    {s.title ?? common.none}
                  </button>
                  <span className="ct-help block text-muted">
                    {[s.stage_name, s.start_at ? zeit.format(new Date(s.start_at)) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Td>
                <Td label={t.colSpeakers}>
                  <span className="ct-help text-muted">{s.speakers ?? common.none}</span>
                </Td>
                {/* Zustand in Wort und Farbe: „Fehlt“ steht da, die Zahl bei vorhandenen Fotos auch. */}
                <Td label={t.colPhotos}>
                  {s.photos === 0 ? (
                    <Badge tone="warning">{t.missing}</Badge>
                  ) : (
                    <span className="ct-small tabular-nums text-ink">{s.photos}</span>
                  )}
                </Td>
                <Td label={t.colGraphic}>
                  {s.graphics === 0 ? <Badge tone="warning">{t.missing}</Badge> : <Badge tone="success">{t.present}</Badge>}
                </Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t.manageLabel.replace("{title}", s.title ?? common.none)}
                    onClick={() => oeffnen(s.session_id)}
                  >
                    {t.manage}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Drawer
        open={offen !== null}
        onClose={schliessen}
        title={aktuell?.title ?? common.none}
        closeLabel={t.close}
        error={fehler}
      >
        {aktuell && (
          <div className="flex flex-col gap-8">
            <p className="ct-help">
              {[
                aktuell.stage_name,
                aktuell.start_at ? zeit.format(new Date(aktuell.start_at)) : null,
                aktuell.speakers,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <section aria-labelledby="gr-neu" className="flex flex-col gap-4">
              <h3 id="gr-neu" className="ct-label text-ink">
                {t.addTitle}
              </h3>
              <Field label={t.kindLabel} htmlFor="gr-art">
                <Select
                  id="gr-art"
                  value={art}
                  onChange={(e) => setArt(e.target.value)}
                  options={[
                    { value: "stage_photo", label: t.kind_stage_photo },
                    { value: "slot_graphic", label: t.kind_slot_graphic },
                  ]}
                />
              </Field>
              <Field label={t.credit} htmlFor="gr-credit" hint={t.creditHint}>
                <Input id="gr-credit" value={credit} maxLength={200} onChange={(e) => setCredit(e.target.value)} />
              </Field>
              {/* Auswählen ist zweitrangig, das Hochladen danach die eine Hauptaktion des Schubfachs. */}
              <FileButton
                label={t.upload}
                uploadLabel={common.upload}
                changeLabel={common.chooseOtherFile}
                accept="image/jpeg,image/png,image/webp"
                variant="secondary"
                hint={t.uploadHint}
                disabled={pending}
                laedt={pending}
                onFile={(datei) => startTransition(async () => hochladen(aktuell.session_id, datei))}
              />
              <p role="status" className="ct-small text-success-ink">
                {erfolg}
              </p>
            </section>

            <section aria-labelledby="gr-bilder" className="flex flex-col gap-3">
              <h3 id="gr-bilder" className="ct-label text-ink">
                {t.existingTitle.replace("{n}", String(bilder.filter((b) => b.session_id === aktuell.session_id).length))}
              </h3>
              <p className="ct-help">{t.imagesHint}</p>
              <Bilder
                bilder={bilder.filter((b) => b.session_id === aktuell.session_id)}
                t={t}
                pending={pending}
                onDelete={(b) => setZuLoeschen(b)}
              />
            </section>
          </div>
        )}
      </Drawer>

      {zuLoeschen && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody}
          detail={<p className="ct-label break-all">{zuLoeschen.filename}</p>}
          confirmLabel={t.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setZuLoeschen(null)}
          onConfirm={() => {
            const id = zuLoeschen.id;
            setZuLoeschen(null);
            startTransition(async () => loeschen(id));
          }}
        />
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
  onDelete: (bild: Bild) => void;
}) {
  if (bilder.length === 0) return <p className="ct-small text-muted">{t.noImages}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3">
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
          <Button size="sm" variant="ghost" className="self-start" disabled={pending} onClick={() => onDelete(b)}>
            {t.delete}
          </Button>
        </li>
      ))}
    </ul>
  );
}
