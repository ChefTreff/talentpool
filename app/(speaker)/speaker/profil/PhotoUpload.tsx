"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";
import { registerSpeakerPhoto } from "../actions";
import { MAX_PHOTO_BYTES, PHOTO_MIME, SPEAKER_BUCKET, safeFileName } from "../types";

type Strings = Record<string, string>;

/**
 * Das Profilfoto (SPK-004).
 *
 * Bis heute stand hier ein Satz, der auf das Speaker-Postfach verwies, während
 * die Startseite den Schritt „Foto" als offen führte und ins Leere verlinkte —
 * Bucket, Storage-Policy und `register_speaker_asset` liegen seit Welle 2
 * fertig da. Es fehlte allein dieses Formular.
 *
 * Die Datei geht **direkt** in den Bucket, nicht durch den Server: der Pfad
 * `<edition>/<profil>/photo/<uuid>-<datei>` ist vorgeschrieben, die
 * Storage-Policy prüft ihn, die RPC prüft ihn noch einmal und setzt
 * `photo_asset_id`. Erst danach steht das Bild im Profil.
 */
export function PhotoUpload({
  profileId,
  editionId,
  photoUrl,
  t,
  rpcMessages,
}: {
  profileId: string;
  editionId: string;
  /** Signierte Adresse des aktuellen Fotos; `null`, solange keins hinterlegt ist. */
  photoUrl: string | null;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  async function onFile(file: File) {
    if (file.size > MAX_PHOTO_BYTES) {
      toast("error", t.photoTooBig);
      return;
    }
    // `file.type` ist leer, wenn der Browser den Typ nicht kennt — dann
    // entscheidet die Endung nichts, und wir lassen es durch; die
    // Storage-Policy und die RPC prüfen ohnehin Pfad und Zugehörigkeit.
    if (file.type && !PHOTO_MIME.includes(file.type)) {
      toast("error", t.photoWrongType);
      return;
    }

    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = `${editionId}/${profileId}/photo/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error } = await supabase.storage.from(SPEAKER_BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) {
        toast("error", `${t.photoFailed} (${error.message})`);
        return;
      }
      startTransition(async () => {
        const res = await registerSpeakerPhoto({
          profileId,
          storagePath: path,
          filename: file.name,
          mime: file.type || null,
          sizeBytes: file.size,
        });
        if (!res.ok) {
          // Die Datei liegt dann verwaist im Bucket. Sie hier zu löschen wäre
          // der zweite Fehlerfall im ersten — lieber melden und aufräumen
          // lassen (dieselbe Regel wie beim Präsentations-Upload).
          toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
          return;
        }
        toast("success", t.photoDone);
        router.refresh();
      });
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || pending;

  return (
    <Card id="foto">
      <h2 className="ct-h3 mb-1 text-ink">{t.photoTitle}</h2>
      <p className="ct-help mb-4">{t.photoLead}</p>

      <div className="flex flex-wrap items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Signierte Storage-Adresse, keine feste Größe.
          <img
            src={photoUrl}
            alt={t.photoPreviewAlt}
            className="h-24 w-24 shrink-0 rounded-ct-md border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-ct-md border border-dashed bg-canvas"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="9" r="3.5" />
              <path d="M4.5 19.5c1.6-3.2 4.2-4.8 7.5-4.8s5.9 1.6 7.5 4.8" />
            </svg>
          </span>
        )}

        <div className="flex flex-col gap-1">
          {!photoUrl && <p className="ct-help">{t.photoNone}</p>}
          <FileButton
            label={busy ? t.photoUploading : photoUrl ? t.photoReplace : t.photoUpload}
            accept={PHOTO_MIME.join(",")}
            disabled={busy}
            hint={t.photoRules}
            onFile={onFile}
          />
        </div>
      </div>
    </Card>
  );
}
