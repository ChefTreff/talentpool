"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/shared";
import { acceptAttribute, formatBytes, type FileRules } from "@/lib/partner/file-rules";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { FileButton } from "@/components/ui/FileButton";
import { FristMarke, type FristTexte } from "@/components/ui/FristMarke";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { aktuelleFassung, useDateiOeffnen, usePflichtUpload, useVorschau } from "../UploadKachel";
import type { Deliverable } from "../types";
import { HOCHLADBAR, dateiFormat, dateiName, dateiReihenfolge, einzigesFormat } from "./zeilen";

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

/** Zustand in Wort **und** Farbe (Regel 4): offen und zurückgewiesen verlangen etwas, überfällig ist rot. */
const STAND_TON: Record<Deliverable["status"], BadgeTone> = {
  open: "warning",
  overdue: "error",
  submitted: "accent",
  accepted: "success",
  rejected: "error",
};

/**
 * Die Dateien-Seite als Tabelle (PART-109, Konrad 08.10.2026, K-73): **eine Zeile je Datei** — Name, Stand, Frist,
 * Aktion —, und alles Weitere liegt hinter dem Namen im Schubfach: Beschreibung, was wir brauchen, Vorschau, die
 * aktuelle Datei und der Upload. Vorher war jede Datei eine Kachel mit Formatzeichen, Vorschau, Regeltext und
 * Upload, mehrere Zeilen hoch.
 *
 * **Offenes zuerst** (`zeilen.ts`). Darunter **Angebot und Rechnungen**, je Beleg eine Zeile mit Datum, Größe und
 * „Herunterladen“; eine Belegart ohne Datei steht als gedämpfte Zeile mit dem Satz, wann sie kommt. Was heute da ist
 * und bleibt: dieselben Haken (`usePflichtUpload`, `useVorschau`, `useDateiOeffnen`), derselbe Upload an der Pflicht
 * (PART-035: „dasselbe Upload-Feld an drei Orten“) — nur die Hülle ist eine Zeile mit Schubfach statt einer Kachel.
 * `UploadKachel` bleibt im Logo-Abschnitt von „Eure Daten“.
 *
 * Fehler und Erfolg des Uploads stehen im Schubfach neben dem Knopf (`Drawer error`, ADM-062), nicht im Toast.
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
  common: { upload: string; chooseOtherFile: string; close: string };
  rpcMessages: Record<string, string>;
}) {
  const [offenId, setOffenId] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: "fehler" | "erfolg"; text: string } | null>(null);
  const vorschau = useVorschau(pflichten);
  const oeffnen = useDateiOeffnen(t.downloadFailed);
  const { laedt, hochladen } = usePflichtUpload({
    orgId,
    editionId,
    texte: { tooBig: t.uploadTooBig, wrongType: t.uploadWrongType, failed: t.uploadFailed, done: t.uploadDone },
    rpcMessages,
    meldung: {
      fehler: (text) => setMeldung({ art: "fehler", text }),
      erfolg: (text) => setMeldung({ art: "erfolg", text }),
    },
  });
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const label = (d: Deliverable) => (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;
  const beschreibung = (d: Deliverable) => (locale === "en" ? d.description_en : d.description_de) ?? null;

  const geordnet = dateiReihenfolge(pflichten);
  const offen = offenId ? (pflichten.find((d) => d.id === offenId) ?? null) : null;
  const offenFassung = offen ? aktuelleFassung(offen) : null;
  const schliessen = () => {
    setOffenId(null);
    setMeldung(null);
  };

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
          <Table stapeln>
            <Thead>
              <Th className="w-1/3">{t.colFile}</Th>
              <Th>{t.colState}</Th>
              <Th>{t.colDeadline}</Th>
              <Th>
                <span className="sr-only">{t.colAction}</span>
              </Th>
            </Thead>
            <Tbody>
              {geordnet.map((d) => {
                const current = aktuelleFassung(d);
                const darfHochladen = canEdit && HOCHLADBAR.has(d.status);
                const name = dateiName(label(d), d.file_rules);
                return (
                  <Tr key={d.id}>
                    {/* Der Name öffnet das Schubfach: `ct-ziel` macht die ganze Zelle zum Ziel. */}
                    <Td className="relative">
                      <button type="button" onClick={() => setOffenId(d.id)} className="ct-link ct-ziel text-left font-medium">
                        {name}
                      </button>
                      <span className="ct-help mt-0.5 block">{kontext[d.id]}</span>
                    </Td>
                    <Td label={t.colState}>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge tone={STAND_TON[d.status]}>{statusText[d.status] ?? d.status}</Badge>
                        {current && d.status !== "open" && <span className="ct-help">v{current.version}</span>}
                      </span>
                      {d.status === "rejected" && d.review_note && (
                        <span className="ct-help mt-1 block max-w-xs text-error-ink">{d.review_note}</span>
                      )}
                    </Td>
                    <Td label={t.colDeadline}>
                      {/* Ohne Frist bleibt die Zelle leer: gestapelt fällt dann auch die Beschriftung weg (`td:empty`). */}
                      {d.due_at && d.status !== "accepted" ? (
                        <FristMarke
                          kompakt
                          dueAt={d.due_at}
                          dateText={dateOnly.format(new Date(d.due_at))}
                          vorbei={d.status === "overdue"}
                          t={fristTexte}
                        />
                      ) : null}
                    </Td>
                    <Td>
                      {darfHochladen ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`${common.upload}: ${name}`}
                          onClick={() => setOffenId(d.id)}
                        >
                          {common.upload}
                        </Button>
                      ) : current ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`${t.actionOpen}: ${name}`}
                          onClick={() => void oeffnen(current.storage_path)}
                        >
                          {t.actionOpen}
                        </Button>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </section>

      {/* PART-065: „Unbedingt enthalten sein müssen die Angebote und Rechnungen.“ Sie kommen aus SevDesk (0122) —
          auch als gedämpfte Zeile ohne Datei, damit man weiss, dass sie hier erscheinen werden. */}
      <section aria-labelledby="dateien-belege">
        <h2 id="dateien-belege" className="ct-h2 border-b pb-2 text-ink">
          {t.docsTitle}
        </h2>
        <p className="ct-help mt-2 mb-4">{t.docsLead}</p>
        <Table stapeln>
          <Thead>
            <Th>{t.docColDoc}</Th>
            <Th>{t.docColDate}</Th>
            <Th numeric>{t.docColSize}</Th>
            <Th>
              <span className="sr-only">{t.colAction}</span>
            </Th>
          </Thead>
          <Tbody>
            {BELEGARTEN.flatMap((art) => {
              const liste = belege.filter((b) => b.beleg === art);
              if (liste.length === 0) {
                return [
                  <Tr key={art}>
                    <Td>
                      <span className="ct-label text-ink">{t[`doc_${art}`]}</span>
                    </Td>
                    <Td colSpan={3} className="ct-small text-muted">
                      {t[`docEmpty_${art}`]}
                    </Td>
                  </Tr>,
                ];
              }
              return liste.map((b) => {
                const datum = dateOnly.format(new Date(b.created_at));
                return (
                  <Tr key={b.id}>
                    <Td>
                      <span className="ct-label text-ink">{t[`doc_${art}`]}</span>
                    </Td>
                    <Td label={t.docColDate} className="text-muted">
                      {datum}
                    </Td>
                    <Td label={t.docColSize} numeric className="text-muted">
                      {b.size_bytes != null ? formatBytes(b.size_bytes) : "—"}
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`${t.docDownload}: ${t[`doc_${art}`]}, ${datum}`}
                        onClick={() => void oeffnen(b.storage_path)}
                      >
                        {t.docDownload}
                      </Button>
                    </Td>
                  </Tr>
                );
              });
            })}
          </Tbody>
        </Table>
      </section>

      {offen && (
        <Drawer
          open
          onClose={schliessen}
          title={label(offen)}
          closeLabel={common.close}
          error={meldung?.art === "fehler" ? meldung.text : null}
        >
          <DateiDetails
            pflicht={offen}
            kontext={kontext[offen.id] ?? null}
            beschreibung={beschreibung(offen)}
            vorschauUrl={offenFassung ? vorschau[offenFassung.id] : undefined}
            kannHochladen={canEdit && HOCHLADBAR.has(offen.status)}
            laedt={laedt === offen.id}
            erfolg={meldung?.art === "erfolg" ? meldung.text : null}
            statusText={statusText[offen.status] ?? offen.status}
            dateTime={dateTime}
            t={t}
            common={common}
            onFile={(file) => {
              setMeldung(null);
              void hochladen(offen, file);
            }}
            onOeffnen={(path) => void oeffnen(path)}
          />
        </Drawer>
      )}
    </div>
  );
}

