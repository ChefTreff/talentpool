"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonDownload } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { requestRemoval } from "./actions";

type Strings = Record<string, string>;

export type GalerieFoto = {
  photo_id: string;
  filename: string;
  credit: string | null;
  removal_requested: boolean;
  url: string | null;
  download: string | null;
};

/** Galerie eines Events (TAL-010): ansehen, herunterladen, Entfernen erbitten. */
export function FotoGalerie({ fotos, t, rpcMessages }: { fotos: GalerieFoto[]; t: Strings; rpcMessages: Strings }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fotos.map((f) => (
        <Foto key={f.photo_id} foto={f} t={t} rpcMessages={rpcMessages} />
      ))}
    </ul>
  );
}

function Foto({ foto, t, rpcMessages }: { foto: GalerieFoto; t: Strings; rpcMessages: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState(false);
  const [note, setNote] = useState("");

  return (
    <li className="flex flex-col gap-2">
      {foto.url && (
        // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse, kein next/image-Loader
        <img src={foto.url} alt={foto.credit ?? foto.filename} className="aspect-[4/3] w-full rounded-ct-md object-cover" loading="lazy" />
      )}
      {foto.credit && <p className="ct-help">{foto.credit}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {foto.download && (
          <ButtonDownload href={foto.download} size="sm" variant="secondary">{t.download}</ButtonDownload>
        )}
        {foto.removal_requested ? (
          <Badge tone="warning">{t.removalRequested}</Badge>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOffen((o) => !o)}>{t.requestRemoval}</Button>
        )}
      </div>
      {offen && !foto.removal_requested && (
        <div className="flex flex-col gap-2">
          <Textarea aria-label={t.removalNote} placeholder={t.removalNote} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await requestRemoval(foto.photo_id, note);
                  if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
                  else {
                    toast("success", t.removalSent);
                    setOffen(false);
                    router.refresh();
                  }
                })
              }
            >
              {t.removalSend}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
