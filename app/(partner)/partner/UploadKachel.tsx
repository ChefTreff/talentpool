"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { acceptAttribute, checkFileRules, formatBytes, type FileRules } from "@/lib/partner/file-rules";
import { Badge } from "@/components/ui/Badge";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { registerPartnerAsset, submitDeliverable } from "./actions";
import { BUCKET, uploadDeliverableFile } from "./upload";
import type { Deliverable, DeliverableAsset } from "./types";

/**
 * Ein Upload-Feld je Pflicht — **eine** Umsetzung für jede Stelle, an der der
 * Partner dieselbe Datei hochladen kann (PART-035: „dasselbe Upload-Feld an drei
 * Orten gespiegelt“): Logo-Schritt im Onboarding (PART-060), Dateien (PART-065).
 * Der Upload bleibt an die Pflicht gebunden; einen freien Upload gibt es nicht.
 */

/** Aktuelle Fassung einer Pflicht: die jüngste nicht zurückgewiesene, sonst die jüngste. */
export function aktuelleFassung(d: Deliverable): DeliverableAsset | null {
  return d.assets.find((a) => a.status !== "rejected") ?? d.assets[0] ?? null;
}

/** SVG, PNG und JPG zeigt der Browser; PDF und EPS nicht — dort bleibt es beim Dateinamen. */
function vorschaubar(a: DeliverableAsset): boolean {
  const mime = (a.mime ?? "").toLowerCase();
  return (
    mime === "image/svg+xml" || mime === "image/png" || mime === "image/jpeg" ||
    /\.(svg|png|jpe?g)$/i.test(a.filename ?? a.storage_path)
  );
}

/**
 * Leseadressen für die Vorschau (zehn Minuten). Die Dateien liegen privat; nur
 * so sieht man, ob ein PNG wirklich freigestellt ist.
 */
export function useVorschau(pflichten: Deliverable[]): Record<string, string> {
  const [vorschau, setVorschau] = useState<Record<string, string>>({});
  const ziele = useMemo(
    () => pflichten.map(aktuelleFassung).filter((a): a is DeliverableAsset => a !== null && vorschaubar(a)),
    [pflichten],
  );
  useEffect(() => {
    if (ziele.length === 0) return;
    let aktiv = true;
    const supabase = createSupabaseBrowserClient();
    void Promise.all(
      ziele.map(async (a) => {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 600);
        return [a.id, data?.signedUrl ?? ""] as const;
      }),
    ).then((paare) => {
      if (aktiv) setVorschau(Object.fromEntries(paare.filter(([, url]) => url !== "")));
    });
    return () => {
      aktiv = false;
    };
  }, [ziele]);
  return vorschau;
}

export type UploadTexte = {
  /** „Die Datei ist größer als {max}.“ */
  tooBig: string;
  /** „Erlaubt sind nur {allowed} — die Datei ist {got}.“ */
  wrongType: string;
  failed: string;
  /** „Hochgeladen (Fassung {v})“ */
  done: string;
};

/**
 * Hochladen und einreichen: Dateiregeln im Browser (damit niemand 20 MB
 * hochlädt, um dann abgewiesen zu werden), dann der gemeinsame Kern
 * `uploadDeliverableFile` (`upload.ts`: privater Bucket, `register_partner_asset`
 * — prüft Pfad, Objekt und Regeln noch einmal, darauf allein ist Verlass —,
 * `submit_deliverable`). Diese Hülle hält nur Zustand und Meldungen.
 */
export function usePflichtUpload({
  orgId,
  editionId,
  texte,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  texte: UploadTexte;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [laedt, setLaedt] = useState<string | null>(null);
  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");

  async function hochladen(d: Deliverable, file: File) {
    const rules: FileRules = d.file_rules;
    const bad = checkFileRules(file, rules);
    if (bad) {
      const allowed = (rules?.ext ?? []).map((e) => `.${e}`).join(", ");
      toast(
        "error",
        bad.reason === "size"
          ? texte.tooBig.replace("{max}", bad.detail)
          : texte.wrongType.replace("{allowed}", allowed).replace("{got}", bad.detail),
      );
      return;
    }
    setLaedt(d.id);
    try {
      const res = await uploadDeliverableFile({
        supabase: createSupabaseBrowserClient(),
        registerAsset: registerPartnerAsset,
        submit: submitDeliverable,
        orgId,
        editionId,
        deliverableId: d.id,
        kind: d.key,
        file,
      });
      if (!res.ok) {
        // Scheitert die RPC, bleibt die Datei verwaist im Bucket; sie hier zu
        // löschen wäre der zweite Fehlerfall. Lieber melden und aufräumen lassen.
        toast("error", res.stage === "storage" ? `${texte.failed} (${res.message})` : message(res.key, res.detail));
        return;
      }
      toast("success", texte.done.replace("{v}", String(res.version)));
      router.refresh();
    } finally {
      setLaedt(null);
    }
  }

  return { laedt, hochladen };
}

/** Datei im privaten Bucket öffnen — die Adresse gilt eine Minute. */
export function useDateiOeffnen(fehlerText: string) {
  const toast = useToast();
  return async (path: string) => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast("error", fehlerText);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };
}

