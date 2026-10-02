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
import { postJson } from "@/lib/fetch-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { setzeZielgruppe } from "./actions";

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

const BUCKET = "edition-files";
/** Wie Bucket und Route: 25 MB. */
const MAX_BYTES = 25 * 1024 * 1024;
const ERLAUBT = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * Hochladen, ansehen, entfernen — mehr braucht es hier nicht.
 *
 * Der Bucket hat **keine** Schreib-Policy für angemeldete Konten, und das soll
 * er auch nicht bekommen. Die Route prüft deshalb die Rolle und gibt mit
 * `service_role` einen signierten Platz für genau einen Pfad heraus; die Bytes
 * gehen von hier direkt zu Supabase, der Eintrag entsteht über die RPC.
 *
 * **Warum nicht mehr durch unseren Server** (PROD-008, Konrad 21.09.): die
 * Plattform hält Funktionsrümpfe bei gut 4 MB an, und zwar mit einer
 * HTML-Seite. Der Hallenplan mit 2,9 MB ging durch, ein grösserer nicht — und
 * weil die Antwort ungeprüft als JSON gelesen wurde, brach der Aufruf still ab:
 * der Balken hörte auf, eine Meldung kam nie. Beides ist behoben.
 */
export function DateienView({
  editionId,
  files,
  kinds,
  audiences = {},
  dateLocale,
  t,
  common,
}: {
  editionId: string;
  files: EditionFileRow[];
  kinds: Record<string, string>;
  /**
   * PROD-009: Zielgruppen aus dem Vokabular `kb_audience` — wer die Datei im
   * Portal sieht. Optional, damit eine Seite ohne Auswahl weiter funktioniert
   * (dann gilt beim Hochladen wie bisher: alle).
   */
  audiences?: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; delete: string; upload: string; chooseOtherFile: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<string>(Object.keys(kinds)[0] ?? "hallenplan");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [loeschen, setLoeschen] = useState<EditionFileRow | null>(null);
  // PROD-009: Zielgruppe beim Hochladen (Vorgabe wie bisher: alle) und je Zeile änderbar.
  const [zielgruppe, setZielgruppe] = useState<string[]>(Object.keys(audiences));
  const [bearbeiten, setBearbeiten] = useState<{ id: string; audience: string[] } | null>(null);
  const mitZielgruppe = Object.keys(audiences).length > 0;

  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });

  /** Ein Fehler wird gesagt, nicht verschluckt — und nie geworfen. */
  function melden(key: string, detail?: string) {
    const text =
      key === "too_large"
        ? t.uploadTooLarge
        : key === "wrong_type"
          ? t.uploadWrongType
          : key === "forbidden" || key === "not_allowed"
            ? t.uploadNotAllowed
            : `${t.uploadFailed}${detail ? ` (${detail})` : ""}`;
    toast("error", text);
  }

  async function onUpload(file: File) {
    setBusy(true);
    try {
      // Zuerst hier prüfen: der Bucket weist es ohnehin ab, aber dann hätte
      // der Upload schon begonnen — und das dauert bei 20 MB.
      if (!ERLAUBT.includes(file.type)) return melden("wrong_type");
      if (file.size > MAX_BYTES) return melden("too_large");
      if (mitZielgruppe && zielgruppe.length === 0) { toast("error", t.audienceRequired); return; }

      const platz = await postJson<{ path: string; token: string }>(
        "/api/produktion/edition-files?step=url",
        {
          edition_id: editionId,
          kind,
          content_type: file.type,
          size_bytes: file.size,
          filename: file.name,
        },
      );
      if (!platz.ok) return melden(platz.key, platz.detail);

      const browser = createSupabaseBrowserClient();
      const { error } = await browser.storage
        .from(BUCKET)
        .uploadToSignedUrl(platz.data.path, platz.data.token, file, { contentType: file.type });
      if (error) return melden("upload_failed");

      const zeile = await postJson<{ ok: boolean; id: string }>("/api/produktion/edition-files", {
        path: platz.data.path,
        edition_id: editionId,
        kind,
        filename: file.name,
        mime: file.type,
        size_bytes: file.size,
        ...(mitZielgruppe ? { audience: zielgruppe } : {}),
        ...(label.trim() !== "" ? { label_de: label.trim() } : {}),
      });
      if (!zeile.ok) return melden(zeile.key, zeile.detail);

      toast("success", t.uploaded);
      setLabel("");
      router.refresh();
    } catch {
      // Letzte Grenze. Was hier ankommt, hat niemand vorhergesehen — aber es
      // darf die Seite nicht kosten.
      melden("unknown");
    } finally {
      setBusy(false);
    }
  }

  function zielgruppeSpeichern(row: EditionFileRow) {
    if (!bearbeiten) return;
    startTransition(async () => {
      const r = await setzeZielgruppe(row.id, row.kind, bearbeiten.audience);
      if (!r.ok) { toast("error", r.key === "invalid_audience" ? t.audienceRequired : t.audienceFailed); return; }
      toast("success", t.audienceSaved);
      setBearbeiten(null);
      router.refresh();
    });
  }

  const auswahl = (wert: string[], setze: (n: string[]) => void, idPrefix: string) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {Object.entries(audiences).map(([key, l]) => (
        <label key={key} htmlFor={`${idPrefix}-${key}`} className="flex min-h-11 items-center gap-2 ct-small">
          <input
            id={`${idPrefix}-${key}`}
            type="checkbox"
            className="h-4 w-4"
            checked={wert.includes(key)}
            onChange={(e) => setze(e.target.checked ? [...wert, key] : wert.filter((x) => x !== key))}
          />
          {l}
        </label>
      ))}
    </div>
  );

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
        <h2 className="ct-h2 text-ink">{t.addTitle}</h2>
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
            uploadLabel={common.upload}
            changeLabel={common.chooseOtherFile}
            label={t.upload}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.svg"
            disabled={busy}
            hint={t.uploadHint}
            onFile={(file) => void onUpload(file)}
          />
        </div>
        {mitZielgruppe && (
          <fieldset className="mt-4">
            <legend className="ct-label">{t.audience}</legend>
            <p className="ct-help">{t.audienceHint}</p>
            {auswahl(zielgruppe, setZielgruppe, "neu")}
          </fieldset>
        )}
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
                <span className="flex flex-wrap gap-1">
                  {f.audience.map((a) => <Badge key={a}>{audiences[a] ?? a}</Badge>)}
                </span>
                <span className="ct-help">{f.edition_slug}</span>
                {mitZielgruppe && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setBearbeiten(bearbeiten?.id === f.id ? null : { id: f.id, audience: f.audience })}
                  >
                    {t.audienceEdit}
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setLoeschen(f)}>
                  {common.delete}
                </Button>
                {bearbeiten?.id === f.id && (
                  <div className="flex w-full flex-wrap items-center gap-3 pb-1">
                    {auswahl(bearbeiten.audience, (n) => setBearbeiten({ id: f.id, audience: n }), `z-${f.id}`)}
                    <Button size="sm" disabled={pending || bearbeiten.audience.length === 0} onClick={() => zielgruppeSpeichern(f)}>
                      {t.audienceSave}
                    </Button>
                  </div>
                )}
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
