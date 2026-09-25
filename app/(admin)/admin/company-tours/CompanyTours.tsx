"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ladeStopps, removeTourLead, saveStop, saveTour, saveTourLead, type Stopp } from "./actions";

export type AdminTour = {
  tour_id: string;
  name: string;
  track: string | null;
  event_day_id: string | null;
  meeting_point: string | null;
  starts_at: string | null;
  ends_at: string | null;
  lead_contact_id: string | null;
  lead_name: string | null;
  capacity: number | null;
  notes: string | null;
  session_id: string | null;
  session_title: string | null;
  stops: number;
  stops_filled: number;
};

export type Optionen = {
  edition_id: string | null;
  days: { id: string; label: string }[];
  leads: {
    id: string; name: string; email: string | null; phone: string | null;
    role_label_de: string | null; role_label_en: string | null; contract_consent_at: string | null;
    /** An wie vielen Touren sie hängt — vor dem Löschen sichtbar. */
    tours: number;
  }[];
  sessions: { id: string; title: string; format: string }[];
  orgs: { id: string; name: string }[];
};

type Strings = Record<string, string>;

/** Ein Zeitpunkt für `datetime-local`: Ortszeit ohne Zone, Minuten genau. */
function fuerEingabe(wert: string | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function ausEingabe(wert: string): string {
  return wert ? new Date(wert).toISOString() : "";
}

type TourEntwurf = {
  id: string;
  name: string;
  track: string;
  event_day_id: string;
  meeting_point: string;
  starts_at: string;
  ends_at: string;
  lead_contact_id: string;
  capacity: string;
  notes: string;
  session_id: string;
};
const LEERE_TOUR: TourEntwurf = {
  id: "", name: "", track: "", event_day_id: "", meeting_point: "", starts_at: "", ends_at: "",
  lead_contact_id: "", capacity: "", notes: "", session_id: "",
};

type LeadEntwurf = {
  id: string;
  display_name: string;
  email: string;
  phone: string;
  role_label_de: string;
  contract_consent_at: string;
};
const LEERE_BEGLEITUNG: LeadEntwurf = {
  id: "", display_name: "", email: "", phone: "", role_label_de: "", contract_consent_at: "",
};

type StoppEntwurf = {
  id: string;
  tour_id: string;
  sort_order: string;
  arrival_at: string;
  departure_at: string;
  host_org_id: string;
  address: string;
};

/**
 * Touren, Stopps und die Verknüpfung zur Session an einer Stelle.
 *
 * Die Stopps liegen hinter einem eigenen Knopf und werden **erst beim Öffnen**
 * geladen: sechs Touren mit je fünf Stopps wären sonst dreissig Zeilen, die
 * niemand sehen will, während er eine Uhrzeit korrigiert.
 */
export function CompanyTours({
  touren, optionen, t, common, rpcMessages,
}: {
  touren: AdminTour[];
  optionen: Optionen;
  t: Strings;
  common: Strings;
  rpcMessages: Strings;
}) {
  const [tour, setTour] = useState<TourEntwurf | null>(null);
  const [stoppsVon, setStoppsVon] = useState<AdminTour | null>(null);
  const [stopps, setStopps] = useState<Stopp[] | null>(null);
  const [stopp, setStopp] = useState<StoppEntwurf | null>(null);
  const [lead, setLead] = useState<LeadEntwurf | null>(null);
  const [leadWeg, setLeadWeg] = useState<Optionen["leads"][number] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const melden = (key: string, detail?: string) =>
    setFehler((rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : ""));

  const bearbeiten = (x: AdminTour) =>
    setTour({
      id: x.tour_id, name: x.name, track: x.track ?? "", event_day_id: x.event_day_id ?? "",
      meeting_point: x.meeting_point ?? "", starts_at: fuerEingabe(x.starts_at), ends_at: fuerEingabe(x.ends_at),
      lead_contact_id: x.lead_contact_id ?? "", capacity: x.capacity == null ? "" : String(x.capacity),
      notes: x.notes ?? "", session_id: x.session_id ?? "",
    });

  const setT = <K extends keyof TourEntwurf>(k: K, v: TourEntwurf[K]) => setTour((o) => (o ? { ...o, [k]: v } : o));
  const setL = <K extends keyof LeadEntwurf>(k: K, v: LeadEntwurf[K]) => setLead((o) => (o ? { ...o, [k]: v } : o));
  const setS = <K extends keyof StoppEntwurf>(k: K, v: StoppEntwurf[K]) => setStopp((o) => (o ? { ...o, [k]: v } : o));

  const leadBearbeiten = (l: Optionen["leads"][number]) => {
    setFehler(null);
    setLead({
      id: l.id, display_name: l.name, email: l.email ?? "", phone: l.phone ?? "",
      role_label_de: l.role_label_de ?? "", contract_consent_at: l.contract_consent_at ?? "",
    });
  };

  const stoppsOeffnen = (x: AdminTour) => {
    setFehler(null);
    setStoppsVon(x);
    setStopps(null);
    start(async () => {
      const res = await ladeStopps(x.tour_id);
      if (res.ok) setStopps(res.stopps);
      else { setStopps([]); melden(res.key, res.detail); }
    });
  };

  const stoppsNeuLaden = (tourId: string) =>
    start(async () => {
      const res = await ladeStopps(tourId);
      if (res.ok) setStopps(res.stopps);
    });

  const zeit = (wert: string | null) =>
    wert ? new Date(wert).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="flex flex-col gap-4">
      {fehler && !tour && !stopp && (
        <p role="alert" className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setFehler(null); setTour({ ...LEERE_TOUR }); }}>{t.add}</Button>
      </div>

      {touren.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyBody} />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y">
            {touren.map((x) => (
              <li key={x.tour_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="ct-label text-ink">{x.name}</span>
                {zeit(x.starts_at) && <span className="ct-help">{zeit(x.starts_at)}</span>}
                {x.lead_name && <span className="ct-help">{x.lead_name}</span>}
                {x.capacity != null && <span className="ct-help">{x.capacity} {t.seats}</span>}
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {/* Die Session ist der Bewerbungsweg — fehlt sie, kommt niemand
                      auf die Tour. Das gehört in die Zeile, nicht in den Editor. */}
                  <Badge tone={x.session_id ? "success" : "warning"}>
                    {x.session_id ? t.sessionLinked : t.noSession}
                  </Badge>
                  <span className="ct-help">{x.stops_filled}/{x.stops} {t.filled}</span>
                  <Button size="sm" variant="ghost" onClick={() => stoppsOeffnen(x)}>{t.stops}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setFehler(null); bearbeiten(x); }}>{t.edit}</Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ADM-060: die Begleitungen als eigene Sektion — die Tour-Maske wählt aus
          derselben Liste, aber wer eine pflegen will, soll dafür keine Tour
          öffnen müssen. */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="ct-h3 text-ink">{t.leadsTitle}</h2>
          <Button size="sm" variant="secondary" onClick={() => { setFehler(null); setLead({ ...LEERE_BEGLEITUNG }); }}>
            {t.addLead}
          </Button>
        </div>
        <p className="ct-help">{t.leadsHint}</p>
        {optionen.leads.length === 0 ? (
          <EmptyState title={t.emptyLeads} description={t.emptyLeadsBody} />
        ) : (
          <Card>
            <ul className="flex flex-col divide-y">
              {optionen.leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className="ct-label text-ink">{l.name}</span>
                  {l.role_label_de && <span className="ct-help">{l.role_label_de}</span>}
                  {l.phone && <span className="ct-help">{l.phone}</span>}
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Badge tone={l.tours > 0 ? "success" : "neutral"}>
                      {t.leadTours.replace("{n}", String(l.tours))}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => leadBearbeiten(l)}>{t.edit}</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setFehler(null); setLeadWeg(l); }}>
                      {common.delete}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {leadWeg && (
        <ConfirmDialog
          title={t.deleteLeadTitle}
          // Sagt, was dabei leer wird — sonst merkt es erst, wer die Tour aufmacht.
          body={leadWeg.tours > 0 ? t.deleteLeadBodyTours.replace("{n}", String(leadWeg.tours)) : t.deleteLeadBody}
          detail={leadWeg.name}
          confirmLabel={common.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setLeadWeg(null)}
          onConfirm={() =>
            start(async () => {
              const res = await removeTourLead(leadWeg.id);
              setLeadWeg(null);
              if (!res.ok) melden(res.key, res.detail);
            })
          }
        />
      )}

      {tour && (
        <Drawer open error={fehler} onClose={() => setTour(null)} title={tour.id ? t.edit : t.add}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFehler(null);
              start(async () => {
                const res = await saveTour({
                  ...(tour.id ? { id: tour.id } : { edition_id: optionen.edition_id }),
                  name: tour.name,
                  track: tour.track,
                  event_day_id: tour.event_day_id,
                  meeting_point: tour.meeting_point,
                  starts_at: ausEingabe(tour.starts_at),
                  ends_at: ausEingabe(tour.ends_at),
                  lead_contact_id: tour.lead_contact_id,
                  capacity: tour.capacity,
                  notes: tour.notes,
                  // Nur beim Bearbeiten: beim Anlegen gibt es die Tour noch
                  // nicht, gegen deren Edition die Session geprüft wird.
                  ...(tour.id ? { session_id: tour.session_id } : {}),
                });
                if (res.ok) setTour(null);
                else melden(res.key, res.detail);
              });
            }}
          >
            <Field label={t.fieldName} htmlFor="ct-name" required>
              <Input id="ct-name" value={tour.name} required onChange={(e) => setT("name", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldDay} htmlFor="ct-day">
                <Select
                  id="ct-day"
                  value={tour.event_day_id}
                  placeholder={t.fieldDayNone}
                  options={optionen.days.map((d) => ({ value: d.id, label: d.label }))}
                  onChange={(e) => setT("event_day_id", e.target.value)}
                />
              </Field>
              <Field label={t.fieldTrack} htmlFor="ct-track">
                <Input id="ct-track" value={tour.track} onChange={(e) => setT("track", e.target.value)} />
              </Field>
              <Field label={t.fieldStartsAt} htmlFor="ct-start">
                <Input id="ct-start" type="datetime-local" value={tour.starts_at} onChange={(e) => setT("starts_at", e.target.value)} />
              </Field>
              <Field label={t.fieldEndsAt} htmlFor="ct-end">
                <Input id="ct-end" type="datetime-local" value={tour.ends_at} onChange={(e) => setT("ends_at", e.target.value)} />
              </Field>
            </div>
            <Field label={t.fieldMeetingPoint} htmlFor="ct-meet">
              <Input id="ct-meet" value={tour.meeting_point} onChange={(e) => setT("meeting_point", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldLead} htmlFor="ct-lead" hint={t.fieldLeadHint}>
                <Select
                  id="ct-lead"
                  value={tour.lead_contact_id}
                  placeholder={t.fieldLeadNone}
                  options={optionen.leads.map((l) => ({ value: l.id, label: l.name }))}
                  onChange={(e) => setT("lead_contact_id", e.target.value)}
                />
                {/* ADM-059: anlegen und pflegen, ohne den Abschnitt zu verlassen —
                    wer nur Company Tours hat, kommt sonst nirgends an die
                    Begleitung heran. */}
                <span className="mt-2 flex gap-2">
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => { setFehler(null); setLead({ ...LEERE_BEGLEITUNG }); }}
                  >
                    {t.addLead}
                  </Button>
                  {tour.lead_contact_id && (
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => {
                        const l = optionen.leads.find((x) => x.id === tour.lead_contact_id);
                        if (l) leadBearbeiten(l);
                      }}
                    >
                      {t.editLead}
                    </Button>
                  )}
                </span>
              </Field>
              <Field label={t.fieldCapacity} htmlFor="ct-cap">
                <Input id="ct-cap" inputMode="numeric" value={tour.capacity} onChange={(e) => setT("capacity", e.target.value)} />
              </Field>
            </div>
            {tour.id && (
              <Field label={t.fieldSession} htmlFor="ct-session" hint={t.fieldSessionHint}>
                <Select
                  id="ct-session"
                  value={tour.session_id}
                  placeholder={t.fieldSessionNone}
                  options={optionen.sessions.map((s) => ({ value: s.id, label: s.title }))}
                  onChange={(e) => setT("session_id", e.target.value)}
                />
              </Field>
            )}
            <Field label={t.fieldNotes} htmlFor="ct-notes" hint={t.fieldNotesHint}>
              <Textarea id="ct-notes" rows={3} value={tour.notes} onChange={(e) => setT("notes", e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>{common.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setTour(null)}>{common.cancel}</Button>
            </div>
          </form>
        </Drawer>
      )}

      {lead && (
        <Drawer open error={fehler} onClose={() => setLead(null)} title={lead.id ? t.editLead : t.addLead}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFehler(null);
              start(async () => {
                const res = await saveTourLead({
                  ...(lead.id ? { id: lead.id } : { edition_id: optionen.edition_id }),
                  display_name: lead.display_name,
                  email: lead.email,
                  phone: lead.phone,
                  role_label_de: lead.role_label_de,
                  contract_consent_at: lead.contract_consent_at,
                });
                if (!res.ok) { melden(res.key, res.detail); return; }
                // Frisch angelegt: gleich an der offenen Tour setzen, sonst
                // müsste man sie hinterher suchen.
                if (!lead.id) setT("lead_contact_id", res.id);
                setLead(null);
              });
            }}
          >
            <Field label={t.fieldLeadName} htmlFor="cl-name" required>
              <Input id="cl-name" value={lead.display_name} required onChange={(e) => setL("display_name", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldLeadEmail} htmlFor="cl-mail" hint={t.fieldLeadEmailHint} required>
                <Input id="cl-mail" type="email" value={lead.email} required onChange={(e) => setL("email", e.target.value)} />
              </Field>
              <Field label={t.fieldLeadPhone} htmlFor="cl-phone" required>
                <Input id="cl-phone" value={lead.phone} required onChange={(e) => setL("phone", e.target.value)} />
              </Field>
              <Field label={t.fieldLeadRole} htmlFor="cl-role" hint={t.fieldLeadRoleHint}>
                <Input id="cl-role" value={lead.role_label_de} onChange={(e) => setL("role_label_de", e.target.value)} />
              </Field>
              <Field label={t.fieldLeadConsent} htmlFor="cl-consent" hint={t.fieldLeadConsentHint}>
                <Input id="cl-consent" type="date" value={lead.contract_consent_at} onChange={(e) => setL("contract_consent_at", e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>{common.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setLead(null)}>{common.cancel}</Button>
            </div>
          </form>
        </Drawer>
      )}

      {stoppsVon && !stopp && (
        <Drawer open error={fehler} onClose={() => { setStoppsVon(null); setStopps(null); }} title={`${t.stopsOf} · ${stoppsVon.name}`}>
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  setFehler(null);
                  setStopp({
                    id: "", tour_id: stoppsVon.tour_id,
                    sort_order: String((stopps?.length ?? 0) + 1),
                    arrival_at: "", departure_at: "", host_org_id: "", address: "",
                  });
                }}
              >
                {t.addStop}
              </Button>
            </div>
            {stopps === null ? (
              <p className="ct-help">{rpcMessages.loading ?? "…"}</p>
            ) : stopps.length === 0 ? (
              <EmptyState title={t.emptyStops} description={t.emptyStopsBody} />
            ) : (
              <ul className="flex flex-col divide-y">
                {stopps.map((s) => (
                  <li key={s.stop_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                    <span className="ct-label text-ink">{s.sort_order}. {s.host_org_name ?? t.fieldHostNone}</span>
                    {zeit(s.arrival_at) && <span className="ct-help">{zeit(s.arrival_at)}</span>}
                    {s.address && <span className="ct-help">{s.address}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {s.filled_at && <Badge tone="success">{t.stopBooked}</Badge>}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setFehler(null);
                          setStopp({
                            id: s.stop_id, tour_id: stoppsVon.tour_id, sort_order: String(s.sort_order),
                            arrival_at: fuerEingabe(s.arrival_at), departure_at: fuerEingabe(s.departure_at),
                            host_org_id: s.host_org_id ?? "", address: s.address ?? "",
                          });
                        }}
                      >
                        {t.edit}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Drawer>
      )}

      {stopp && (
        <Drawer open error={fehler} onClose={() => setStopp(null)} title={stopp.id ? t.editStop : t.addStop}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFehler(null);
              start(async () => {
                const res = await saveStop({
                  ...(stopp.id ? { id: stopp.id } : { tour_id: stopp.tour_id }),
                  sort_order: Number(stopp.sort_order) || 1,
                  arrival_at: ausEingabe(stopp.arrival_at),
                  departure_at: ausEingabe(stopp.departure_at),
                  host_org_id: stopp.host_org_id,
                  address: stopp.address,
                });
                if (!res.ok) { melden(res.key, res.detail); return; }
                setStopp(null);
                stoppsNeuLaden(stopp.tour_id);
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.fieldSort} htmlFor="cs-sort">
                <Input id="cs-sort" inputMode="numeric" value={stopp.sort_order} onChange={(e) => setS("sort_order", e.target.value)} />
              </Field>
              <Field label={t.fieldHost} htmlFor="cs-host">
                <Select
                  id="cs-host"
                  value={stopp.host_org_id}
                  placeholder={t.fieldHostNone}
                  options={optionen.orgs.map((o) => ({ value: o.id, label: o.name }))}
                  onChange={(e) => setS("host_org_id", e.target.value)}
                />
              </Field>
              <Field label={t.fieldArrival} htmlFor="cs-arr">
                <Input id="cs-arr" type="datetime-local" value={stopp.arrival_at} onChange={(e) => setS("arrival_at", e.target.value)} />
              </Field>
              <Field label={t.fieldDeparture} htmlFor="cs-dep">
                <Input id="cs-dep" type="datetime-local" value={stopp.departure_at} onChange={(e) => setS("departure_at", e.target.value)} />
              </Field>
            </div>
            <Field label={t.fieldAddress} htmlFor="cs-addr">
              <Input id="cs-addr" value={stopp.address} onChange={(e) => setS("address", e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>{common.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setStopp(null)}>{common.cancel}</Button>
            </div>
          </form>
        </Drawer>
      )}
    </div>
  );
}
