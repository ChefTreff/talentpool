"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { formatDay } from "@/lib/tz";
import { saveAnweisungen } from "./actions";
import { TechAnsage } from "./TechAnsage";
import type { AnweisungFeld, AnweisungsSlot } from "./types";

type Strings = Record<string, string>;

/**
 * Die Regieanweisungen der Stage Leads als Liste (LEAD-031).
 *
 * Konrad am 24.09.: Stage Leads landeten auf der Regieseite der Produktion und
 * mussten sich dort Bühne und Tag zusammensuchen. Hier steht **jeder Slot der
 * eigenen Bühnen** untereinander, nach Tag und Bühne gruppiert, und die
 * Anweisungen stehen direkt in der Zeile: Personen auf der Bühne, Mikrofon,
 * Präsentation und Medien, Mobiliar, Notizen. Wie in der Regie-Tabelle
 * speichert jedes Feld beim Verlassen, wenn es sich geändert hat.
 *
 * **Keine neuen Slots, keine Zeiten**: die Zeit steht nur zum Lesen da, und
 * `set_regie_anweisungen` nimmt nichts anderes als die fünf Felder. Den Plan
 * (Auf- und Abgang, Moderation, Regie) führt die Produktion unter
 * `/admin/regie`; sie sieht dieselben Felder und kann sie überschreiben.
 */
export function Anweisungsliste({
  slots,
  timezone,
  dateLocale,
  t,
  p,
  rpcMessages,
}: {
  slots: AnweisungsSlot[];
  timezone: string;
  dateLocale: string;
  /** `leads`-Texte. */
  t: Strings;
  /** `production`-Texte — dieselben Spaltennamen wie in der Regie-Tabelle. */
  p: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const hhmm = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: timezone });

  if (slots.length === 0) {
    return <EmptyState title={t.regieListEmptyTitle} description={t.regieListEmptyBody} />;
  }

  // Nach Tag und Bühne gruppieren; die Reihenfolge der RPC (Tag, Bühne, Zeit) bleibt.
  const gruppen = new Map<string, { tag: string; dayId: string; stageId: string; buehne: string; slots: AnweisungsSlot[] }>();
  for (const s of slots) {
    const key = `${s.event_day_id}:${s.stage_id}`;
    const g = gruppen.get(key) ?? { tag: s.day_date, dayId: s.event_day_id, stageId: s.stage_id, buehne: s.stage_name, slots: [] };
    g.slots.push(s);
    gruppen.set(key, g);
  }

  function speichern(slotId: string, feld: AnweisungFeld, wert: string) {
    startTransition(async () => {
      const res = await saveAnweisungen(slotId, { [feld]: wert });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", p.saved);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {[...gruppen.values()].map((g) => (
        // `min-w-0`: ohne das wäre der Abschnitt als Flex-Kind mindestens so breit
        // wie die Tabelle, und die ganze Seite scrollte statt nur die Tabelle.
        <section
          key={`${g.dayId}:${g.stageId}`}
          className="min-w-0"
          aria-label={`${formatDay(g.tag, dateLocale)} · ${g.buehne}`}
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="ct-h2 text-ink">
              {formatDay(g.tag, dateLocale)} · {g.buehne}
            </h2>
            {/* Der Ausdruck bleibt der Weg zu Technik und Stage Hands. */}
            <Link className="ct-link ct-small" href={`/regie/druck?buehne=${g.stageId}&tag=${g.dayId}`} {...neuesFenster}>
              {t.regiePrint}
            </Link>
          </div>
          <Table>
            {/* `Thead` legt die Kopfzeile selbst an — die `Th` stehen direkt darin. */}
            <Thead>
              <Th>{p.colTime}</Th>
              <Th>{p.colSession}</Th>
              <Th>{p.colTech}</Th>
              <Th>{p.colPeopleOnStage}</Th>
              <Th>{p.colMic}</Th>
              <Th>{p.colMedia}</Th>
              <Th>{p.colMobiliar}</Th>
              <Th>{p.colNotes}</Th>
            </Thead>
            <Tbody>
              {g.slots.map((s) => (
                <Zeile key={s.slot_id} slot={s} hhmm={hhmm} pending={pending} t={t} p={p} onSave={speichern} />
              ))}
            </Tbody>
          </Table>
        </section>
      ))}
    </div>
  );
}

function Zeile({
  slot,
  hhmm,
  pending,
  t,
  p,
  onSave,
}: {
  slot: AnweisungsSlot;
  hhmm: Intl.DateTimeFormat;
  pending: boolean;
  t: Strings;
  p: Strings;
  onSave: (slotId: string, feld: AnweisungFeld, wert: string) => void;
}) {
  const [draft, setDraft] = useState<Record<AnweisungFeld, string>>({
    people_on_stage: slot.people_on_stage ?? "",
    mic: slot.mic ?? "",
    media: slot.media ?? "",
    mobiliar: slot.mobiliar ?? "",
    notes: slot.notes ?? "",
  });

  const feld = (key: AnweisungFeld, label: string, placeholder?: string, wide = false) => (
    <Input
      aria-label={`${label} · ${slot.title ?? t.regieNoSession}`}
      className={wide ? "w-full min-w-[14rem]" : "w-full min-w-[9rem]"}
      value={draft[key]}
      placeholder={placeholder}
      disabled={pending}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => {
        if (draft[key] === (slot[key] ?? "")) return;
        onSave(slot.slot_id, key, draft[key]);
      }}
    />
  );

  const namen = (slot.speakers ?? [])
    .map((s) => [s.first_name, s.last_name].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");

  return (
    <Tr controls>
      <Td className="whitespace-nowrap tabular-nums text-muted">
        {hhmm.format(new Date(slot.start_at))}–{hhmm.format(new Date(slot.end_at))}
      </Td>
      <Td>
        <div className="flex min-w-[12rem] flex-col gap-0.5">
          <span className="ct-label text-ink">{slot.title ?? t.regieNoSession}</span>
          {namen && <span className="ct-help">{namen}</span>}
        </div>
      </Td>
      <Td className="align-top">
        <TechAnsage tech={slot.tech} t={p} />
      </Td>
      <Td>{feld("people_on_stage", p.colPeopleOnStage)}</Td>
      <Td>{feld("mic", p.colMic, t.regieMicPlaceholder)}</Td>
      <Td>{feld("media", p.colMedia, t.regieMediaPlaceholder)}</Td>
      <Td>{feld("mobiliar", p.colMobiliar)}</Td>
      <Td>{feld("notes", p.colNotes, t.regieNotesPlaceholder, true)}</Td>
    </Tr>
  );
}