export type KachelTexte = {
  /** „{format}-Logo hochladen“ bzw. „{format}-Datei hochladen“ */
  upload: string;
  /** „{format}-Logo ersetzen“ */
  replace: string;
  none: string;
  /** „Erlaubt: {allowed}, höchstens {max}.“ */
  hint: string;
  uploading: string;
  /** „Vorschau {format}“ */
  previewAlt: string;
  submittedOn: string;
  reviewNote: string;
  upload_button: string;
  change_file: string;
};

/**
 * Die Kachel (Vorschlag des Design-Chats zu PART-060): Formatzeichen aus den
 * Dateiregeln, H3 mit dem Namen der Pflicht, bei vorhandener Datei Vorschau auf
 * Schachbrett, Dateiname, Fassung und Stand; fehlt die Datei, gestrichelter
 * Rand und ein Satz — Form und Text, nicht nur Farbe.
 */
export function UploadKachel({
  pflicht,
  titel,
  beschreibung,
  kontext,
  frist,
  vorschauUrl,
  kannHochladen,
  laedt,
  gesperrt,
  statusText,
  dateTime,
  t,
  onFile,
  onOeffnen,
}: {
  pflicht: Deliverable;
  titel: string;
  beschreibung?: string | null;
  /** Wozu die Datei gehört (Dateien-Seite: die Leistung), klein über dem Titel. */
  kontext?: string | null;
  /** Fristmarke, falls die Pflicht eine hat. */
  frist?: ReactNode;
  vorschauUrl?: string;
  kannHochladen: boolean;
  laedt: boolean;
  gesperrt: boolean;
  statusText: string;
  dateTime: Intl.DateTimeFormat;
  t: KachelTexte;
  onFile: (file: File) => void;
  onOeffnen: (path: string) => void;
}) {
  const current = aktuelleFassung(pflicht);
  const rules: FileRules = pflicht.file_rules;
  // Das Formatzeichen kommt aus den Dateiregeln, nicht aus dem Text — ein weiteres
  // Format bekommt so von selbst sein Zeichen.
  const format = (rules?.ext?.[0] ?? pflicht.key).toUpperCase();
  return (
    <section
      aria-labelledby={`pflicht-${pflicht.id}`}
      className={cn(
        "flex flex-col gap-3 rounded-ct-md border p-4",
        current ? "border-border" : "border-dashed border-border-strong",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="ct-h2 flex size-14 shrink-0 items-center justify-center rounded-ct-md bg-accent-soft text-accent-deep"
        >
          {format}
        </span>
        <div className="min-w-0 flex-1">
          {kontext && <p className="ct-eyebrow text-muted">{kontext}</p>}
          <h3 id={`pflicht-${pflicht.id}`} className="ct-h3 text-ink">
            {titel}
          </h3>
          {beschreibung && <p className="ct-help">{beschreibung}</p>}
        </div>
        {frist}
      </div>

      {current ? (
        <>
          {vorschauUrl && (
            <div className="flex h-28 items-center justify-center rounded-ct-sm border bg-pattern-transparent p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- Signierte Storage-Adresse, keine feste Größe. */}
              <img
                src={vorschauUrl}
                alt={t.previewAlt.replace("{format}", format)}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onOeffnen(current.storage_path)} className="ct-link break-all text-left">
              {current.filename ?? current.storage_path.split("/").pop()}
            </button>
            <span className="ct-help">v{current.version}</span>
            <Badge
              tone={pflicht.status === "accepted" ? "success" : pflicht.status === "rejected" ? "error" : "accent"}
            >
              {statusText}
            </Badge>
          </div>
          {pflicht.submitted_at && (
            <p className="ct-help">
              {t.submittedOn} {dateTime.format(new Date(pflicht.submitted_at))}
            </p>
          )}
          {pflicht.review_note && (
            <p className="ct-help text-error-ink">
              {t.reviewNote}: {pflicht.review_note}
            </p>
          )}
        </>
      ) : (
        <p className="ct-small text-muted">{t.none}</p>
      )}

      {kannHochladen && (
        <div className="mt-auto">
          <FileButton
            uploadLabel={t.upload_button}
            changeLabel={t.change_file}
            label={(current ? t.replace : t.upload).replace("{format}", format)}
            accept={acceptAttribute(rules)}
            disabled={gesperrt}
            hint={t.hint
              .replace("{allowed}", (rules?.ext ?? []).map((x) => `.${x}`).join(", "))
              .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
            onFile={onFile}
          />
          {laedt && <p className="ct-help mt-2">{t.uploading}</p>}
        </div>
      )}
    </section>
  );
}
