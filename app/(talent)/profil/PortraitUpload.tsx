"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileButton } from "@/components/ui/FileButton";
import { PortraitShape } from "@/components/ui/PortraitShape";
import { useToast } from "@/components/ui/Toast";
import { setMyPortrait } from "./actions";
import { MAX_PORTRAIT_BYTES, PORTRAIT_BUCKET, PORTRAIT_MIME, portraitPath } from "./portraet";

export type PortraitStrings = {
  title: string;
  lead: string;
  none: string;
  upload: string;
  replace: string;
  change: string;
  remove: string;
  uploading: string;
  done: string;
  removed: string;
  tooBig: string;
  wrongType: string;
  failed: string;
  rules: string;
};

/**
 * Das Porträt im Teilnehmer-Profil (TAL-012).
 *
 * Gleicher Weg wie beim Speaker-Foto: die Datei geht **direkt** in den
 * privaten Bucket (die Storage-Policy lässt nur `<eigene person_id>/<datei>`
 * zu), danach setzt `set_my_photo` den Pfad am Profil. Gezeigt wird über eine
 * signierte Adresse, die die Seite serverseitig erzeugt.
 *
 * Die Form ist dieselbe wie überall für Personen (`PortraitShape`,
 * Entscheidung 17.09.) — ohne Foto steht die Initiale darin.
 */
export function PortraitUpload({
  personId,
  name,
  photoUrl,
  t,
  rpcMessages,
}: {
  personId: string;
  name: string;
  /** Signierte Adresse des aktuellen Porträts; `null`, solange keins da ist. */
  photoUrl: string | null;
  t: PortraitStrings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  async function onFile(file: File) {
    if (file.size > MAX_PORTRAIT_BYTES) {
      toast("error", t.tooBig);
      return;
    }
    // Leerer Typ = der Browser kennt ihn nicht; der Bucket prüft ohnehin.
    if (file.type && !PORTRAIT_MIME.includes(file.type)) {
      toast("error", t.wrongType);
      return;
    }

    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = portraitPath(personId, file.name, crypto.randomUUID());
      const { error } = await supabase.storage.from(PORTRAIT_BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) {
        toast("error", `${t.failed} (${error.message})`);
        return;
      }
      startTransition(async () => {
        const res = await setMyPortrait(path);
        if (!res.ok) {
          toast("error", message(res.key));
          return;
        }
        toast("success", t.done);
        router.refresh();
      });
    } finally {
      setUploading(false);
    }
  }

  function onRemove() {
    startTransition(async () => {
      const res = await setMyPortrait(null);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.removed);
      router.refresh();
    });
  }

  const busy = uploading || pending;

  return (
    <Card id="portraet">
      <h2 className="ct-h2 mb-1 text-ink">{t.title}</h2>
      <p className="ct-help mb-4">{t.lead}</p>

      <div className="flex flex-wrap items-center gap-6">
        <PortraitShape name={name} photoUrl={photoUrl} size="lg" />

        <div className="flex flex-col gap-2">
          {!photoUrl && <p className="ct-help">{t.none}</p>}
          <FileButton
            uploadLabel={t.upload}
            changeLabel={t.change}
            label={busy ? t.uploading : photoUrl ? t.replace : t.upload}
            accept={PORTRAIT_MIME.join(",")}
            disabled={busy}
            hint={t.rules}
            onFile={onFile}
          />
          {photoUrl && (
            <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy} className="self-start">
              {t.remove}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
