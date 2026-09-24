"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileButton } from "@/components/ui/FileButton";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { useToast } from "@/components/ui/Toast";
import { setMyCv } from "./actions";
import { CV_BUCKET, CV_MIME, MAX_CV_BYTES } from "./felder";
import { portraitPath } from "./portraet";

export type CvStrings = {
  title: string;
  lead: string;
  none: string;
  current: string;
  open: string;
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
 * Lebenslauf im Profil (TAL-013 B3). Gleicher Weg wie das Porträt: Datei
 * direkt in den privaten Bucket `person-cv` (Pfad `<person_id>/<datei>`),
 * danach setzt `set_my_cv` den Pfad. Sehen dürfen ihn die Person, das Team
 * und der gastgebende Partner einer Bewerbung mit Weitergabe-Einwilligung —
 * nie als Liste (Konrad 24.09.).
 */
export function CvUpload({
  personId,
  cvUrl,
  t,
  rpcMessages,
}: {
  personId: string;
  /** Signierte Adresse des aktuellen Lebenslaufs; `null`, solange keiner da ist. */
  cvUrl: string | null;
  t: CvStrings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  async function onFile(file: File) {
    if (file.size > MAX_CV_BYTES) {
      toast("error", t.tooBig);
      return;
    }
    if (file.type && !CV_MIME.includes(file.type)) {
      toast("error", t.wrongType);
      return;
    }
    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // Dieselbe Pfadform wie beim Porträt: genau zwei Segmente.
      const path = portraitPath(personId, file.name, crypto.randomUUID());
      const { error } = await supabase.storage.from(CV_BUCKET).upload(path, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
      if (error) {
        toast("error", `${t.failed} (${error.message})`);
        return;
      }
      startTransition(async () => {
        const res = await setMyCv(path);
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
      const res = await setMyCv(null);
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
    <Card id="lebenslauf">
      <h2 className="ct-h2 mb-1 text-ink">{t.title}</h2>
      <p className="ct-help mb-4">{t.lead}</p>
      <div className="flex flex-col gap-2">
        {cvUrl ? (
          <p className="ct-small">
            {t.current}{" "}
            <a href={cvUrl} {...neuesFenster} className="ct-link">
              {t.open}
            </a>
          </p>
        ) : (
          <p className="ct-help">{t.none}</p>
        )}
        <FileButton
          uploadLabel={t.upload}
          changeLabel={t.change}
          label={busy ? t.uploading : cvUrl ? t.replace : t.upload}
          accept={CV_MIME.join(",")}
          disabled={busy}
          hint={t.rules}
          onFile={onFile}
        />
        {cvUrl && (
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy} className="self-start">
            {t.remove}
          </Button>
        )}
      </div>
    </Card>
  );
}
