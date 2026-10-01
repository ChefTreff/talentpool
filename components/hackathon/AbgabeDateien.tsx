"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonDownload } from "@/components/ui/Button";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";
import { dateiGroesse } from "@/components/partner/media-kit";
import { postJson, readJson } from "@/lib/fetch-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { pruefeAbgabeDatei, SUBMISSION_BUCKET, SUBMISSION_EXT, SUBMISSION_MAX_FILES } from "@/lib/hackathon/abgabe";

type Strings = Record<string, string>;

export type AbgabeDatei = {
  file_id: string;
  filename: string;
  size_bytes: number | null;
  late: boolean;
  /** Signierte Download-Adresse (Sitzung der Person) oder null. */
  url: string | null;
};

/**
 * Dateien einer Hackathon-Abgabe (HACK-011): Liste mit Download, für das Team
 * zusätzlich Hochladen und Entfernen. Die Bytes gehen direkt zu Supabase
 * (signierter Platz von `/api/hackathon/submission`). Nach der Frist geht es
 * weiter, die Datei trägt dann „verspätet“.
 */
export function AbgabeDateien({
  teamId,
  dateien,
  editierbar,
  dateLocale,
  t,
}: {
  teamId: string;
  dateien: AbgabeDatei[];
  /** Nur Mitglieder des Teams laden hoch und entfernen. */
  editierbar: boolean;
  dateLocale: string;
  t: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  function melden(key: string) {
    toast(
      "error",
      key === "too_large" || key === "file_too_large"
        ? t.filesTooLarge
        : key === "wrong_type"
          ? t.filesWrongType
          : key === "too_many_files"
            ? t.filesTooMany
            : key === "not_allowed"
              ? t.filesNotAllowed
              : t.filesFailed,
    );
  }

  async function hochladen(file: File) {
    setBusy(true);
    try {
      const pruefung = pruefeAbgabeDatei(file);
      if (!pruefung.ok) return melden(pruefung.key);
      const platz = await postJson<{ path: string; token: string }>("/api/hackathon/submission?step=url", {
        team_id: teamId,
        filename: file.name,
        content_type: pruefung.mime,
        size_bytes: file.size,
      });
      if (!platz.ok) return melden(platz.key);
      const { error } = await createSupabaseBrowserClient()
        .storage.from(SUBMISSION_BUCKET)
        .uploadToSignedUrl(platz.data.path, platz.data.token, file, { contentType: pruefung.mime });
      if (error) return melden("upload_failed");
      const zeile = await postJson<{ ok: boolean }>("/api/hackathon/submission", {
        team_id: teamId,
        path: platz.data.path,
        filename: file.name,
        mime: pruefung.mime,
        size_bytes: file.size,
      });
      if (!zeile.ok) return melden(zeile.key);
      toast("success", t.filesUploaded);
      router.refresh();
    } catch {
      melden("unknown");
    } finally {
      setBusy(false);
    }
  }

  async function entfernen(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/hackathon/submission?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await readJson<{ error?: string }>(res);
        return melden(json?.error ?? "unknown");
      }
      toast("success", t.filesRemoved);
      router.refresh();
    } catch {
      melden("unknown");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {dateien.length === 0 ? (
        <p className="ct-help">{t.filesNone}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dateien.map((d) => (
            <li key={d.file_id} className="flex flex-wrap items-center gap-3">
              <span className="ct-label">{d.filename}</span>
              {dateiGroesse(d.size_bytes, dateLocale) && <span className="ct-help">{dateiGroesse(d.size_bytes, dateLocale)}</span>}
              {d.late && <Badge tone="warning">{t.late}</Badge>}
              {d.url && (
                <ButtonDownload href={d.url} size="sm" variant="ghost">
                  {t.filesDownload}
                </ButtonDownload>
              )}
              {editierbar && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => entfernen(d.file_id)}>
                  {t.filesRemove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editierbar && (
        <FileButton
          label={t.filesChoose}
          uploadLabel={t.filesUpload}
          accept={SUBMISSION_EXT.map((e) => `.${e}`).join(",")}
          disabled={busy || dateien.length >= SUBMISSION_MAX_FILES}
          hint={t.filesHint}
          variant="secondary"
          onFile={hochladen}
        />
      )}
    </div>
  );
}
