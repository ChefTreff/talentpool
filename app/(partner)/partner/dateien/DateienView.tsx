"use client";

import type { Locale } from "@/lib/i18n/shared";
import { formatBytes } from "@/lib/partner/file-rules";
import { FristMarke, type FristTexte } from "@/components/ui/FristMarke";
import { cn } from "@/components/ui/cn";
import {
  UploadKachel,
  aktuelleFassung,
  useDateiOeffnen,
  usePflichtUpload,
  useVorschau,
} from "../UploadKachel";
import type { Deliverable } from "../types";

type Strings = Record<string, string>;

/** Zeile aus `my_partner_documents()` (PART-065). */
export type BelegZeile = {
  id: string;
  beleg: "angebot" | "rechnung" | "messeshop_rechnung";
  filename: string;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
};

const BELEGARTEN = ["angebot", "rechnung", "messeshop_rechnung"] as const;

/** Status, in denen der Partner noch hochladen kann (wie `submit_deliverable`). */
const HOCHLADBAR = new Set(["open", "rejected", "overdue"]);

/**
 * Die Dateien-Seite als feste Plätze (PART-065): je Datei, die das Portal von
 * euch braucht, ein Feld — leer oder mit der aktuellen Fassung, und mit
 * demselben Upload wie an der Aufgabe selbst (PART-035). Darunter die Belege
 * von uns: Angebot, Rechnung, Messeshop-Rechnung; auch sie als Plätze, damit
 * man sieht, was noch kommt.
 */
export function DateienView({
  orgId,
  editionId,
  pflichten,
  kontext,
  belege,
  canEdit,
  locale,
  dateLocale,
  fristTexte,
  statusText,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  /** Alle Upload-Pflichten dieser Organisation, auch die ohne Datei. */
  pflichten: Deliverable[];
  /** Wozu eine Pflicht gehört (Leistung oder „Allgemein“), je Pflicht-Id. */
  kontext: Record<string, string>;
  belege: BelegZeile[];
  canEdit: boolean;
  locale: Locale;
  dateLocale: string;
  fristTexte: FristTexte;
  /** Beschriftung je Pflicht-Status. */
  statusText: Record<string, string>;
  t: Strings;
  common: { upload: string; chooseOtherFile: string };
  rpcMessages: Record<string, string>;
}) {
  const vorschau = useVorschau(pflichten);
  const oeffnen = useDateiOeffnen(t.downloadFailed);
  const { laedt, hochladen } = usePflichtUpload({
    orgId,
    editionId,
    texte: { tooBig: t.uploadTooBig, wrongType: t.uploadWrongType, failed: t.uploadFailed, done: t.uploadDone },
    rpcMessages,
  });
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const label = (d: Deliverable) => (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;
  const beschreibung = (d: Deliverable) => (locale === "en" ? d.description_en : d.description_de) ?? null;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="dateien-uploads">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
          <h2 id="dateien-uploads" className="ct-h2 text-ink">
            {t.uploadsTitle}
          </h2>
          <span className="ct-help tabular-nums">
            {t.uploadsCount
              .replace("{n}", String(pflichten.filter((d) => aktuelleFassung(d) !== null).length))
              .replace("{total}", String(pflichten.length))}
          </span>
        </div>
        <p className="ct-help mt-2 mb-4">{t.uploadsLead}</p>
        {pflichten.length === 0 ? (
          <p className="ct-help">{t.uploadsNone}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pflichten.map((d) => {
              const current = aktuelleFassung(d);
              return (
                <UploadKachel
                  key={d.id}
                  pflicht={d}
                  titel={label(d)}
                  beschreibung={beschreibung(d)}
                  kontext={kontext[d.id] ?? null}
                  frist={
                    d.due_at && d.status !== "accepted" ? (
                      <FristMarke
                        kompakt
                        dueAt={d.due_at}
                        dateText={dateOnly.format(new Date(d.due_at))}
                        vorbei={d.status === "overdue"}
                        t={fristTexte}
                      />
                    ) : undefined
                  }
                  vorschauUrl={current ? vorschau[current.id] : undefined}
                  kannHochladen={canEdit && HOCHLADBAR.has(d.status)}
                  laedt={laedt === d.id}
                  gesperrt={laedt !== null}
                  statusText={statusText[d.status] ?? d.status}
                  dateTime={dateTime}
                  t={{
                    upload: t.uploadFormat,
                    replace: t.replaceFormat,
                    none: t.slotEmpty,
                    hint: t.uploadHint,
                    uploading: t.uploading,
                    previewAlt: t.previewAlt,
                    submittedOn: t.submittedOn,
                    reviewNote: t.reviewNote,
                    upload_button: common.upload,
                    change_file: common.chooseOtherFile,
                  }}
                  onFile={(file) => void hochladen(d, file)}
                  onOeffnen={(path) => void oeffnen(path)}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* PART-065: „Unbedingt enthalten sein müssen die Angebote und Rechnungen.“
          Sie kommen aus SevDesk (0122) — auch als leerer Platz, damit man weiss,
          dass sie hier erscheinen werden. */}
      <section aria-labelledby="dateien-belege">
        <h2 id="dateien-belege" className="ct-h2 border-b pb-2 text-ink">
          {t.docsTitle}
        </h2>
        <p className="ct-help mt-2 mb-4">{t.docsLead}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {BELEGARTEN.map((art) => {
            const liste = belege.filter((b) => b.beleg === art);
            return (
              <section
                key={art}
                aria-labelledby={`beleg-${art}`}
                className={cn(
                  "flex flex-col gap-2 rounded-ct-md border p-4",
                  liste.length > 0 ? "border-border" : "border-dashed border-border-strong",
                )}
              >
                <h3 id={`beleg-${art}`} className="ct-h3 text-ink">
                  {t[`doc_${art}`]}
                </h3>
                {liste.length === 0 ? (
                  <p className="ct-small text-muted">{t[`docEmpty_${art}`]}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {liste.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-baseline gap-x-2">
                        <button type="button" onClick={() => void oeffnen(b.storage_path)} className="ct-link text-left">
                          {t.docOpen.replace("{date}", dateOnly.format(new Date(b.created_at)))}
                        </button>
                        {b.size_bytes != null && <span className="ct-help">{formatBytes(b.size_bytes)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
