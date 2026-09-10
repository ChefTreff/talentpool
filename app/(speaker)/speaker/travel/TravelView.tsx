"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { saveSpeakerConsents } from "../actions";
import { bookHospitality, cancelHospitality } from "./actions";
import {
  DETAIL_FIELDS,
  type HospitalityBooking,
  type HospitalityOption,
} from "./types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  requested: "accent",
  confirmed: "success",
  waitlisted: "warning",
  cancelled: "neutral",
};

export function TravelView({
  isAssistant,
  hospitalityStatus,
  options,
  bookings,
  tierLabels,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  isAssistant: boolean;
  hospitalityStatus: string;
  options: HospitalityOption[];
  bookings: HospitalityBooking[];
  tierLabels: Record<string, string>;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [guests, setGuests] = useState("1");
  const [askCancel, setAskCancel] = useState<HospitalityBooking | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  // `window_from`/`window_to` sind echte Zeitpunkte (timestamptz) — die gehören
  // in die Zone des Lesers.
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  // Die Angaben aus `details` sind nackte Kalendertage aus einem `date`-Feld.
  // `new Date("2027-04-15")` ist UTC-Mitternacht; westlich von Greenwich würde
  // daraus der 14. April. Deshalb dieselbe Zone beim Formatieren.
  const bareDate = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const label = (o: { label_de: string | null; label_en: string | null }) =>
    (locale === "en" ? o.label_en : o.label_de) ?? o.label_de ?? o.label_en ?? "—";

  // Der Grund steht an jeder Zeile gleich; für den Seitenhinweis reicht der erste.
  const blockReason = options.find((o) => !o.eligible)?.block_reason ?? null;
  const active = bookings.filter((b) => b.status !== "cancelled");

  function onBook(option: HospitalityOption) {
    const count = Number(guests) || 1;
    startTransition(async () => {
      const res = await bookHospitality(option.quota_id, details, count);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setOpenForm(null);
      setDetails({});
      setGuests("1");
      toast(
        "success",
        res.data.status === "waitlisted" ? t.bookedWaitlist : t.bookedRequested,
      );
      router.refresh();
    });
  }

  function onCancel(booking: HospitalityBooking) {
    startTransition(async () => {
      setAskCancel(null);
      const res = await cancelHospitality(booking.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.bookingCancelled);
      router.refresh();
    });
  }

  function onGiveConsent() {
    startTransition(async () => {
      const res = await saveSpeakerConsents({ hospitality_data: true });
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.consentSaved);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Anreise-FAQ: fester Text, bis die Wissensbasis steht (Welle 4). */}
      <Card className="p-6">
        <h2 className="ct-h3 mb-2 text-ink">{t.arrivalTitle}</h2>
        <p className="ct-help whitespace-pre-line">{t.arrivalBody}</p>
      </Card>

      {/* Freischaltung: Status setzt das Team, den Consent gibt der Speaker. */}
      {blockReason === "status" && (
        <Card className="p-6">
          <h2 className="ct-h3 mb-2 text-ink">
            {hospitalityStatus === "declined" ? t.declinedTitle : t.notEligibleTitle}
          </h2>
          {/* „Abgelehnt" und „noch nicht dran" sehen in der Sperre gleich aus —
              der Satz darf es nicht: „wird freigeschaltet" wäre hier falsch.
              Sobald `hospitality_block_reason` `declined` selbst liefert, kann
              dieser Sonderfall weg und die Unterscheidung kommt aus der RPC. */}
          <p className="ct-help">
            {hospitalityStatus === "declined" ? t.declinedBody : t.notEligibleBody}
          </p>
        </Card>
      )}
      {blockReason === "consent" && (
        <Card className="p-6">
          <h2 className="ct-h3 mb-2 text-ink">{t.consentNeededTitle}</h2>
          <p className="ct-help">{t.consentHospitality}</p>
          {isAssistant ? (
            <p className="ct-help mt-3">{t.consentReadOnly}</p>
          ) : (
            <Button className="mt-4" onClick={onGiveConsent} loading={pending}>
              {t.consentGive}
            </Button>
          )}
        </Card>
      )}

      {/* Eigene Buchungen */}
      {active.length > 0 && (
        <section aria-labelledby="h-bookings">
          <h2 id="h-bookings" className="ct-h3 mb-3 text-ink">
            {t.myBookings}
          </h2>
          <ul className="flex flex-col gap-3">
            {active.map((b) => (
              <Card as="li" key={b.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="ct-label text-ink">{label(b)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>
                        {t[`hospitality_${b.status}`] ?? b.status}
                      </Badge>
                      {b.kind === "hotel" && b.tier && (
                        <Badge>{tierLabels[b.tier] ?? b.tier}</Badge>
                      )}
                      <span className="ct-help">
                        {t.guests}: {b.guests}
                      </span>
                    </div>
                    {b.status === "waitlisted" && (
                      <p className="ct-help mt-2">{t.waitlistNote}</p>
                    )}
                    <Details details={b.details} kind={b.kind} bareDate={bareDate} t={t} />
                    {b.team_note && (
                      <p className="ct-help mt-1">
                        {t.teamNote}: {b.team_note}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setAskCancel(b)}
                  >
                    {t.cancelBooking}
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {/* Angebote */}
      <section aria-labelledby="h-options">
        <h2 id="h-options" className="ct-h3 mb-3 text-ink">
          {t.optionsTitle}
        </h2>
        {options.length === 0 ? (
          <EmptyOptions t={t} />
        ) : (
          <ul className="flex flex-col gap-3">
            {options.map((o) => {
              const booked = o.my_booking != null;
              const full = o.free <= 0;
              const isOpen = openForm === o.quota_id;
              return (
                <Card as="li" key={o.quota_id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="ct-label text-ink">{label(o)}</p>
                      <div className="ct-help mt-1 flex flex-wrap items-center gap-x-3">
                        <span>{t[`kind_${o.kind}`] ?? o.kind}</span>
                        {o.kind === "hotel" && o.tier && (
                          <span>· {tierLabels[o.tier] ?? o.tier}</span>
                        )}
                        {o.location && <span>· {o.location}</span>}
                        {o.window_from && o.window_to && (
                          <span className="tabular-nums">
                            · {dateOnly.format(new Date(o.window_from))} –{" "}
                            {dateOnly.format(new Date(o.window_to))}
                          </span>
                        )}
                      </div>
                      {(locale === "en" ? o.description_en : o.description_de) && (
                        <p className="ct-help mt-1">
                          {locale === "en" ? o.description_en : o.description_de}
                        </p>
                      )}
                      {/* Kapazität offen zeigen (R10), damit niemand rät. */}
                      <p className="ct-help mt-1">
                        {full
                          ? t.optionFull
                          : `${t.free}: ${o.free} ${t.of} ${o.capacity}`}
                      </p>
                    </div>
                    {booked ? (
                      <Badge tone={STATUS_TONE[o.my_booking!.status] ?? "neutral"}>
                        {t[`hospitality_${o.my_booking!.status}`] ?? o.my_booking!.status}
                      </Badge>
                    ) : (
                      o.eligible && (
                        <Button
                          size="sm"
                          variant={isOpen ? "ghost" : "primary"}
                          disabled={pending}
                          onClick={() => {
                            setOpenForm(isOpen ? null : o.quota_id);
                            setDetails({});
                            setGuests("1");
                          }}
                        >
                          {isOpen ? common.cancel : full ? t.joinWaitlist : t.book}
                        </Button>
                      )
                    )}
                  </div>

                  {isOpen && !booked && (
                    <div className="mt-4 border-t pt-4">
                      {full && <p className="ct-help mb-3">{t.waitlistHint}</p>}
                      <div className="grid gap-4 sm:grid-cols-2">
                        {(DETAIL_FIELDS[o.kind] ?? []).map((f) => (
                          <Field
                            key={f.key}
                            label={t[`detail_${f.key}`] ?? f.key}
                            htmlFor={`${o.quota_id}-${f.key}`}
                            className={f.kind === "area" ? "sm:col-span-2" : undefined}
                          >
                            {f.kind === "area" ? (
                              <Textarea
                                id={`${o.quota_id}-${f.key}`}
                                rows={2}
                                value={details[f.key] ?? ""}
                                onChange={(e) =>
                                  setDetails((d) => ({ ...d, [f.key]: e.target.value }))
                                }
                              />
                            ) : (
                              <Input
                                id={`${o.quota_id}-${f.key}`}
                                type={f.kind === "date" ? "date" : "text"}
                                value={details[f.key] ?? ""}
                                onChange={(e) =>
                                  setDetails((d) => ({ ...d, [f.key]: e.target.value }))
                                }
                              />
                            )}
                          </Field>
                        ))}
                        <Field label={t.guests} htmlFor={`${o.quota_id}-guests`} hint={t.guestsHint}>
                          <Input
                            id={`${o.quota_id}-guests`}
                            type="number"
                            min={1}
                            max={4}
                            value={guests}
                            onChange={(e) => setGuests(e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <Button disabled={pending} onClick={() => onBook(o)}>
                          {full ? t.joinWaitlist : t.book}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      {/* `cancelConfirm` statt `cancelBooking`: auf Englisch stünden sonst zwei
          Knöpfe „Cancel" nebeneinander und niemand wüsste, welcher was tut. */}
      {askCancel && (
        <ConfirmDialog
          title={t.cancelTitle}
          body={t.cancelBody}
          detail={<p className="ct-label">{label(askCancel)}</p>}
          confirmLabel={t.cancelConfirm}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancel(null)}
          onConfirm={() => onCancel(askCancel)}
        />
      )}
    </div>
  );
}

/**
 * Die freien Angaben einer Buchung. Datumsfelder kommen als ISO-Text aus dem
 * `date`-Feld — hier lesbar gemacht, statt „2027-04-15" stehen zu lassen.
 */
function Details({
  details,
  kind,
  bareDate,
  t,
}: {
  details: Record<string, string> | null;
  kind: string;
  /** Formatter in UTC — die Werte sind Kalendertage ohne Zone. */
  bareDate: Intl.DateTimeFormat;
  t: Strings;
}) {
  const entries = Object.entries(details ?? {}).filter(([, v]) => v);
  if (entries.length === 0) return null;
  const dateKeys = new Set(
    (DETAIL_FIELDS[kind] ?? []).filter((f) => f.kind === "date").map((f) => f.key),
  );
  const show = (key: string, value: string) => {
    if (!dateKeys.has(key)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? value : bareDate.format(parsed);
  };
  return (
    <dl className="ct-help mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-1">
          <dt className="font-semibold">{t[`detail_${key}`] ?? key}:</dt>
          <dd>{show(key, value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyOptions({ t }: { t: Strings }) {
  return (
    <div className="rounded-ct-lg border border-dashed bg-surface px-6 py-8 text-center">
      <p className="ct-help">{t.noOptions}</p>
    </div>
  );
}
