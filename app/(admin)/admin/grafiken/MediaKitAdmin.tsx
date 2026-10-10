"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { postJson } from "@/lib/fetch-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  dateiGroesse,
  MEDIA_KIT_ERLAUBT,
  MEDIA_KIT_MAX_BYTES,
  MEDIA_KIT_ZIELGRUPPEN,
  zielgruppeUmschalten,
  type MediaKitZielgruppe,
} from "@/components/partner/media-kit";

/** Eine Datei des Media Kits aus `edition_files_admin`. */
export type MediaKitDatei = {
  id: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  label_de: string | null;
  label_en: string | null;
  created_at: string;
  /** Wer die Datei sieht (`kb_audience`) — das Media Kit kennt Partner und Speaker. */
  audience: string[];
};

type Strings = Record<string, string>;

/** Die Zielgruppen des Media Kits, die an der Datei stehen, in fester Reihenfolge — andere Einträge von `audience` zählen hier nicht. */
function angehakt(datei: MediaKitDatei): MediaKitZielgruppe[] {
  return MEDIA_KIT_ZIELGRUPPEN.filter((z) => datei.audience.includes(z));
}

/**
 * Das Media Kit pflegen (PART-041, ADM-023): Dateien, die jeder Partner unter
 * „Media Kit“ und jeder Speaker unter „Deine Bilder“ herunterlädt — Logos,
 * Vorlagen, Textbausteine. Hochladen geht wie bei Hallenplan und Anfahrt in zwei
 * Schritten direkt zu Supabase (`/api/admin/media-kit`); die Route prüft die
 * Rolle, `set_edition_file` noch einmal. Fehler stehen im Toast, weil sie keinem
 * Formularfeld gehören.
 *
 * **Für wen eine Datei gilt** (SPK-090): zwei Kästchen, Partner und Speaker —
 * beim Hochladen beide angehakt, je Datei danach umschaltbar. Die **letzte**
 * angehakte Zielgruppe bleibt (eine Datei ohne Zielgruppe sähe niemand); das
 * erzwingt auch die Route.
 *
 * **Auswählen ist zweitrangig, „Hochladen“ die Hauptaktion der Karte** (ADM-075): `FileButton variant="secondary"`
 * für den ersten Schritt; der Knopf danach (mit dem Dateinamen daneben) ist der primäre.
 */
