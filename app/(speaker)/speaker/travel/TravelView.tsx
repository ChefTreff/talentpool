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
import { addDays, dayInZone, formatDay } from "@/lib/tz";
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

/** Der Summit ist in Hamburg; die Kontingente tragen keine eigene Zone. */
const ORTSZEIT = "Europe/Berlin";

/**
 * Welche Tage ein Hotelkontingent zulässt (SPK-060, Konrad 24.09.: „nur
 * Donnerstag 15.04. bis Sonntag 18.04.2027 (Check-out) wählbar").
 *
 * Aus dem Fenster des Kontingents, nicht fest im Code: `window_from` ist der
 * früheste Check-in (15.04., 15 Uhr), `window_to` der späteste Check-out
 * (18.04., 11 Uhr). Angereist wird also bis zum Tag vor dem letzten,
 * abgereist frühestens am Tag nach dem ersten. Die Anreise hat eine Uhrzeit;
 * die Grenze gilt für den Tag, nicht für die Stunde — wer mittags ankommt,
 * soll das sagen können. Was nicht hineinpasst, gehört unter „Besonderheiten".
 */
function hotelGrenzen(o: { window_from: string | null; window_to: string | null }) {
  if (!o.window_from || !o.window_to) return null;
  const erster = dayInZone(o.window_from, ORTSZEIT);
  const letzter = dayInZone(o.window_to, ORTSZEIT);
  return {
    erster,
    letzter,
    check_in: { min: `${erster}T00:00`, max: `${addDays(letzter, -1)}T23:59` },
    check_out: { min: addDays(erster, 1), max: letzter },
  };
}

/** Das Zeichen zur Art des Angebots (SPK-062: „mehr Gestaltung — Bild oder Icon"). */
function ArtZeichen({ kind }: { kind: string }) {
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ct-md bg-accent-soft text-accent-deep"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "hotel" ? (
          // Bett: Kopfteil, Liegefläche, Kissen
          <path d="M3 18v-9m0 5h18v4m0-4v-2a3 3 0 0 0-3-3h-7v5M6.5 11.5a1.5 1.5 0 1 0 0-.01" />
        ) : kind === "shuttle" ? (
          // Bus von vorn
          <path d="M6 17h12M6 17v2m12-2v2M5 5h14v12H5zM5 11h14M8 14h.01M16 14h.01" />
        ) : (
          <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" />
        )}
      </svg>
    </span>
  );
}

