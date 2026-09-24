"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { KalenderKnoepfe, type KalenderTexte } from "@/components/ui/KalenderKnoepfe";
import { setReceptionRsvp } from "./actions";
import type { MyReception } from "./types";

type Strings = Record<string, string>;

/**
 * Die Einladung zur Reception (SPK-003).
 *
 * Im Alt-Portal lief das über Luma; hier steht es im Portal, weil eine
 * Einladung dorthin gehört, wo alles andere zum Auftritt steht. Wer die Karte
 * sieht, ist eingeladen — die Datenbank gibt sie nur an Profile mit
 * `reception_eligible` heraus.
 *
 * Die freien Plätze stehen als **Zahl** da, nie als Liste: wer kommt, geht
 * andere Gäste nichts an.
 */
export function ReceptionCard({
  reception,
  isAssistant,
  locale,
  dateLocale,
  t,
  kalender,
  common,
  rpcMessages,
}: {
  reception: MyReception;
  isAssistant: boolean;
  locale: string;
  dateLocale: string;
  t: Strings;
  /** Die drei Wege in den Kalender (QS-043) — dieselben Texte wie auf der Übersicht. */
  kalender: KalenderTexte;
  common: { save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [guests, setGuests] = useState(String(reception.my_guests ?? 0));
  const [note, setNote] = useState(reception.my_note ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "full",
    timeStyle: "short",
  });

  const titel = (locale === "en" ? reception.title_en : reception.title_de) || reception.title_de;
  const text = locale === "en" ? reception.description_en : reception.description_de;
  const zugesagt = reception.my_status === "yes";
  const abgesagt = reception.my_status === "no";

  function antworten(status: "yes" | "no") {
    setFehler(null);
    start(async () => {
      const res = await setReceptionRsvp(
        reception.id,
        status,
        status === "yes" ? Number(guests) || 0 : 0,
        note,
      );
      if (!res.ok) {
        // Im Kasten, nicht als Toast: die Karte bleibt stehen, und ein Hinweis
        // daneben („noch zwei Plätze frei") gehört an die Stelle, an der man
        // gerade gedrückt hat.
        setFehler(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", status === "yes" ? t.rsvpYesDone : t.rsvpNoDone);
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ct-eyebrow text-muted">{t.eyebrow}</p>
          <h2 className="ct-h3 mt-1 text-ink">{titel}</h2>
        </div>
        {zugesagt && <Badge tone="success">{t.badgeYes}</Badge>}
        {abgesagt && <Badge>{t.badgeNo}</Badge>}
      </div>

      <p className="ct-help mt-2 tabular-nums">{dateTime.format(new Date(reception.starts_at))}</p>
      <p className="ct-help">
        {reception.location}
        {reception.address ? `, ${reception.address}` : ""}
      </p>
      {text && <p className="ct-small mt-3 whitespace-pre-line leading-6">{text}</p>}

      {/* Erst nach der Zusage (SPK-014): ein Termin, den man abgesagt hat,
          gehört in keinen Kalender. */}
      {zugesagt && (
        <KalenderKnoepfe
          className="mt-3"
          beschriftung="sichtbar"
          termin={{
            titel,
            start: new Date(reception.starts_at),
            ende: reception.ends_at ? new Date(reception.ends_at) : null,
            ort: [reception.location, reception.address].filter(Boolean).join(", ") || null,
          }}
          ics={`/api/speaker/kalender?reception=${reception.id}`}
          t={kalender}
        />
      )}

      {reception.free != null && (
        <p className="ct-help mt-3">
          {reception.free > 0
            ? t.freeSeats.replace("{n}", String(reception.free))
            : t.fullHint}
        </p>
      )}

      {fehler && (
        <p
          role="alert"
          className="mt-3 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink"
        >
          {fehler}
        </p>
      )}

      {isAssistant ? (
        <p className="ct-help mt-4">{t.assistantNote}</p>
      ) : reception.closed ? (
        <p className="ct-help mt-4">{t.closedHint}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {!abgesagt && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.guests} htmlFor={`rc-guests-${reception.id}`} hint={t.guestsHint}>
                <Input
                  id={`rc-guests-${reception.id}`}
                  type="number"
                  min={0}
                  max={3}
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                />
              </Field>
              <Field
                label={t.note}
                htmlFor={`rc-note-${reception.id}`}
                hint={t.noteHint}
                className="sm:col-span-2"
              >
                <Textarea
                  id={`rc-note-${reception.id}`}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => antworten("yes")} loading={pending}>
              {zugesagt ? common.save : t.rsvpYes}
            </Button>
            {!abgesagt && (
              <Button variant="secondary" onClick={() => antworten("no")} disabled={pending}>
                {t.rsvpNo}
              </Button>
            )}
            {abgesagt && (
              <Button variant="secondary" onClick={() => antworten("yes")} disabled={pending}>
                {t.rsvpChange}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
