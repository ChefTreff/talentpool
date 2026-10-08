"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFuss } from "@/components/ui/Modal";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import type { Aenderung } from "@/lib/audit/anzeige";

export type ProtokollZeile = {
  id: number;
  zeit: string;
  aktion: string;
  system: string;
  objekt: string | null;
  objektId: string | null;
  wer: string | null;
  felder: string[];
  weitere: number;
  aenderungen: Aenderung[];
};

/**
 * Die Liste des Protokolls (ADM-095 b, d): Anzeigename statt Systemname, in der
 * Zeile nur **welche** Felder sich geändert haben, die Werte im Overlay.
 * Vorher und Nachher als zwei grosse JSON-Felder zu zeigen, las niemand —
 * deshalb eine Feldliste („Feld · vorher · nachher“) mit einem Satz darüber, was passiert ist.
 */
export function ProtokollListe({ zeilen, t }: { zeilen: ProtokollZeile[]; t: Record<string, string> }) {
  const [offen, setOffen] = useState<ProtokollZeile | null>(null);

  return (
    <>
      <Table stapeln>
        <Thead>
          <Th>{t.colTime}</Th>
          <Th>{t.colWhat}</Th>
          <Th>{t.colWho}</Th>
          <Th>{t.colChange}</Th>
          <Th aria-label={t.details} />
        </Thead>
        <Tbody>
          {zeilen.map((z) => (
            <Tr key={z.id} controls>
              <Td label={t.colTime} className="ct-help whitespace-nowrap tabular-nums">{z.zeit}</Td>
              <Td className="min-w-48">
                <span className="ct-label text-ink">{z.aktion}</span>
              </Td>
              <Td label={t.colWho}>
                {/* Ohne Person heisst: der Server hat es getan — ein Wort statt eines Strichs. */}
                <Badge tone={z.wer ? "neutral" : "accent"}>{z.wer ?? t.system}</Badge>
              </Td>
              <Td label={t.colChange} className="ct-small text-muted">
                {z.felder.length === 0
                  ? "—"
                  : `${z.felder.join(", ")}${z.weitere > 0 ? ` ${t.moreFields.replace("{n}", String(z.weitere))}` : ""}`}
              </Td>
              <Td>
                <Button size="sm" variant="ghost" onClick={() => setOffen(z)}>{t.details}</Button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {offen && (
        <Modal label={t.detailTitle} onCancel={() => setOffen(null)} size="wide">
          <h2 className="ct-h3">{offen.aktion}</h2>
          <dl className="ct-small mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">{t.detailWhen}</dt>
            <dd>{offen.zeit}</dd>
            <dt className="text-muted">{t.detailWho}</dt>
            <dd>{offen.wer ?? t.system}</dd>
          </dl>
          {!offen.wer && <p className="ct-help mt-2">{t.systemExplain}</p>}

          <h3 className="ct-label mt-5 text-ink">{t.detailChanges}</h3>
          {offen.aenderungen.length === 0 ? (
            <p className="ct-help mt-1">{t.detailNoChange}</p>
          ) : (
            <Table stapeln>
              <Thead>
                <Th>{t.detailField}</Th>
                <Th>{t.detailBefore}</Th>
                <Th>{t.detailAfter}</Th>
              </Thead>
              <Tbody>
                {offen.aenderungen.map((a) => (
                  <Tr key={a.feld}>
                    <Td className="ct-label align-top">{a.feld}</Td>
                    <Td label={t.detailBefore} className="ct-small break-words align-top text-muted">{a.vorher}</Td>
                    <Td label={t.detailAfter} className="ct-small break-words align-top">{a.nachher}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          <details className="mt-5">
            <summary className="ct-small cursor-pointer text-muted pointer-coarse:-my-3 pointer-coarse:py-3">{t.detailTechnical}</summary>
            <p className="ct-help mt-2 break-all">
              {offen.system}
              {offen.objekt && ` · ${offen.objekt}`}
              {offen.objektId && ` · ${offen.objektId}`}
            </p>
          </details>

          <ModalFuss className="justify-end">
            <Button variant="secondary" onClick={() => setOffen(null)}>{t.detailClose}</Button>
          </ModalFuss>
        </Modal>
      )}
    </>
  );
}
