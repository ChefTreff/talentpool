"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FileButton } from "@/components/ui/FileButton";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { postJson, readJson } from "@/lib/fetch-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET, pruefeFoto } from "@/lib/fotos/regeln";
import { setPhoto } from "./actions";

type Strings = Record<string, string>;

export type AdminFoto = {
  photo_id: string;
  filename: string;
  credit: string | null;
  published: boolean;
  open_requests: number;
  url: string | null;
};

/**
 * Fotos eines Events verwalten (TAL-010): mehrere Bilder auf einmal hochladen
 * (direkt zu Supabase, signierter Platz von `/api/admin/fotos`), dann je Foto
 * veröffentlichen und Credit setzen oder löschen. Neue Fotos sind erst
 * unveröffentlicht — das Team wählt aus, bevor Teilnehmende etwas sehen.
 */
export function FotoVerwaltung({ eventId, fotos, t }: { eventId: string; fotos: AdminFoto[]; t: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function hochladen(files: File[]) {
    let ok = 0;
    for (const [i, file] of files.entries()) {
      setBusy(t.uploading.replace("{n}", String(i + 1)).replace("{von}", String(files.length)));
      const pruefung = pruefeFoto(file);
      if (!pruefung.ok) {
        toast("error", `${file.name}: ${pruefung.key === "too_large" ? t.tooLarge : t.wrongType}`);
        continue;
      }
      const platz = await postJson<{ path: string; token: string }>("/api/admin/fotos?step=url", {
        event_id: eventId, filename: file.name, content_type: file.type, size_bytes: file.size,
      });
      if (!platz.ok) { toast("error", `${file.name}: ${t.failed}`); continue; }
      const { error } = await createSupabaseBrowserClient().storage.from(PHOTO_BUCKET)
        .uploadToSignedUrl(platz.data.path, platz.data.token, file, { contentType: file.type });
      if (error) { toast("error", `${file.name}: ${t.failed}`); continue; }
      const zeile = await postJson<{ ok: boolean }>("/api/admin/fotos", { event_id: eventId, path: platz.data.path, filename: file.name });
      if (!zeile.ok) { toast("error", `${file.name}: ${t.failed}`); continue; }
      ok += 1;
    }
    setBusy(null);
    if (ok > 0) toast("success", t.uploaded.replace("{n}", String(ok)));
    router.refresh();
  }

  async function loeschen(id: string) {
    const res = await fetch(`/api/admin/fotos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await readJson<{ error?: string }>(res);
      toast("error", json?.error === "not_allowed" ? t.notAllowed : t.failed);
      return;
    }
    toast("success", t.deleted);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <FileButton
        label={busy ?? t.choose}
        accept="image/jpeg,image/png,image/webp"
        onFiles={hochladen}
        laedt={busy !== null}
        hint={t.uploadHint}
      />
      {fotos.length === 0 ? (
        <p className="ct-help">{t.none}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fotos.map((f) => (
            <FotoKarte key={f.photo_id} foto={f} t={t} pending={pending} start={start} onDelete={loeschen} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FotoKarte({
  foto,
  t,
  pending,
  start,
  onDelete,
}: {
  foto: AdminFoto;
  t: Strings;
  pending: boolean;
  start: (fn: () => Promise<void>) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [credit, setCredit] = useState(foto.credit ?? "");
  const speichern = (published: boolean) =>
    start(async () => {
      const res = await setPhoto(foto.photo_id, published, credit);
      if (!res.ok) toast("error", t.failed);
      else {
        toast("success", published ? t.publishedToast : t.unpublishedToast);
        router.refresh();
      }
    });

  return (
    <li className="flex flex-col gap-2 rounded-ct-md border bg-surface p-3">
      {foto.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse, kein next/image-Loader
        <img src={foto.url} alt={foto.filename} className="aspect-[4/3] w-full rounded-ct-sm object-cover" loading="lazy" />
      ) : (
        <div className="aspect-[4/3] w-full rounded-ct-sm bg-surface-hover" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={foto.published ? "success" : "neutral"}>{foto.published ? t.published : t.draft}</Badge>
        {foto.open_requests > 0 && <Badge tone="warning">{t.removalOpen}</Badge>}
      </div>
      <Input aria-label={t.credit} placeholder={t.credit} maxLength={120} value={credit} disabled={pending} onChange={(e) => setCredit(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => speichern(!foto.published)}>
          {foto.published ? t.unpublish : t.publish}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => onDelete(foto.photo_id))}>
          {t.delete}
        </Button>
      </div>
    </li>
  );
}
