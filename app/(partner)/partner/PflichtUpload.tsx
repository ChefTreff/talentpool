"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { acceptAttribute, checkFileRules, formatBytes } from "@/lib/partner/file-rules";
import { Badge } from "@/components/ui/Badge";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";
import { registerPartnerAsset, submitDeliverable } from "./actions";
import { uploadDeliverableFile } from "./upload";
import type { Deliverable } from "./types";

type Strings = Record<string, string>;

/**
 * Eine Pflicht hochladen — Knopf, Prüfung, Fassungen.
 *
 * **Dieselbe Datei an mehreren Orten, nicht mehrere Ablagen** (PART-035, Konrad
 * 17.09.): Die Rückwand steht auf der Messestand-Seite, in der Checkliste und
 * im Dateibereich. Vorher stand der Ablauf dreimal im Code; wer ihn einmal
 * änderte, änderte ihn an zwei Stellen nicht.
 *
 * Der Upload hängt immer an einer **Pflicht** — es gibt keinen freien Upload
 * (Konrads Antwort 7). Ohne `deliverable` zeigt die Komponente deshalb nur den
 * Hinweis, dass dafür keine Pflicht hinterlegt ist.
 */
export function PflichtUpload({
  orgId,
  editionId,
  deliverable,
  canEdit,
  locked,
  dateLocale,
  t,
  rpcMessages,
  labelNew,
  labelFirst,
}: {
  orgId: string;
  editionId: string;
  deliverable: Deliverable | null;
  canEdit: boolean;
  /** Frist vorbei oder aus anderem Grund zu — der Knopf verschwindet. */
  locked?: boolean;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
  labelNew?: string;
  labelFirst?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "long", timeStyle: "short" });
  const rules = deliverable?.file_rules ?? null;
  const dateien = deliverable?.assets ?? [];
  const erlaubt = (rules?.ext ?? []).map((e) => `.${e}`).join(", ");

  async function onUpload(file: File) {
    if (!deliverable) return;
    // Erst hier prüfen, dann hochladen: eine abgewiesene Datei soll gar nicht
    // erst im Bucket liegen.
    const bad = checkFileRules(file, rules);
    if (bad) {
      toast(
        "error",
        bad.reason === "size"
          ? t.uploadTooBig.replace("{max}", bad.detail)
          : t.uploadWrongType.replace("{allowed}", erlaubt).replace("{got}", bad.detail),
      );
      return;
    }
    setUploading(true);
    try {
      const res = await uploadDeliverableFile({
        supabase: createSupabaseBrowserClient(),
        registerAsset: registerPartnerAsset,
        submit: submitDeliverable,
        orgId,
        editionId,
        deliverableId: deliverable.id,
        kind: deliverable.key,
        file,
      });
      if (!res.ok) {
        toast(
          "error",
          res.stage === "storage"
            ? `${t.uploadFailed} (${res.message})`
            : message(res.key) + (res.detail ? ` (${res.detail})` : ""),
        );
        return;
      }
      toast("success", t.uploaded.replace("{v}", String(res.version)));
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  if (!deliverable) return <p className="ct-help">{t.uploadNoDeliverable}</p>;

  return (
    <div>
      {canEdit && !locked && (
        <FileButton
          uploadLabel={t.commonUpload}
          changeLabel={t.commonChangeFile}
          label={dateien.length > 0 ? (labelNew ?? t.uploadNew) : (labelFirst ?? t.uploadFirst)}
          accept={acceptAttribute(rules)}
          disabled={uploading}
          hint={t.uploadHint
            .replace("{allowed}", erlaubt)
            .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
          onFile={(file) => void onUpload(file)}
        />
      )}
      {uploading && <p className="ct-help mt-2">{t.uploading}</p>}

      {dateien.length > 0 && (
        <ul className="ct-help mt-3 flex flex-col gap-1">
          {dateien.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <Badge tone={a.status === "rejected" ? "error" : "success"}>
                {a.status === "rejected" ? t.uploadRejected : t.uploadCurrent}
              </Badge>
              <span>{a.filename ?? a.storage_path.split("/").pop()}</span>
              <span className="tabular-nums">v{a.version}</span>
              <span className="tabular-nums">{dateTime.format(new Date(a.created_at))}</span>
            </li>
          ))}
        </ul>
      )}
      {deliverable.review_note && (
        <p className="ct-help mt-2 text-warning-ink">{deliverable.review_note}</p>
      )}
    </div>
  );
}
