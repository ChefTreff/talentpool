"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { driveLink, ZUSTAND_REIHENFOLGE, type Uebersicht, type Zustand } from "@/lib/drive/anzeige";
import type { OrdnerRechte } from "@/lib/drive/api";
import type { Zusammenfassung } from "@/lib/drive/spiegel";
import { driveNachholen, driveOrdnerSetzen, drivePruefen } from "./drive-actions";

type Strings = Record<string, string>;

/** Form und Farbe: der Wortlaut steht immer im Badge (Design-Regel 4). */
const TON: Record<Zustand, BadgeTone> = {
  aktuell: "success",
  neu: "neutral",
  offen: "warning",
  verschieben: "warning",
  fehler: "error",
  ohne_slot: "neutral",
  ohne_ordner: "neutral",
};

const WORT: Record<Zustand, string> = {
  aktuell: "stateCurrent",
  neu: "stateNew",
  offen: "stateUpdate",
  verschieben: "stateMove",
  fehler: "stateError",
  ohne_slot: "stateNoSlot",
  ohne_ordner: "stateNoFolder",
};

const ZAHL: Record<Zustand, string> = {
  aktuell: "countCurrent",
  neu: "countNew",
  offen: "countUpdate",
  verschieben: "countMove",
  fehler: "countError",
  ohne_slot: "countNoSlot",
  ohne_ordner: "countNoFolder",
};

/** Mehr Zeilen stehen auf der Technik-Seite nicht; der Rest als Zahl. */
const MAX_ZEILEN = 30;

function fuellen(text: string, werte: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(werte[k] ?? ""));
}

/**
 * „Folien in Drive“ (SPK-023): Stand der Spiegelung in den Technik-Ordner,
 * Fehler je Präsentation, „Spiegelung nachholen“ und „Verbindung prüfen“.
 * Ohne Dienstkonto steht nur, was fehlt — die Knöpfe sind dann aus.
 */
