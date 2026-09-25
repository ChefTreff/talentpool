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
import { TechAnsage } from "./TechAnsage";
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
              <Th>{t.colPeopleOnStage}</Th>
              <Th>{t.colMic}</Th>
              <Th>{t.colMedia}</Th>
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
    people_on_stage: cue.people_on_stage ?? "",
    backstage: cue.backstage ?? "",
    mobiliar: cue.mobiliar ?? "",
    notes: cue.notes ?? "",
  });

  // `mic_assignments` und `media` sind jsonb; der Text steht unter `text`,
  // andere Schlüssel darin bleiben beim Speichern erhalten.
  const [json, setJson] = useState({
    mic_assignments: textOf(cue.mic_assignments),
    media: textOf(cue.media),
  });
  const jsonText = (key: "mic_assignments" | "media", label: string) => (
    <Input
      aria-label={label}
      className="w-full min-w-[9rem]"
      value={json[key]}
      disabled={pending}
      onChange={(e) => setJson((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => {
        if (json[key] === textOf(cue[key])) return;
        const rest = { ...(cue[key] ?? {}) } as Record<string, unknown>;
        delete rest.text;
        const wert = json[key].trim();
        run(saveCue({ id: cue.cue_id, [key]: wert ? { ...rest, text: wert } : rest }), t.saved);
      }}
    />
  );

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
      {/* Kommt seit dem 23.09. von hier und nicht mehr vom Speaker
          (SPK-029, LEAD-012). */}
      <Td>{field("people_on_stage", t.colPeopleOnStage)}</Td>
      {/* Mikrofon und Medien: dieselben Felder, die die Stage Leads in ihrer
          Liste pflegen (LEAD-031) — die Produktion kann sie hier überschreiben. */}
      <Td>{jsonText("mic_assignments", t.colMic)}</Td>
      <Td>{jsonText("media", t.colMedia)}</Td>
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

/** Der Freitext aus einem jsonb-Feld der Regie (`{ text }`), sonst leer. */
function textOf(v: Record<string, unknown> | null | undefined): string {
  const text = v?.text;
  return typeof text === "string" ? text : "";
}
