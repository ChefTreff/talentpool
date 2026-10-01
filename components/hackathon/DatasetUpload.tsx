"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonDownload } from "@/components/ui/Button";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";
import { dateiGroesse } from "@/components/partner/media-kit";
import { postJson } from "@/lib/fetch-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DATASET_BUCKET, DATASET_EXT, pruefeDatensatz } from "@/lib/hackathon/datensatz";

type Strings = Record<string, string>;

export type DatasetInfo = {
  filename: string;
  size_bytes: number | null;
  uploaded_at: string;
  /** Signierte Download-Adresse (Sitzung der Person, 10 Minuten) oder null. */
  url: string | null;
} | null;

/**
 * Datensatz einer Challenge hochladen oder ersetzen (HACK-012) — für Partner
 * im Partner-Portal und das Hack-Team im Admin. Eine aktuelle Datei je
 * Challenge; eine neue ersetzt sie, die alte bleibt als Version liegen.
 *
 * Die Bytes gehen direkt zu Supabase (signierter Platz von
 * `/api/hackathon/dataset`), nie durch den Server.
 */
export function DatasetUpload({
  challengeId,
  current,
  dateLocale,
  t,
  variant = "secondary",
}: {
  challengeId: string;
  current: DatasetInfo;
  dateLocale: string;
  t: Strings;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

  function melden(key: string) {
    toast(
      "error",
      key === "too_large" || key === "file_too_large"
        ? t.datasetTooLarge
        : key === "wrong_type"
          ? t.datasetWrongType
          : key === "not_allowed"
            ? t.datasetNotAllowed
            : t.datasetFailed,
    );
  }

  async function hochladen(file: File) {
    setBusy(true);
    try {
      const pruefung = pruefeDatensatz(file);
      if (!pruefung.ok) return melden(pruefung.key);
      const platz = await postJson<{ path: string; token: string }>("/api/hackathon/dataset?step=url", {
        challenge_id: challengeId,
        filename: file.name,
        content_type: pruefung.mime,
        size_bytes: file.size,
      });
      if (!platz.ok) return melden(platz.key);
      const { error } = await createSupabaseBrowserClient()
        .storage.from(DATASET_BUCKET)
        .uploadToSignedUrl(platz.data.path, platz.data.token, file, { contentType: pruefung.mime });
      if (error) return melden("upload_failed");
      const zeile = await postJson<{ ok: boolean }>("/api/hackathon/dataset", {
        challenge_id: challengeId,
        path: platz.data.path,
        filename: file.name,
        mime: pruefung.mime,
        size_bytes: file.size,
      });
      if (!zeile.ok) return melden(zeile.key);
      toast("success", t.datasetUploaded);
      router.refresh();
    } catch {
      melden("unknown");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="ct-label">{current.filename}</span>
          <span className="ct-help">
            {[dateiGroesse(current.size_bytes, dateLocale), datum.format(new Date(current.uploaded_at))].filter(Boolean).join(" · ")}
          </span>
          {current.url && (
            <ButtonDownload href={current.url} size="sm" variant="ghost">
              {t.datasetDownload}
            </ButtonDownload>
          )}
        </div>
      ) : (
        <p className="ct-help">{t.datasetNone}</p>
      )}
      <FileButton
        label={current ? t.datasetReplace : t.datasetChoose}
        uploadLabel={t.datasetUpload}
        accept={DATASET_EXT.map((e) => `.${e}`).join(",")}
        disabled={busy}
        hint={t.datasetHint}
        variant={variant}
        onFile={hochladen}
      />
    </div>
  );
}