export function DriveSpiegel({
  uebersicht,
  editionId,
  slotTexte,
  t,
  rpc,
}: {
  uebersicht: Uebersicht;
  editionId: string;
  /** Bühne und Beginn je Zeile, auf dem Server formatiert (keine Abweichung beim Hydrieren). */
  slotTexte: Record<string, string>;
  t: Strings;
  rpc: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const ordnerFeld = useId();
  const [pending, startTransition] = useTransition();
  const [laeuft, setLaeuft] = useState<"nachholen" | "pruefen" | "ordner" | null>(null);
  const [lauf, setLauf] = useState<Zusammenfassung | null>(null);
  const [pruefung, setPruefung] = useState<OrdnerRechte | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ordnerOffen, setOrdnerOffen] = useState(false);
  const [ordner, setOrdner] = useState(uebersicht.ordnerId ?? "");
  const [ordnerFehler, setOrdnerFehler] = useState<string | null>(null);

  const bereit = uebersicht.konto === "bereit";
  const kannLaufen = bereit && Boolean(uebersicht.ordnerId);

  function meldung(key: string, detail?: string): string {
    const text = t[`err_${key}`] ?? rpc[key] ?? rpc.unknown ?? key;
    return detail ? `${text} (${detail})` : text;
  }

  function nachholen() {
    setLaeuft("nachholen");
    setFehler(null);
    setPruefung(null);
    startTransition(async () => {
      const r = await driveNachholen(editionId);
      setLaeuft(null);
      if (!r.ok) return setFehler(meldung(r.key, r.detail));
      setLauf(r.data);
      router.refresh();
    });
  }

  function pruefen() {
    setLaeuft("pruefen");
    setFehler(null);
    setLauf(null);
    startTransition(async () => {
      const r = await drivePruefen(editionId);
      setLaeuft(null);
      if (!r.ok) return setFehler(meldung(r.key, r.detail));
      setPruefung(r.data);
    });
  }

  function ordnerSpeichern() {
    setLaeuft("ordner");
    setOrdnerFehler(null);
    startTransition(async () => {
      const r = await driveOrdnerSetzen(editionId, ordner);
      setLaeuft(null);
      if (!r.ok) return setOrdnerFehler(meldung(r.key, r.detail));
      setOrdnerOffen(false);
      toast("success", t.folderSaved);
      router.refresh();
    });
  }

  const kontoTon: BadgeTone = bereit ? "success" : uebersicht.konto === "ungueltig" ? "error" : "warning";
  const kontoWort = bereit ? t.accountReady : uebersicht.konto === "ungueltig" ? t.accountInvalid : t.accountMissing;

  const offen = uebersicht.zeilen
    .filter((z) => z.zustand !== "aktuell")
    .sort((a, b) => ZUSTAND_REIHENFOLGE.indexOf(a.zustand) - ZUSTAND_REIHENFOLGE.indexOf(b.zustand));
  const sichtbar = offen.slice(0, MAX_ZEILEN);
  const zahlen = ZUSTAND_REIHENFOLGE.filter((z) => uebersicht.zaehler[z] > 0);

  return (
    <Card id="drive" className="mb-6">
      <CardHeader
        title={t.title}
        description={t.lead}
        action={
          <Badge tone={kontoTon} className="whitespace-nowrap">
            {kontoWort}
          </Badge>
        }
      />

      <div className="flex flex-col gap-4">
        {!bereit && (
          <p className="ct-small text-ink">{uebersicht.konto === "ungueltig" ? t.accountInvalidBody : t.accountMissingBody}</p>
        )}

        {bereit && uebersicht.kontoAdresse && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="ct-help">{t.accountShare}</span>
            <span className="ct-small break-all text-ink">{uebersicht.kontoAdresse}</span>
            <CopyButton
              value={uebersicht.kontoAdresse}
              label={t.copy}
              copiedLabel={t.copied}
              failedLabel={t.copyFailed}
              variant="ghost"
              size="sm"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="ct-label text-muted">{t.folder}</span>
          {uebersicht.ordnerId ? (
            <a href={driveLink(uebersicht.ordnerId, true)} {...neuesFenster} className="ct-link ct-small">
              {t.folderOpen}
            </a>
          ) : (
            <span className="ct-small text-ink">{t.folderNone}</span>
          )}
          {!ordnerOffen && (
            <Button variant="ghost" size="sm" onClick={() => setOrdnerOffen(true)}>
              {t.folderChange}
            </Button>
          )}
        </div>

        {ordnerOffen && (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              ordnerSpeichern();
            }}
          >
            <Field label={t.folderLabel} htmlFor={ordnerFeld} hint={t.folderHelp} error={ordnerFehler ?? undefined} className="min-w-0 flex-1">
              <Input
                id={ordnerFeld}
                value={ordner}
                onChange={(e) => setOrdner(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                // `Field` vergibt die IDs `<id>-hint` und `<id>-error`.
                aria-describedby={ordnerFehler ? `${ordnerFeld}-error` : `${ordnerFeld}-hint`}
                aria-invalid={ordnerFehler ? true : undefined}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" loading={laeuft === "ordner"} disabled={pending}>
                {t.folderSave}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOrdnerOffen(false);
                  setOrdner(uebersicht.ordnerId ?? "");
                  setOrdnerFehler(null);
                }}
              >
                {t.cancel}
              </Button>
            </div>
          </form>
        )}

        {zahlen.length > 0 && (
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {zahlen.map((z) => (
              <li key={z} className="flex items-baseline gap-1.5">
                <span className="ct-label tabular-nums text-ink">{uebersicht.zaehler[z]}</span>
                <span className="ct-help">{t[ZAHL[z]]}</span>
              </li>
            ))}
          </ul>
        )}
        {uebersicht.verwaist > 0 && <p className="ct-help">{fuellen(t.orphans, { n: uebersicht.verwaist })}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={nachholen} loading={laeuft === "nachholen"} disabled={!kannLaufen || pending}>
            {laeuft === "nachholen" ? t.running : t.run}
          </Button>
          <Button variant="ghost" onClick={pruefen} loading={laeuft === "pruefen"} disabled={!kannLaufen || pending}>
            {laeuft === "pruefen" ? t.checking : t.check}
          </Button>
        </div>

        <div aria-live="polite" className="flex flex-col gap-1">
          {lauf && (
            <>
              <p className="ct-small text-ink">
                {lauf.gespiegelt + lauf.verschoben + lauf.fehler + lauf.entfernt === 0
                  ? t.runNothing
                  : fuellen(t.runResult, {
                      gespiegelt: lauf.gespiegelt,
                      verschoben: lauf.verschoben,
                      fehler: lauf.fehler + lauf.entfernenFehler,
                      entfernt: lauf.entfernt,
                    })}
              </p>
              {lauf.offen > 0 && <p className="ct-help">{fuellen(t.runMore, { offen: lauf.offen })}</p>}
            </>
          )}
          {pruefung && (
            <>
              <p className="ct-small text-ink">
                {fuellen(t.checkOk, { name: pruefung.name })} · {pruefung.geteilteAblage ? t.checkShared : t.checkNotShared}
              </p>
              <p className="ct-help">
                {t.rightAdd}: {pruefung.anlegen ? t.yes : t.no} · {t.rightMove}: {pruefung.verschieben ? t.yes : t.no} ·{" "}
                {t.rightDelete}: {pruefung.loeschen ? t.yes : t.no}
              </p>
              {(!pruefung.verschieben || !pruefung.loeschen) && <p className="ct-help text-warning-ink">{t.rightsHint}</p>}
            </>
          )}
        </div>
        {fehler && (
          <p role="alert" className="ct-small text-error-ink">
            {fehler}
          </p>
        )}

        {sichtbar.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Th>{t.colSpeaker}</Th>
                <Th>{t.colSession}</Th>
                <Th>{t.colSlot}</Th>
                <Th>{t.colState}</Th>
                <Th>{t.colDrive}</Th>
              </Thead>
              <Tbody>
                {sichtbar.map((z) => (
                  <Tr key={z.schluessel}>
                    <Td>{z.speaker}</Td>
                    <Td>
                      {z.session}
                      {z.version > 1 && <span className="ct-help"> · v{z.version}</span>}
                    </Td>
                    <Td>{slotTexte[z.schluessel] ?? "—"}</Td>
                    <Td>
                      <Badge tone={TON[z.zustand]} className="whitespace-nowrap">
                        {t[WORT[z.zustand]]}
                      </Badge>
                      {z.fehler && <p className="ct-help mt-1">{meldung(z.fehler, z.detail ?? undefined)}</p>}
                    </Td>
                    <Td>
                      {z.driveId ? (
                        <a href={driveLink(z.driveId)} {...neuesFenster} className="ct-link">
                          {t.openFile}
                        </a>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {offen.length > sichtbar.length && (
              <p className="ct-help mt-2">{fuellen(t.moreRows, { n: offen.length - sichtbar.length })}</p>
            )}
          </div>
        ) : uebersicht.zeilen.length > 0 ? (
          <p className="ct-help">{fuellen(t.allDone, { n: uebersicht.zeilen.length })}</p>
        ) : (
          <p className="ct-help">{t.empty}</p>
        )}
      </div>
    </Card>
  );
}
