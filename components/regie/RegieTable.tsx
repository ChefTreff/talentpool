"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { deleteCue, saveCue } from "./actions";
import type { OpenSlot, RegieCue } from "./types";

type Strings = Record<string, string>;

/**
 * Der Ablaufplan einer Bühne an einem Tag — die Tabelle, die am Veranstaltungs-
 * tag ausgedruckt neben dem Mischpult liegt (Vorlage `regie-2026`).
 *
 * Jede Zelle ist ein Feld: Regie schreibt während der Probe, nicht in einem
 * Dialog. Gespeichert wird beim Verlassen des Feldes, damit kein Klick auf
 * „Sichern" zwischen Gedanke und Zeile steht. Zeilen ohne Session sind der
 * Normalfall — Doors open, Puffer, Soundcheck.
 */
export function RegieTable({
  stageId,
  dayId,
  cues,
  open,
  timezone,
  locale,
  t,
  rpcMessages,
}: {
  stageId: string;
  dayId: string;
  cues: RegieCue[];
  open: OpenSlot[];
  timezone: string;
  locale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const hhmm = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone });

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  /** Neue Zeile: schließt zeitlich an die letzte an, damit der Ablauf wächst. */
  function addRow(slot?: OpenSlot) {
    const last = cues[cues.length - 1];
    const start = slot?.start_at ?? last?.cue_end ?? new Date().toISOString();
    const end = slot?.end_at ?? new Date(new Date(start).getTime() + 5 * 60_000).toISOString();
    run(
      saveCue({
        stage_id: stageId,
        event_day_id: dayId,
        slot_id: slot?.slot_id ?? null,
        cue_start: start,
        cue_end: end,
        action: slot?.title ?? "",
        sort_order: (last?.sort_order ?? 0) + 1,
      }),
      t.saved,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {cues.length === 0 ? (
        <EmptyState
          title={t.emptyCues}
          description={t.emptyCuesBody}
          action={
            <Button onClick={() => addRow()} disabled={pending}>
              {t.addCue}
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <Thead>
              <Th>{t.colStart}</Th>
              <Th>{t.colEnd}</Th>
              <Th>{t.colAction}</Th>
              <Th>{t.colSession}</Th>
              <Th>{t.colTech}</Th>
              <Th>{t.colModeration}</Th>
              <Th>{t.colRegie}</Th>
              <Th>{t.colBackstage}</Th>
              <Th>{t.colMobiliar}</Th>
              <Th>{t.colNotes}</Th>
              <Th aria-label={t.deleteCue} />
            </Thead>
            <Tbody>
              {cues.map((c) => (
                <CueRow
                  key={c.cue_id}
                  cue={c}
                  hhmm={hhmm}
                  pending={pending}
                  t={t}
                  run={run}
                />
              ))}
            </Tbody>
          </Table>
          <div>
            <Button variant="secondary" onClick={() => addRow()} disabled={pending}>
              {t.addCue}
            </Button>
          </div>
        </>
      )}

      {open.length > 0 && (
        <section className="rounded-ct-lg border bg-surface p-4">
          <h2 className="ct-h3">{t.openSlots}</h2>
          <p className="ct-help mb-3">{t.openSlotsBody}</p>
          <ul className="flex flex-col gap-1.5">
            {open.map((s) => (
              <li key={s.slot_id} className="flex flex-wrap items-center gap-2">
                <span className="ct-label tabular-nums">
                  {hhmm.format(new Date(s.start_at))}–{hhmm.format(new Date(s.end_at))}
                </span>
                <span className="text-muted">{s.title ?? "—"}</span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => addRow(s)}>
                  {t.addFromSlot}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Eine Zeile. Jede Textzelle speichert beim Verlassen, wenn sie sich geändert hat. */
function CueRow({
  cue,
  hhmm,
  pending,
  t,
  run,
}: {
  cue: RegieCue;
  hhmm: Intl.DateTimeFormat;
  pending: boolean;
  t: Strings;
  run: (action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const [draft, setDraft] = useState({
    action: cue.action ?? "",
    moderation: cue.moderation ?? "",
    regie: cue.regie ?? "",
    backstage: cue.backstage ?? "",
    mobiliar: cue.mobiliar ?? "",
    notes: cue.notes ?? "",
  });

  const field = (key: keyof typeof draft, label: string, wide = false) => (
    <Input
      aria-label={label}
      className={wide ? "w-full min-w-[14rem]" : "w-full min-w-[9rem]"}
      value={draft[key]}
      disabled={pending}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => {
        const was = (cue[key] ?? "") as string;
        if (draft[key] === was) return;
        run(saveCue({ id: cue.cue_id, [key]: draft[key] }), t.saved);
      }}
    />
  );

  return (
    <Tr>
      <Td className="tabular-nums text-muted">{hhmm.format(new Date(cue.cue_start))}</Td>
      <Td className="tabular-nums text-muted">{hhmm.format(new Date(cue.cue_end))}</Td>
      <Td>{field("action", t.colAction, true)}</Td>
      <Td>
        {cue.session_id ? (
          <div className="flex flex-col gap-0.5">
            <span className="ct-label">{cue.title ?? "—"}</span>
            {(cue.speakers ?? []).length > 0 && (
              <span className="ct-help">
                {(cue.speakers ?? [])
                  .map((s) => [s.first_name, s.last_name].filter(Boolean).join(" "))
                  .join(", ")}
              </span>
            )}
          </div>
        ) : (
          <Badge>{t.colAction}</Badge>
        )}
      </Td>
      {/* Die Ansage des Speakers (0121, SPK-018) — **lesend**. Wer hier etwas
          ändern will, ändert es in seiner Disposition nebenan; die Ansage
          gehört dem Speaker. Cues ohne Session bleiben leer. */}
      <Td className="align-top">
        <TechAnsage tech={cue.tech} t={t} />
      </Td>
      <Td>{field("moderation", t.colModeration)}</Td>
      <Td>{field("regie", t.colRegie)}</Td>
      <Td>{field("backstage", t.colBackstage)}</Td>
      <Td>{field("mobiliar", t.colMobiliar)}</Td>
      <Td>{field("notes", t.colNotes, true)}</Td>
      <Td>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(deleteCue(cue.cue_id), t.deleted)}
        >
          ×<span className="sr-only"> {t.deleteCue}</span>
        </Button>
      </Td>
    </Tr>
  );
}

/**
 * Was der Speaker angemeldet hat, in einer Tabellenzelle.
 *
 * Kurz gehalten: die Regie überfliegt die Zeile, sie liest sie nicht. Leere
 * Felder fallen weg, damit die Spalte bei Cues ohne Ansage wirklich leer ist
 * und nicht nach einer Angabe aussieht.
 */
function TechAnsage({ tech, t }: { tech: Record<string, string> | null; t: Strings }) {
  const eintraege = Object.entries(tech ?? {}).filter(([, v]) => (v ?? "").trim() !== "");
  if (eintraege.length === 0) return <span className="ct-help text-muted">—</span>;
  return (
    <dl className="flex flex-col gap-0.5">
      {eintraege.map(([key, wert]) => (
        <div key={key} className="flex gap-1">
          <dt className="ct-help shrink-0 font-semibold">{t[`tech_${key}`] ?? key}:</dt>
          <dd className="ct-help">{wert}</dd>
        </div>
      ))}
    </dl>
  );
}
