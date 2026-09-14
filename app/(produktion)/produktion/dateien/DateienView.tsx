"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";

export type EditionFileRow = {
  id: string;
  edition_id: string;
  edition_slug: string;
  kind: string;
  storage_path: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  label_de: string | null;
  label_en: string | null;
  audience: string[];
  sort_order: number;
  created_at: string;
};

type Strings = Record<string, string>;

/**
 * Hochladen, ansehen, entfernen — mehr braucht es hier nicht.
 *
 * Der Upload geht über eine Route und nicht direkt in den Bucket: der Bucket
 * hat keine Schreib-Policy für angemeldete Konten, und das soll er auch nicht
 * bekommen. Die Route prüft die Rolle, schreibt mit `service_role` und legt
 * den Eintrag über die RPC an.
 */
export function DateienView({
  editionId,
  files,
  kinds,
  dateLocale,
  t,
  common,
}: {
  editionId: string;
  files: EditionFileRow[];
  kinds: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; delete: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<string>(Object.keys(kinds)[0] ?? "hallenplan");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [loeschen, setLoeschen] = useState<EditionFileRow | null>(null);

  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });

  async function onUpload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("edition_id", editionId);
      body.set("kind", kind);
      if (label.trim() !== "") body.set("label_de", label.trim());
      const res = await fetch("/api/produktion/edition-files", { method: "POST", body });
      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !json.ok) {
        toast("error", `${t.uploadFailed}${json.error ? ` (${json.error})` : ""}`);
        return;
      }
      toast("success", t.uploaded);
      setLabel("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function onDelete(row: EditionFileRow) {
    startTransition(async () => {
      const res = await fetch(`/api/produktion/edition-files?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast("error", t.deleteFailed);
        return;
      }
      toast("success", t.deleted);
      setLoeschen(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="ct-h3 text-ink">{t.addTitle}</h2>
        <p className="ct-small mt-1 leading-6">{t.addBody}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <Field label={t.kind} htmlFor="kind">
            <Select
              id="kind"
              value={kind}
              options={Object.entries(kinds).map(([value, l]) => ({ value, label: l }))}
              onChange={(e) => setKind(e.target.value)}
            />
          </Field>
          <Field label={t.label} htmlFor="label" hint={t.labelHint}>
            <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <FileButton
            label={t.upload}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.svg"
            disabled={busy}
            hint={t.uploadHint}
            onFile={(file) => void onUpload(file)}
          />
        </div>
        {busy && <p className="ct-help mt-2">{t.uploading}</p>}
      </Card>

      {files.length === 0 ? (
        <EmptyState title={t.emptyListTitle} description={t.emptyListBody} />
      ) : (
        <Card className="p-0">
          <ul className="flex flex-col">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
              >
                <Badge tone="neutral">{kinds[f.kind] ?? f.kind}</Badge>
                <span className="ct-small min-w-0 flex-1 text-ink">
                  {f.label_de ?? f.filename}
                  <span className="ct-help block">
                    {f.filename} · {dateTime.format(new Date(f.created_at))}
                  </span>
                </span>
                <span className="ct-help">{f.edition_slug}</span>
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
          body={t.deleteBody.replace("{name}", loeschen.label_de ?? loeschen.filename)}
          confirmLabel={common.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => onDelete(loeschen)}
          onCancel={() => setLoeschen(null)}
        />
      )}
    </div>
  );
}
