"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cancelShuttle, requestShuttle } from "./actions";
import { SHUTTLE_FIELDS, SHUTTLE_LIMIT, type ShuttleBooking } from "./types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  requested: "accent",
  confirmed: "success",
  cancelled: "neutral",
};

const LEER: Record<string, string> = {
  passenger_name: "",
  passengers: "1",
  driver_phone: "",
  pickup_at: "",
  pickup_location: "",
  pickup_address: "",
  dropoff_location: "",
  dropoff_address: "",
  latest_arrival_at: "",
  note: "",
  over_limit_reason: "",
};

/**
 * Shuttle-Fahrten des Speakers (SPK-016).
 *
 * Anders als Hotel und Shuttle-Kontingent ist eine Fahrt **kein Platz in einem
 * Topf**, sondern ein Auftrag mit Zeit, Ort und Ziel. Deshalb ein eigenes
 * Formular statt einer Buchung auf ein Kontingent — das Unternehmen rechnet je
 * Fahrt ab, nicht je Platz.
 *
 * Mehrere Fahrten je Speaker sind der Normalfall, auch **Zwischenfahrten**
 * (abends zum Dinner). Ab der sechsten offenen Fahrt verlangt die Datenbank
 * eine Begründung; das Formular blendet das Feld rechtzeitig ein und erklärt,
 * warum — eine Sperre ohne Erklärung war Konrads Befund am alten Portal.
 */