export function TravelView({
  isAssistant,
  options,
  bookings,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  isAssistant: boolean;
  options: HospitalityOption[];
  bookings: HospitalityBooking[];
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: {
    cancel: string;
    choose: string;
    none: string;
    save: string;
    yes: string;
    no: string;
  };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [guests, setGuests] = useState("1");
  /** Datum ausserhalb des Kontingents (SPK-060) — am Feld, nicht als Toast. */
  const [datumsFehler, setDatumsFehler] = useState<{ feld: string; text: string } | null>(null);
  const [askCancel, setAskCancel] = useState<HospitalityBooking | null>(null);
  // SPK-017: die Einwilligung wird **nach** dem Klick auf „Buchen" gefragt,
  // nicht davor. Vorher fehlte der Knopf ganz, solange sie fehlte — man drückte
  // ins Leere und suchte den Grund oben auf der Seite.
  const [askConsent, setAskConsent] = useState<HospitalityOption | null>(null);
  /**
   * Fehler **im** Dialog, nicht als Toast.
   *
   * `<dialog showModal>` rendert im Top-Layer des Browsers, über jedem
   * z-index. Ein Toast (`z-50`) läge dahinter: der Dialog bliebe offen, die
   * Meldung unsichtbar, und es sähe aus, als passiere nichts. Derselbe Befund
   * wie im Ansprechpartner-Admin (ADM-041).
   */
  const [consentError, setConsentError] = useState<string | null>(null);

  const message = (key: string) =>
    rpcMessages[key] ?? rpcMessages.unknown ?? key;
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
    (locale === "en" ? o.label_en : o.label_de) ??
    o.label_de ??
    o.label_en ??
    "—";

  // Der Grund steht an jeder Zeile gleich; für den Seitenhinweis reicht der erste.
  const blockReason = options.find((o) => !o.eligible)?.block_reason ?? null;
  const active = bookings.filter((b) => b.status !== "cancelled");

  function onBook(option: HospitalityOption) {
    const count = Number(guests) || 1;
    // Der Browser hält `min`/`max` nur in der Auswahl ein — getippt geht mehr.
    // Deshalb hier noch einmal, mit derselben Regel (SPK-060).
    const grenzen = option.kind === "hotel" ? hotelGrenzen(option) : null;
    const feld = grenzen ? hotelFensterFehler(grenzen, details) : null;
    if (grenzen && feld) {
      setDatumsFehler({
        feld,
        text: t.hotelDatesInvalid
          .replace("{von}", formatDay(grenzen.erster, dateLocale))
          .replace("{bis}", formatDay(grenzen.letzter, dateLocale)),
      });
      return;
    }
    setDatumsFehler(null);
    startTransition(async () => {
      const res = await bookHospitality(option.quota_id, details, count);
      if (!res.ok) {
        toast(
          "error",
          message(res.key) + (res.detail ? ` (${res.detail})` : ""),
        );
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

  /**
   * Einwilligung geben und **weitermachen**, wo der Klick unterbrochen wurde.
   *
   * `setOpenForm` steht vor dem Neuladen: danach liefert die RPC `eligible`
   * und das Formular der angefragten Zeile steht schon offen. Sonst müsste
   * jemand, der gerade zugestimmt hat, ein zweites Mal auf „Buchen" drücken.
   */
  function onGiveConsent(option: HospitalityOption | null) {
    setConsentError(null);
    startTransition(async () => {
      const res = await saveSpeakerConsents({ hospitality_data: true });
      if (!res.ok) {
        setConsentError(message(res.key));
        return;
      }
      setAskConsent(null);
      if (option) {
        setOpenForm(option.quota_id);
        setDetails({});
        setGuests("1");
      }
      toast("success", t.consentSaved);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Freischaltung: Status setzt das Team, den Consent gibt der Speaker. */}
      {blockReason === "status" && (
        <Card className="p-6">
          <h2 className="ct-h3 mb-2 text-ink">{t.notEligibleTitle}</h2>
          <p className="ct-help">{t.notEligibleBody}</p>
        </Card>
      )}
      {/* Seit Migration 0034 unterscheidet die RPC „abgelehnt" von „noch nicht
          dran" selbst — der Satz kommt damit aus einer Quelle. */}
      {blockReason === "declined" && (
        <Card className="p-6">
          <h2 className="ct-h3 mb-2 text-ink">{t.declinedTitle}</h2>
          <p className="ct-help">{t.declinedBody}</p>
        </Card>
      )}
      {/* Die Assistenz darf die Einwilligung nicht geben (Antwort 58). Für sie
          bleibt der Hinweis oben stehen — bei ihr führt kein Klick weiter, also
          wäre ein Pop-up nach dem Klick eine Sackgasse statt einer Erklärung.
          Für den Speaker selbst steht der Hinweis jetzt am Knopf (SPK-017). */}
      {blockReason === "consent" && isAssistant && (
        <Card className="p-6">
          <h2 className="ct-h3 mb-2 text-ink">{t.consentNeededTitle}</h2>
          <p className="ct-help">{t.consentHospitality}</p>
          <p className="ct-help mt-3">{t.consentReadOnly}</p>
        </Card>
      )}

      {/* Eigene Buchungen */}
      {active.length > 0 && (
        <section aria-labelledby="h-bookings">
          <h2 id="h-bookings" className="ct-h2 mb-3 text-ink">
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
                      <span className="ct-help">
                        {t.guests}: {b.guests}
                      </span>
                    </div>
                    {b.status === "waitlisted" && (
                      <p className="ct-help mt-2">{t.waitlistNote}</p>
                    )}
                    <Details
                      details={b.details}
                      kind={b.kind}
                      bareDate={bareDate}
                      t={t}
                      jaNein={{ yes: common.yes, no: common.no }}
                    />
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
        <h2 id="h-options" className="ct-h2 mb-3 text-ink">
          {t.optionsTitle}
        </h2>
        <p className="ct-help mb-3">{t.optionsLead}</p>
        {options.length === 0 ? (
          <EmptyOptions t={t} />
        ) : (
          <ul className="flex flex-col gap-3">
            {options.map((o) => {
              const booked = o.my_booking != null;
              const full = o.free <= 0;
              const isOpen = openForm === o.quota_id;
              const grenzen = o.kind === "hotel" ? hotelGrenzen(o) : null;
              // Fehlt nur die Einwilligung, bleibt der Knopf da und fragt sie
              // ab (SPK-017). Alle anderen Gründe — Status, Absage — sind
              // nichts, was ein Klick ändern könnte; dort gibt es keinen Knopf.
              const needsConsent =
                !o.eligible && o.block_reason === "consent" && !isAssistant;
              return (
                <Card as="li" key={o.quota_id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <ArtZeichen kind={o.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="ct-label text-ink">{label(o)}</p>
                      <div className="ct-help mt-1 flex flex-wrap items-center gap-x-3">
                        <span>{t[`kind_${o.kind}`] ?? o.kind}</span>
                        {/* Die Stufe („Standard (Radisson Blu Dammtor)") steht
                            nicht mehr hier (SPK-062): sie ist ein internes Feld
                            und wiederholt nur den Namen des Hotels. */}
                        {o.location && <span>· {o.location}</span>}
                        {o.window_from && o.window_to && (
                          <span className="tabular-nums">
                            · {dateOnly.format(new Date(o.window_from))} –{" "}
                            {dateOnly.format(new Date(o.window_to))}
                          </span>
                        )}
                      </div>
                      {(locale === "en"
                        ? o.description_en
                        : o.description_de) && (
                        <p className="ct-help mt-1">
                          {locale === "en"
                            ? o.description_en
                            : o.description_de}
                        </p>
                      )}
                      {/* Nur noch „ausgebucht" (SPK-062): wie viele Plätze frei
                          sind, ist eine Zahl fürs Team — für den Speaker zählt,
                          ob er buchen kann oder auf die Warteliste kommt. */}
                      {full && <p className="ct-help mt-1">{t.optionFull}</p>}
                    </div>
                    {booked ? (
                      <Badge
                        tone={STATUS_TONE[o.my_booking!.status] ?? "neutral"}
                      >
                        {t[`hospitality_${o.my_booking!.status}`] ??
                          o.my_booking!.status}
                      </Badge>
                    ) : (
                      (o.eligible || needsConsent) && (
                        <Button
                          size="sm"
                          variant={isOpen ? "ghost" : "primary"}
                          disabled={pending}
                          onClick={() => {
                            if (needsConsent) {
                              setAskConsent(o);
                              return;
                            }
                            setOpenForm(isOpen ? null : o.quota_id);
                            setDatumsFehler(null);
                            setDetails({});
                            setGuests("1");
                          }}
                        >
                          {isOpen
                            ? common.cancel
                            : full
                              ? t.joinWaitlist
                              : t.book}
                        </Button>
                      )
                    )}
                  </div>

                  {isOpen && !booked && (
                    <div className="mt-4 border-t pt-4">
                      {full && <p className="ct-help mb-3">{t.waitlistHint}</p>}
                      {grenzen && (
                        <p className="ct-help mb-3">
                          {t.hotelDatesHint
                            .replace("{von}", formatDay(grenzen.erster, dateLocale))
                            .replace("{bis}", formatDay(grenzen.letzter, dateLocale))}
                        </p>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2">
                        {(DETAIL_FIELDS[o.kind] ?? []).map((f) => (
                          <Field
                            key={f.key}
                            label={t[`detail_${f.key}`] ?? f.key}
                            htmlFor={`${o.quota_id}-${f.key}`}
                            className={
                              f.kind === "area" ? "sm:col-span-2" : undefined
                            }
                            error={datumsFehler?.feld === f.key ? datumsFehler.text : undefined}
                          >
                            {f.kind === "check" ? (
                              // Ein Haken steht als "true" im JSON, nicht als
                              // übersetztes Wort: die Buchung liest auch das
                              // Team, und zwar in seiner Sprache.
                              <label className="flex min-h-11 items-center gap-2 ct-small text-ink">
                                <input
                                  id={`${o.quota_id}-${f.key}`}
                                  type="checkbox"
                                  checked={details[f.key] === "true"}
                                  onChange={(e) =>
                                    setDetails((d) => ({
                                      ...d,
                                      [f.key]: e.target.checked ? "true" : "",
                                    }))
                                  }
                                />
                                {t[`detail_${f.key}`] ?? f.key}
                              </label>
                            ) : f.kind === "area" ? (
                              <Textarea
                                id={`${o.quota_id}-${f.key}`}
                                rows={2}
                                value={details[f.key] ?? ""}
                                onChange={(e) =>
                                  setDetails((d) => ({
                                    ...d,
                                    [f.key]: e.target.value,
                                  }))
                                }
                              />
                            ) : (
                              <Input
                                id={`${o.quota_id}-${f.key}`}
                                type={
                                  f.kind === "date"
                                    ? "date"
                                    : f.kind === "datetime"
                                      ? "datetime-local"
                                      : "text"
                                }
                                value={details[f.key] ?? ""}
                                min={grenzeVon(grenzen, f.key)}
                                max={grenzeBis(grenzen, f.key)}
                                invalid={datumsFehler?.feld === f.key}
                                onChange={(e) => {
                                  if (datumsFehler?.feld === f.key) setDatumsFehler(null);
                                  setDetails((d) => ({
                                    ...d,
                                    [f.key]: e.target.value,
                                  }));
                                }}
                              />
                            )}
                          </Field>
                        ))}
                        <Field
                          label={t.guests}
                          htmlFor={`${o.quota_id}-guests`}
                          hint={t.guestsHint}
                        >
                          <Input
                            id={`${o.quota_id}-guests`}
                            type="number"
                            min={1}
                            max={2}
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

      {/* SPK-017: die Einwilligung steht dort, wo sie gebraucht wird — im Weg
          zur Buchung, mit dem Namen der Unterkunft daneben, damit klar ist,
          worum es geht. */}
      {askConsent && (
        <ConfirmDialog
          title={t.consentNeededTitle}
          body={t.consentHospitality}
          detail={
            <>
              <p className="ct-label">{label(askConsent)}</p>
              {consentError && (
                <p
                  role="alert"
                  className="mt-3 rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink"
                >
                  {consentError}
                </p>
              )}
            </>
          }
          confirmLabel={t.consentAskConfirm}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => {
            setConsentError(null);
            setAskConsent(null);
          }}
          onConfirm={() => onGiveConsent(askConsent)}
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
  jaNein,
}: {
  details: Record<string, string> | null;
  kind: string;
  /** Formatter in UTC — die Werte sind Kalendertage ohne Zone. */
  bareDate: Intl.DateTimeFormat;
  t: Strings;
  /** Für Haken: „Ja“ und „Nein“ stehen im gemeinsamen Wortschatz. */
  jaNein: { yes: string; no: string };
}) {
  const entries = Object.entries(details ?? {}).filter(([, v]) => v);
  if (entries.length === 0) return null;
  const felder = DETAIL_FIELDS[kind] ?? [];
  const art = new Map(felder.map((f) => [f.key, f.kind]));
  const show = (key: string, value: string) => {
    // Ein Haken steht als "true" im JSON — hier wird daraus ein Wort, sonst
    // stünde „Late Checkout: true" in der Buchung.
    if (art.get(key) === "check")
      return value === "true" ? jaNein.yes : jaNein.no;
    if (art.get(key) !== "date" && art.get(key) !== "datetime") return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return value;
    // Reine Kalendertage ohne Zone formatiert `bareDate` in UTC; ein
    // Zeitpunkt mit Uhrzeit gehört in die Zone der Leserin.
    return art.get(key) === "datetime"
      ? parsed.toLocaleString()
      : bareDate.format(parsed);
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

type Grenzen = ReturnType<typeof hotelGrenzen>;

function grenzeVon(g: Grenzen, key: string): string | undefined {
  if (!g) return undefined;
  return key === "check_in" ? g.check_in.min : key === "check_out" ? g.check_out.min : undefined;
}

function grenzeBis(g: Grenzen, key: string): string | undefined {
  if (!g) return undefined;
  return key === "check_in" ? g.check_in.max : key === "check_out" ? g.check_out.max : undefined;
}

/**
 * Welches Datum passt nicht ins Kontingent — die Anreise, die Abreise oder
 * keins (`null`)? Auch eine Abreise vor oder am Tag der Anreise gilt als
 * falsche Abreise. Leere Felder lässt die Prüfung durch: ob sie Pflicht sind,
 * entscheidet die Buchung selbst, nicht diese Grenze.
 */
function hotelFensterFehler(
  g: NonNullable<Grenzen>,
  details: Record<string, string>,
): "check_in" | "check_out" | null {
  const an = (details.check_in ?? "").slice(0, 10);
  const ab = details.check_out ?? "";
  // Kalendertage als JJJJ-MM-TT lassen sich als Zeichenketten vergleichen.
  if (an && (an < g.check_in.min.slice(0, 10) || an > g.check_in.max.slice(0, 10))) return "check_in";
  if (ab && (ab < g.check_out.min || ab > g.check_out.max)) return "check_out";
  if (an && ab && ab <= an) return "check_out";
  return null;
}
