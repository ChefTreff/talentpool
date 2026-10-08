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
import { sideEventFehler } from "@/lib/side-event/meldung";
import { respondSideEvent } from "./actions";
import type { MySideEvent } from "./types";

type Strings = Record<string, string>;

/**
 * Die Einladung zu einem Side Event (ADM-077, SPK-091; zuvor die Reception, SPK-003).
 *
 * Wer die Karte sieht, ist **eingeladen** und das Event ist veröffentlicht — die Datenbank gibt sie nur dann heraus. Antworten kann die
 * Speakerin selbst: im Portal mit Begleitung und Hinweis oder per Link in der Einladungsmail mit einem Klick. Eine Assistenz sieht den Stand,
 * antwortet aber nicht (eine Zusage ist eine persönliche Entscheidung).
 *
 * Die freien Plätze stehen als **Zahl** da, nie als Liste: wer kommt, geht andere Gäste nichts an.
 */
export function SideEventCard({
  event,
  isAssistant,
  locale,
  dateLocale,
  t,
  kalender,
  common,
  rpcMessages,
}: {
  event: MySideEvent;
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
  const [guests, setGuests] = useState(String(event.my_guests ?? 0));
  const [note, setNote] = useState(event.my_note ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "full", timeStyle: "short" });

  const titel = (locale === "en" ? event.title_en : event.title_de) || event.title_de;
  const text = locale === "en" ? event.description_en : event.description_de;
  const zugesagt = event.my_status === "yes";
  const abgesagt = event.my_status === "no";

  function antworten(status: "yes" | "no") {
    setFehler(null);
    start(async () => {
      const res = await respondSideEvent(event.id, status, status === "yes" ? Number(guests) || 0 : 0, note);
      if (!res.ok) {
        // Im Kasten, nicht als Toast: die Karte bleibt stehen, und ein Hinweis daneben („noch zwei Plätze frei“) gehört an die Stelle, an
        // der man gerade gedrückt hat.
        setFehler(sideEventFehler(res.key, res.detail, rpcMessages));
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
          <h3 className="ct-h3 mt-1 text-ink">{titel}</h3>
        </div>
        {zugesagt ? <Badge tone="success">{t.badgeYes}</Badge> : abgesagt ? <Badge>{t.badgeNo}</Badge> : <Badge tone="warning">{t.badgeInvited}</Badge>}
      </div>

      <p className="ct-help mt-2 tabular-nums">{dateTime.format(new Date(event.starts_at))}</p>
      <p className="ct-help">
        {event.location}
        {event.address ? `, ${event.address}` : ""}
      </p>
      {text && <p className="ct-small mt-3 whitespace-pre-line leading-6">{text}</p>}

      {/* Erst nach der Zusage (SPK-014): ein Termin, den man abgesagt hat, gehört in keinen Kalender. */}
      {zugesagt && (
        <KalenderKnoepfe
          className="mt-3"
          beschriftung="sichtbar"
          termin={{
            titel,
            start: new Date(event.starts_at),
            ende: event.ends_at ? new Date(event.ends_at) : null,
            ort: [event.location, event.address].filter(Boolean).join(", ") || null,
          }}
          ics={`/api/speaker/kalender?side_event=${event.id}`}
          t={kalender}
        />
      )}

      {event.free != null && (
        <p className="ct-help mt-3">{event.free > 0 ? t.freeSeats.replace("{n}", String(event.free)) : t.fullHint}</p>
      )}

      {fehler && (
        <p role="alert" className="mt-3 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}

      {isAssistant ? (
        <p className="ct-help mt-4">{t.assistantNote}</p>
      ) : event.closed ? (
        <p className="ct-help mt-4">{t.closedHint}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {!abgesagt && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.guests} htmlFor={`se-guests-${event.id}`} hint={t.guestsHint}>
                <Input
                  id={`se-guests-${event.id}`}
                  type="number"
                  min={0}
                  max={3}
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                />
              </Field>
              <Field label={t.note} htmlFor={`se-note-${event.id}`} hint={t.noteHint} className="sm:col-span-2">
                <Textarea id={`se-note-${event.id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => antworten("yes")} loading={pending}>
              {zugesagt ? common.save : abgesagt ? t.rsvpChange : t.rsvpYes}
            </Button>
            {!abgesagt && (
              <Button variant="secondary" onClick={() => antworten("no")} disabled={pending}>
                {t.rsvpNo}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
