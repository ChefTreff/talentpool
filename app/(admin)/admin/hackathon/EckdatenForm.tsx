"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { saveHackathonInfo } from "./actions";

type Strings = Record<string, string>;

export type EckdatenWerte = {
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  location: string | null;
  note_de: string;
  note_en: string;
};

/**
 * Eckdaten des Hackathons (HACK-020): Datum, Uhrzeit, Ort und die Zusatzzeile, wie die Startseite
 * `/hackathon` sie zeigt. Leere Felder fehlen dort einfach — nichts Erfundenes. Die Ansprechperson
 * gehört zu den Ansprechpartnern (Typ „Hackathon-Ansprechperson“), nicht hierher.
 */
export function EckdatenForm({ initial, t, rpcMessages }: { initial: EckdatenWerte; t: Strings; rpcMessages: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    start_date: initial.start_date ?? "",
    end_date: initial.end_date ?? "",
    start_time: (initial.start_time ?? "").slice(0, 5),
    end_time: (initial.end_time ?? "").slice(0, 5),
    venue: initial.venue ?? "",
    location: initial.location ?? "",
    note_de: initial.note_de,
    note_en: initial.note_en,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  function save() {
    start(async () => {
      const res = await saveHackathonInfo(v);
      if (!res.ok) {
        toast("error", rpcMessages[res.key ?? "unknown"] ?? rpcMessages.unknown ?? res.key ?? "");
        return;
      }
      toast("success", t.infoSaved);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.infoStartDate} htmlFor="h-sd"><Input id="h-sd" type="date" value={v.start_date} onChange={set("start_date")} /></Field>
        <Field label={t.infoStartTime} htmlFor="h-st"><Input id="h-st" type="time" value={v.start_time} onChange={set("start_time")} /></Field>
        <Field label={t.infoEndDate} htmlFor="h-ed"><Input id="h-ed" type="date" value={v.end_date} onChange={set("end_date")} /></Field>
        <Field label={t.infoEndTime} htmlFor="h-et"><Input id="h-et" type="time" value={v.end_time} onChange={set("end_time")} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.infoVenue} htmlFor="h-venue" hint={t.infoVenueHint}><Input id="h-venue" value={v.venue} onChange={set("venue")} /></Field>
        <Field label={t.infoLocation} htmlFor="h-loc"><Input id="h-loc" value={v.location} onChange={set("location")} /></Field>
        <Field label={t.infoNoteEn} htmlFor="h-ne" hint={t.infoNoteHint}><Input id="h-ne" maxLength={200} value={v.note_en} onChange={set("note_en")} /></Field>
        <Field label={t.infoNoteDe} htmlFor="h-nd"><Input id="h-nd" maxLength={200} value={v.note_de} onChange={set("note_de")} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={pending} onClick={save}>{t.infoSave}</Button>
        <Link href="/admin/ansprechpartner" className="ct-link ct-small">{t.infoContactLink}</Link>
      </div>
    </div>
  );
}