export function MediaKitAdmin({
  editionId,
  files,
  dateLocale,
  t,
  common,
}: {
  editionId: string;
  files: MediaKitDatei[];
  dateLocale: string;
  t: Strings;
  common: { cancel: string; delete: string; upload: string; chooseOtherFile: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [labelDe, setLabelDe] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [zielgruppen, setZielgruppen] = useState<MediaKitZielgruppe[]>([...MEDIA_KIT_ZIELGRUPPEN]);
  const [busy, setBusy] = useState(false);
  const [loeschen, setLoeschen] = useState<MediaKitDatei | null>(null);
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });

  function melden(key: string) {
    toast(
      "error",
      key === "too_large" ? t.uploadTooLarge : key === "wrong_type" ? t.uploadWrongType : key === "not_allowed" ? t.uploadNotAllowed : t.uploadFailed,
    );
  }

  async function hochladen(file: File) {
    setBusy(true);
    try {
      if (!MEDIA_KIT_ERLAUBT.includes(file.type)) return melden("wrong_type");
      if (file.size > MEDIA_KIT_MAX_BYTES) return melden("too_large");
      const platz = await postJson<{ path: string; token: string }>("/api/admin/media-kit?step=url", {
        edition_id: editionId,
        content_type: file.type,
        size_bytes: file.size,
        filename: file.name,
      });
      if (!platz.ok) return melden(platz.key);
      const { error } = await createSupabaseBrowserClient()
        .storage.from("edition-files")
        .uploadToSignedUrl(platz.data.path, platz.data.token, file, { contentType: file.type });
      if (error) return melden("upload_failed");
      const zeile = await postJson<{ ok: boolean }>("/api/admin/media-kit", {
        path: platz.data.path,
        edition_id: editionId,
        filename: file.name,
        mime: file.type,
        size_bytes: file.size,
        label_de: labelDe.trim(),
        label_en: labelEn.trim(),
        audience: zielgruppen,
      });
      if (!zeile.ok) return melden(zeile.key);
      toast("success", t.uploaded);
      setLabelDe("");
      setLabelEn("");
      router.refresh();
    } catch {
      melden("unknown");
    } finally {
      setBusy(false);
    }
  }

  function entfernen(datei: MediaKitDatei) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/media-kit?id=${encodeURIComponent(datei.id)}`, { method: "DELETE" });
      if (!res.ok) {
        toast("error", t.deleteFailed);
        return;
      }
      toast("success", t.deleted);
      setLoeschen(null);
      router.refresh();
    });
  }

  /** Die Zielgruppen einer vorhandenen Datei umschalten (SPK-090). */
  function zielgruppeAendern(datei: MediaKitDatei, z: MediaKitZielgruppe) {
    const neu = zielgruppeUmschalten(angehakt(datei), z);
    startTransition(async () => {
      const res = await postJson<{ ok: boolean }>("/api/admin/media-kit?step=audience", {
        id: datei.id,
        audience: neu,
      });
      if (!res.ok) {
        toast("error", res.key === "not_allowed" ? t.uploadNotAllowed : t.audienceFailed);
        return;
      }
      toast("success", t.audienceSaved);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h3 className="ct-h3 text-ink">{t.addTitle}</h3>
        <p className="ct-small mt-1 leading-6">{t.addBody}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t.labelDe} htmlFor="mk-label-de" hint={t.labelHint}>
            <Input id="mk-label-de" value={labelDe} onChange={(e) => setLabelDe(e.target.value)} maxLength={120} />
          </Field>
          <Field label={t.labelEn} htmlFor="mk-label-en">
            <Input id="mk-label-en" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <fieldset className="mt-4 min-w-0">
          <legend className="ct-label text-ink">{t.audience}</legend>
          <p className="ct-help">{t.audienceHint}</p>
          <div className="mt-1 flex flex-wrap gap-x-6">
            {MEDIA_KIT_ZIELGRUPPEN.map((z) => (
              <Checkbox
                key={z}
                label={t[`audience_${z}`]}
                checked={zielgruppen.includes(z)}
                disabled={busy || (zielgruppen.length === 1 && zielgruppen.includes(z))}
                onChange={() => setZielgruppen(zielgruppeUmschalten(zielgruppen, z))}
              />
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <FileButton
            label={t.choose}
            uploadLabel={common.upload}
            changeLabel={common.chooseOtherFile}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.zip"
            variant="secondary"
            laedt={busy}
            hint={t.uploadHint}
            onFile={(file) => void hochladen(file)}
          />
        </div>
        {busy && <p className="ct-help mt-2">{t.uploading}</p>}
      </Card>

      {files.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Card className="p-0">
          <ul className="flex flex-col">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                {/* `basis-48`: ohne Mindestbreite bekäme der Titel am Handy, was neben den Kästchen und dem Knopf übrig bleibt (Basis 0 wickelt die Zeile nie um). */}
                <span className="ct-small min-w-0 flex-1 basis-48 text-ink">
                  {f.label_de ?? f.filename}
                  <span className="ct-help block">
                    {[f.filename, dateiGroesse(f.size_bytes, dateLocale), datum.format(new Date(f.created_at))]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {/* Wer die Datei sieht (SPK-090). Die letzte angehakte Zielgruppe ist gesperrt. */}
                <fieldset className="flex min-w-0 flex-wrap items-center gap-x-4" disabled={pending}>
                  <legend className="sr-only">{t.audience}</legend>
                  {MEDIA_KIT_ZIELGRUPPEN.map((z) => {
                    const gewaehlt = angehakt(f);
                    return (
                      <Checkbox
                        key={z}
                        label={t[`audience_${z}`]}
                        checked={gewaehlt.includes(z)}
                        disabled={gewaehlt.length === 1 && gewaehlt.includes(z)}
                        onChange={() => zielgruppeAendern(f, z)}
                      />
                    );
                  })}
                </fieldset>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setLoeschen(f)}>
                  {common.delete}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loeschen && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody}
          detail={<p className="ct-label">{loeschen.label_de ?? loeschen.filename}</p>}
          confirmLabel={common.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setLoeschen(null)}
          onConfirm={() => entfernen(loeschen)}
        />
      )}
    </div>
  );
}