export function ShuttleView({
  profileId,
  bookings,
  isAssistant,
  dateLocale,
  vorschlag,
  fenster,
  t,
  common,
  rpcMessages,
}: {
  profileId: string;
  bookings: ShuttleBooking[];
  /** Vorbelegung einer neuen Fahrt aus der hinterlegten An- und Abreise. */
  vorschlag?: Record<string, string>;
  /**
   * Erlaubtes Zeitfenster für die Abholung (SPK-034). `min`/`max` begrenzen
   * die Tage am Feld, `vonStunde`/`bisStunde` die Uhrzeit beim Absenden —
   * der Browser prüft die Stunde nicht mit.
   */
  fenster?: { min: string; max: string; vonStunde: number; bisStunde: number; hint: string };
  isAssistant: boolean;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState(false);
  // Was aus der hinterlegten An- und Abreise schon bekannt ist, steht im
  // Formular drin (SPK-032). Wer „ich möchte abgeholt werden" angehakt hat,
  // soll hier nicht dieselbe Uhrzeit ein zweites Mal eintippen.
  const [draft, setDraft] = useState<Record<string, string>>({ ...LEER, ...vorschlag });
  const [fehler, setFehler] = useState<string | null>(null);
  const [askCancel, setAskCancel] = useState<ShuttleBooking | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const aktiv = bookings.filter((b) => b.status !== "cancelled");
  // Ab der sechsten offenen Fahrt verlangt `request_shuttle` eine Begründung.
  const brauchtGrund = aktiv.length >= SHUTTLE_LIMIT;

  /**
   * Liegt die Abholzeit im erlaubten Fenster? (SPK-034)
   *
   * `min` und `max` am Feld begrenzen nur den Tag — die Uhrzeit prüft der
   * Browser nicht. Ohne diesen Schritt liesse sich eine Abholung um drei Uhr
   * morgens bestellen, und das Shuttle-Unternehmen bekäme sie auf die Liste.
   */
  function zeitAusserhalb(wert: string): boolean {
    if (!fenster || !wert) return false;
    const stunde = Number(wert.slice(11, 13));
    if (!Number.isFinite(stunde)) return false;
    return stunde < fenster.vonStunde || stunde >= fenster.bisStunde;
  }

  function onSubmit() {
    setFehler(null);
    if (zeitAusserhalb(draft.pickup_at)) {
      setFehler(fenster?.hint ?? "");
      return;
    }
    start(async () => {
      const res = await requestShuttle(profileId, {
        passenger_name: draft.passenger_name,
        passengers: draft.passengers,
        driver_phone: draft.driver_phone,
        pickup_at: draft.pickup_at,
        pickup_location: draft.pickup_location,
        pickup_address: draft.pickup_address,
        dropoff_location: draft.dropoff_location,
        dropoff_address: draft.dropoff_address,
        latest_arrival_at: draft.latest_arrival_at,
        note: draft.note,
        over_limit_reason: draft.over_limit_reason,
      });
      if (!res.ok) {
        // Der Fehler steht **im** Formular, nicht als Toast: das Formular ist
        // offen, und eine Meldung, die daneben aufblitzt, verpasst man.
        setFehler(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setDraft(LEER);
      setOffen(false);
      toast("success", t.shuttleRequested);
      router.refresh();
    });
  }

  function onCancel(booking: ShuttleBooking) {
    start(async () => {
      setAskCancel(null);
      const res = await cancelShuttle(booking.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.shuttleCancelled);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="h-shuttle" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="h-shuttle" className="ct-h3 text-ink">
          {t.shuttleTitle}
        </h2>
        {!offen && (
          <Button size="sm" onClick={() => setOffen(true)} disabled={pending}>
            {t.shuttleAdd}
          </Button>
        )}
      </div>
      <p className="ct-help">{t.shuttleLead}</p>

      {aktiv.length > 0 && (
        <ul className="flex flex-col gap-3">
          {aktiv.map((b) => (
            <Card as="li" key={b.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="ct-label text-ink tabular-nums">
                    {dateTime.format(new Date(b.pickup_at))}
                  </p>
                  <p className="ct-help mt-1">
                    {b.pickup_location}
                    {b.pickup_address ? `, ${b.pickup_address}` : ""} → {b.dropoff_location}
                    {b.dropoff_address ? `, ${b.dropoff_address}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>
                      {t[`shuttle_${b.status}`] ?? b.status}
                    </Badge>
                    <span className="ct-help">
                      {t.shuttlePassenger}: {b.passenger_name} ({b.passengers})
                    </span>
                  </div>
                  {b.latest_arrival_at && (
                    <p className="ct-help mt-1 tabular-nums">
                      {t.shuttleLatest}: {dateTime.format(new Date(b.latest_arrival_at))}
                    </p>
                  )}
                  {b.note && <p className="ct-help mt-1">{b.note}</p>}
                  {b.status === "requested" && (
                    <p className="ct-help mt-2">{t.shuttlePendingHint}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setAskCancel(b)}
                >
                  {t.shuttleCancel}
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}

      {aktiv.length === 0 && !offen && (
        <Card className="p-4">
          <p className="ct-help">{t.shuttleNone}</p>
        </Card>
      )}

      {offen && (
        <Card className="p-4">
          {fehler && (
            <p
              role="alert"
              className="mb-4 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink"
            >
              {fehler}
            </p>
          )}

          {brauchtGrund && (
            <p className="mb-4 rounded-ct-md border border-accent-soft bg-accent-soft p-3 ct-small text-accent-deep">
              {t.shuttleLimitHint.replace("{n}", String(SHUTTLE_LIMIT))}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {SHUTTLE_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={t[`shuttle_${f.key}`] ?? f.key}
                htmlFor={`sh-${f.key}`}
                hint={f.key === "pickup_at" ? fenster?.hint : t[`shuttle_${f.key}_hint`]}
                required={f.required}
                requiredLabel={t.required}
              >
                <Input
                  id={`sh-${f.key}`}
                  type={f.kind === "text" ? "text" : f.kind}
                  min={f.kind === "number" ? 1 : fenster?.min}
                  max={f.kind === "number" ? 8 : fenster?.max}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </Field>
            ))}

            <Field
              label={t.shuttle_note}
              htmlFor="sh-note"
              hint={t.shuttle_note_hint}
              className="sm:col-span-2"
            >
              {/* Kurztext statt Textfeld (SPK-034, Konrad 21.09.): hier steht
                  ein Satz für den Fahrer, kein Absatz. */}
              <Input
                id="sh-note"
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </Field>

            {brauchtGrund && (
              <Field
                label={t.shuttle_over_limit_reason}
                htmlFor="sh-grund"
                hint={t.shuttle_over_limit_reason_hint}
                required
                requiredLabel={t.required}
                className="sm:col-span-2"
              >
                <Textarea
                  id="sh-grund"
                  rows={2}
                  value={draft.over_limit_reason}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, over_limit_reason: e.target.value }))
                  }
                />
              </Field>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onSubmit} loading={pending}>
              {t.shuttleSubmit}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOffen(false);
                setFehler(null);
                setDraft(LEER);
              }}
            >
              {common.cancel}
            </Button>
          </div>
          {isAssistant && <p className="ct-help mt-3">{t.shuttleAssistantNote}</p>}
        </Card>
      )}

      {askCancel && (
        <ConfirmDialog
          title={t.shuttleCancelTitle}
          body={t.shuttleCancelBody}
          detail={
            <p className="ct-label tabular-nums">
              {dateTime.format(new Date(askCancel.pickup_at))} · {askCancel.pickup_location} →{" "}
              {askCancel.dropoff_location}
            </p>
          }
          confirmLabel={t.shuttleCancelConfirm}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancel(null)}
          onConfirm={() => onCancel(askCancel)}
        />
      )}
    </section>
  );
}