/**
 * Was hinter dem Namen steht: wozu die Datei gehört, was wir dazu brauchen (Formate und höchste Größe aus den
 * Dateiregeln), die aktuelle Datei mit Vorschau auf dem Schachbrett, Fassung, Stand und Datum, die Rückmeldung der
 * Prüfung — und der Upload, zweistufig (wählen, dann hochladen; `FileButton`, wie im Schubfach der Grafiken).
 *
 * **Der Erfolg steht bei der aktuellen Datei, nicht beim Knopf:** nach dem Einreichen ist die Datei „eingereicht“, der
 * Upload-Knopf entfällt, und eine Meldung an seinem Platz wäre mit ihm verschwunden.
 */
function DateiDetails({
  pflicht,
  kontext,
  beschreibung,
  vorschauUrl,
  kannHochladen,
  laedt,
  erfolg,
  statusText,
  dateTime,
  t,
  common,
  onFile,
  onOeffnen,
}: {
  pflicht: Deliverable;
  kontext: string | null;
  beschreibung: string | null;
  vorschauUrl?: string;
  kannHochladen: boolean;
  laedt: boolean;
  erfolg: string | null;
  statusText: string;
  dateTime: Intl.DateTimeFormat;
  t: Strings;
  common: { upload: string; chooseOtherFile: string };
  onFile: (file: File) => void;
  onOeffnen: (path: string) => void;
}) {
  const current = aktuelleFassung(pflicht);
  const rules = pflicht.file_rules as FileRules;
  const format = einzigesFormat(rules);
  const erlaubt = (rules?.ext ?? []).map((x) => `.${x}`).join(", ");
  // Mit mehreren erlaubten Formaten steht keines im Knopf (`einzigesFormat`): „PDF-Datei hochladen“ hieße, die anderen zu verbieten.
  const uploadText = format
    ? (current ? t.replaceFormat : t.uploadFormat).replace("{format}", format)
    : current
      ? t.replaceAny
      : t.uploadAny;
  return (
    <div className="flex flex-col gap-6">
      {/* Vorlesesoftware: der Platz für die Erfolgsmeldung steht von Anfang an da (wie bei `FileButton`). */}
      <span role="status" className="sr-only">
        {erfolg ?? ""}
      </span>

      {(kontext || beschreibung) && (
        <div>
          {kontext && <p className="ct-eyebrow text-muted">{kontext}</p>}
          {beschreibung && <p className="ct-small mt-1">{beschreibung}</p>}
        </div>
      )}

      <section aria-labelledby={`brauchen-${pflicht.id}`}>
        <h3 id={`brauchen-${pflicht.id}`} className="ct-label text-ink">
          {t.drawerNeed}
        </h3>
        <p className="ct-help mt-1">
          {t.uploadHint.replace("{allowed}", erlaubt).replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
        </p>
      </section>

      <section aria-labelledby={`aktuell-${pflicht.id}`} className="flex flex-col gap-3">
        <h3 id={`aktuell-${pflicht.id}`} className="ct-label text-ink">
          {t.drawerCurrent}
        </h3>
        {erfolg && <p className="ct-small text-success-ink">{erfolg}</p>}
        {current ? (
          <>
            {vorschauUrl && (
              <div className="flex h-40 items-center justify-center rounded-ct-sm border bg-pattern-transparent p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- Signierte Storage-Adresse, keine feste Größe. */}
                <img
                  src={vorschauUrl}
                  alt={t.previewAlt.replace("{format}", dateiFormat(current)).trim()}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onOeffnen(current.storage_path)} className="ct-link break-all text-left">
                {current.filename ?? current.storage_path.split("/").pop()}
              </button>
              <span className="ct-help">{t.drawerVersion.replace("{v}", String(current.version))}</span>
              <Badge tone={STAND_TON[pflicht.status]}>{statusText}</Badge>
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
          <p className="ct-small text-muted">{t.slotEmpty}</p>
        )}
      </section>

      {kannHochladen && (
        <div className="flex flex-col gap-2">
          {/* Auswählen ist zweitrangig, das Hochladen danach die eine Hauptaktion des Schubfachs. */}
          <FileButton
            variant="secondary"
            uploadLabel={common.upload}
            changeLabel={common.chooseOtherFile}
            label={laedt ? t.uploading : uploadText}
            accept={acceptAttribute(rules)}
            disabled={laedt}
            laedt={laedt}
            onFile={onFile}
          />
          <p className="ct-help">{t.drawerSameField}</p>
        </div>
      )}
    </div>
  );
}
