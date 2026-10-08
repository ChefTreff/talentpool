"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { ConfirmDialog, Modal, ModalFuss } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { sideEventFehler } from "@/lib/side-event/meldung";
import { inviteSpeakers, loadInvites, removeSideEvent, saveSideEvent, setInviteStatus } from "./actions";
import {
  SIDE_EVENT_FIELDS,
  type InviteResult,
  type InviteStatus,
  type SideEventInvite,
  type SideEventRow,
  type SpeakerAuswahl,
} from "./types";

type Strings = Record<string, string>;

/** Ein Zeitpunkt für `datetime-local`: Ortszeit ohne Zone, Minuten genau. */
function fuerEingabe(wert: string | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const LEER: Record<string, string> = {
  id: "",
  title_de: "",
  title_en: "",
  description_de: "",
  description_en: "",
  location: "",
  address: "",
  starts_at: "",
  ends_at: "",
  capacity: "",
  rsvp_deadline: "",
};

const TON: Record<InviteStatus, "warning" | "success" | "neutral"> = { invited: "warning", yes: "success", no: "neutral" };

/**
 * Side Events anlegen, veröffentlichen, **einladen** — und sehen, wer kommt (ADM-077).
 *
 * Zwei Zahlen stehen bewusst nebeneinander: **Plätze** (Zusagen plus Begleitungen, das ist die Obergrenze) und **Zusagen** (Menschen). Wer nur
 * eine davon sieht, plant falsch — entweder beim Catering oder bei der Tür.
 *
 * Die Einladungen kommen **auf Klick**, nicht mit der Seite: Namen und Hinweise sind Personendaten und sollen nicht mitgeladen werden, nur
 * weil jemand die Zahlen ansieht. Dort lädt man ein (Auswahl bestätigter Speaker), schickt die Mail erneut (neuer Link, der alte gilt dann
 * nicht mehr) und setzt den Stand von Hand, wenn jemand mündlich geantwortet hat.
 */
export function SideEventsAdmin({
  rows,
  speakers,
  placeholderDue,
  dateLocale,
  t,
  common,
  rpcMessages,
  pickerTexts,
}: {
  rows: SideEventRow[];
  speakers: SpeakerAuswahl[];
  placeholderDue: string | null;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; save: string; required: string; close: string; loading: string };
  rpcMessages: Record<string, string>;
  pickerTexts: { remove: string; noHits: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const [offen, setOffen] = useState<Record<string, string> | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState<SideEventRow | null>(null);

  // Das Einladungsfenster: nur die Id merken, die Zeile kommt aus `rows` — nach `router.refresh()` stimmen die Zahlen von selbst.
  const [eventId, setEventId] = useState<string | null>(null);
  const [invites, setInvites] = useState<SideEventInvite[] | null>(null);
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [inviteFehler, setInviteFehler] = useState<string | null>(null);
  const [askRemind, setAskRemind] = useState(false);
  const [stand, setStand] = useState<{ invite: SideEventInvite; status: InviteStatus; guests: string; note: string } | null>(null);
  const [standFehler, setStandFehler] = useState<string | null>(null);

  const msg = (key: string, detail?: string) => sideEventFehler(key, detail, rpcMessages);
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const day = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const event = eventId ? (rows.find((r) => r.id === eventId) ?? null) : null;

  const nameOf = (i: SideEventInvite) => [i.first_name, i.last_name].filter(Boolean).join(" ") || "—";
  const eingeladen = new Set((invites ?? []).map((i) => i.profile_id));
  const waehlbar = speakers.filter((s) => !eingeladen.has(s.id));
  const ohneAntwort = (invites ?? []).filter((i) => i.status === "invited");

  function bearbeiten(r: SideEventRow) {
    setFehler(null);
    setOffen({
      id: r.id,
      title_de: r.title_de,
      title_en: r.title_en,
      description_de: r.description_de ?? "",
      description_en: r.description_en ?? "",
      location: r.location,
      address: r.address ?? "",
      starts_at: fuerEingabe(r.starts_at),
      ends_at: fuerEingabe(r.ends_at),
      capacity: r.capacity == null ? "" : String(r.capacity),
      rsvp_deadline: fuerEingabe(r.rsvp_deadline),
    });
  }

  function speichern(daten: Record<string, string>) {
    setFehler(null);
    start(async () => {
      const res = await saveSideEvent({
        ...(daten.id ? { id: daten.id } : {}),
        title_de: daten.title_de,
        title_en: daten.title_en,
        description_de: daten.description_de,
        description_en: daten.description_en,
        location: daten.location,
        address: daten.address,
        starts_at: daten.starts_at,
        ends_at: daten.ends_at,
        capacity: daten.capacity,
        rsvp_deadline: daten.rsvp_deadline,
      });
      if (!res.ok) {
        setFehler(msg(res.key, res.detail));
        return;
      }
      setOffen(null);
      toast("success", t.saved);
      router.refresh();
    });
  }

  function umschalten(r: SideEventRow) {
    start(async () => {
      const res = await saveSideEvent({ id: r.id, published: !r.published });
      if (!res.ok) {
        toast("error", msg(res.key, res.detail));
        return;
      }
      toast("success", r.published ? t.unpublished : t.published);
      router.refresh();
    });
  }

  function loeschen(r: SideEventRow) {
    start(async () => {
      setAskDelete(null);
      const res = await removeSideEvent(r.id);
      if (!res.ok) {
        toast("error", msg(res.key, res.detail));
        return;
      }
      toast("success", t.deleted);
      router.refresh();
    });
  }

  async function ladeEinladungen(id: string) {
    const res = await loadInvites(id);
    if (!res.ok) {
      toast("error", msg(res.key, res.detail));
      setInvites([]);
      return;
    }
    setInvites(res.data);
  }

  function einladungenOeffnen(r: SideEventRow) {
    setEventId(r.id);
    setInvites(null);
    setAuswahl([]);
    setInviteFehler(null);
    start(async () => {
      await ladeEinladungen(r.id);
    });
  }

  function meldeErgebnis(r: InviteResult) {
    const teile = [t.inviteDone.replace("{n}", String(r.invited + r.resent))];
    if (r.skipped.length > 0) teile.push(t.inviteSkipped.replace("{n}", String(r.skipped.length)));
    if (r.no_mail.length > 0) teile.push(t.inviteNoMail.replace("{n}", String(r.no_mail.length)));
    toast(r.invited + r.resent > 0 && r.no_mail.length === 0 ? "success" : "info", teile.join(" "));
  }

  function einladen(profileIds: string[], erneut: boolean) {
    if (!event || profileIds.length === 0) return;
    setInviteFehler(null);
    start(async () => {
      const res = await inviteSpeakers(event.id, profileIds, erneut);
      setAskRemind(false);
      if (!res.ok) {
        setInviteFehler(msg(res.key, res.detail));
        return;
      }
      meldeErgebnis(res.data);
      setAuswahl([]);
      await ladeEinladungen(event.id);
      router.refresh();
    });
  }

  function standOeffnen(i: SideEventInvite) {
    setStandFehler(null);
    setStand({ invite: i, status: i.status, guests: String(i.guests), note: i.note ?? "" });
  }

  function standSpeichern() {
    if (!event || !stand) return;
    setStandFehler(null);
    start(async () => {
      const res = await setInviteStatus(event.id, stand.invite.profile_id, stand.status, Number(stand.guests) || 0, stand.note);
      if (!res.ok) {
        setStandFehler(msg(res.key, res.detail));
        return;
      }
      setStand(null);
      toast("success", t.statusSaved);
      await ladeEinladungen(event.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Der Platzhalter im Speaker-Portal, solange es noch keine Einladung gibt. Das Datum ist eine Frist (`side_events_publish`) und wird unter
          „Fristen“ gepflegt — hier steht nur, was Speaker gerade lesen. */}
      <Card>
        <p className="ct-label text-ink">{t.placeholderTitle}</p>
        <p className="ct-help mt-1">
          {placeholderDue ? t.placeholderSet.replaceAll("{datum}", day.format(new Date(placeholderDue))) : t.placeholderMissing}
        </p>
        <p className="mt-2">
          <Link className="ct-link" href="/admin/fristen">
            {t.placeholderLink}
          </Link>
        </p>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setFehler(null);
            setOffen({ ...LEER });
          }}
        >
          {t.add}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => {
            const frei = r.capacity == null ? null : Math.max(r.capacity - r.taken, 0);
            return (
              <Card as="li" key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="ct-h3 text-ink">{r.title_de}</h2>
                      <Badge tone={r.published ? "success" : "neutral"}>{r.published ? t.statusPublished : t.statusDraft}</Badge>
                    </div>
                    <p className="ct-help mt-1 tabular-nums">
                      {dateTime.format(new Date(r.starts_at))}
                      {r.ends_at ? ` – ${dateTime.format(new Date(r.ends_at))}` : ""} · {r.location}
                      {r.address ? `, ${r.address}` : ""}
                    </p>
                    {r.rsvp_deadline && (
                      <p className="ct-help mt-1 tabular-nums">
                        {t.deadline}: {dateTime.format(new Date(r.rsvp_deadline))}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => einladungenOeffnen(r)} disabled={pending}>
                      {t.invitesButton}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => bearbeiten(r)}>
                      {t.edit}
                    </Button>
                    {!r.published && (
                      <Button size="sm" variant="secondary" onClick={() => umschalten(r)} disabled={pending}>
                        {t.publish}
                      </Button>
                    )}
                    <Menu ton="hell" label={t.moreActions} trigger={<span>{t.moreActions}</span>} align="end">
                      {r.published && <MenuItem onSelect={() => umschalten(r)}>{t.unpublish}</MenuItem>}
                      <MenuItem onSelect={() => setAskDelete(r)}>{t.delete}</MenuItem>
                    </Menu>
                  </div>
                </div>

                {/* Plätze und Zusagen nebeneinander: die Obergrenze zählt Plätze, die Liste zählt Menschen. */}
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <dt className="ct-help">{t.statTaken}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">
                      {r.taken}
                      {r.capacity != null && <span className="ct-help"> / {r.capacity}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="ct-help">{t.statFree}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">{frei ?? t.unlimited}</dd>
                  </div>
                  <div>
                    <dt className="ct-help">{t.statYes}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">{r.yes_count}</dd>
                  </div>
                  <div>
                    <dt className="ct-help">{t.statOpen}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">{r.open_count}</dd>
                  </div>
                  <div>
                    <dt className="ct-help">{t.statInvited}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">{r.invited_count}</dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </ul>
      )}

      {offen && (
        <Drawer open error={fehler} onClose={() => setOffen(null)} title={offen.id ? t.edit : t.add} closeLabel={common.close}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              speichern(offen);
            }}
          >
            {SIDE_EVENT_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={t[`field_${f.key}`] ?? f.key}
                htmlFor={`se-${f.key}`}
                hint={t[`field_${f.key}_hint`]}
                required={f.required}
                requiredLabel={common.required}
              >
                <Input
                  id={`se-${f.key}`}
                  type={f.kind === "text" ? "text" : f.kind}
                  min={f.kind === "number" ? 1 : undefined}
                  value={offen[f.key] ?? ""}
                  onChange={(e) => setOffen({ ...offen, [f.key]: e.target.value })}
                />
              </Field>
            ))}

            <Field label={t.field_description_de} htmlFor="se-desc-de">
              <Textarea id="se-desc-de" rows={3} value={offen.description_de} onChange={(e) => setOffen({ ...offen, description_de: e.target.value })} />
            </Field>
            <Field label={t.field_description_en} htmlFor="se-desc-en">
              <Textarea id="se-desc-en" rows={3} value={offen.description_en} onChange={(e) => setOffen({ ...offen, description_en: e.target.value })} />
            </Field>

            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                {common.save}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOffen(null)}>
                {common.cancel}
              </Button>
            </div>
          </form>
        </Drawer>
      )}

      {event && (
        <Drawer
          open
          error={inviteFehler}
          onClose={() => {
            setEventId(null);
            setInvites(null);
          }}
          title={t.invitesTitle.replace("{title}", event.title_de)}
          closeLabel={common.close}
        >
          <div className="flex flex-col gap-6">
            <p className="ct-help tabular-nums">
              {t.invitesIntro
                .replace("{yes}", String(event.yes_count))
                .replace("{no}", String(event.no_count))
                .replace("{open}", String(event.open_count))}
              {event.capacity != null ? ` · ${t.invitesSeats.replace("{taken}", String(event.taken)).replace("{capacity}", String(event.capacity))}` : ""}
            </p>

            {/* Einladen: erst nach dem Veröffentlichen — die Mail nennt Datum und Ort. */}
            <section aria-labelledby="se-invite-h" className="flex flex-col gap-3">
              <h3 id="se-invite-h" className="ct-label text-ink">
                {t.invitePick}
              </h3>
              {!event.published ? (
                <p className="ct-help">{t.inviteNeedsPublish}</p>
              ) : invites === null ? (
                <p className="ct-help">{common.loading}</p>
              ) : waehlbar.length === 0 ? (
                <p className="ct-help">{t.inviteNone}</p>
              ) : (
                <>
                  <Field label={t.invitePickLabel} htmlFor="se-pick" hint={t.invitePickHint}>
                    <MehrfachAuswahl
                      id="se-pick"
                      options={waehlbar.map((s) => ({ value: s.id, label: s.label }))}
                      value={auswahl}
                      onChange={setAuswahl}
                      placeholder={t.invitePlaceholder}
                      describedBy="se-pick-hint"
                      t={pickerTexts}
                    />
                  </Field>
                  <div>
                    <Button onClick={() => einladen(auswahl, false)} loading={pending} disabled={auswahl.length === 0 || pending}>
                      {auswahl.length > 0 ? t.inviteSendN.replace("{n}", String(auswahl.length)) : t.inviteSend}
                    </Button>
                  </div>
                </>
              )}
            </section>

            <section aria-labelledby="se-list-h" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="se-list-h" className="ct-label text-ink">
                  {t.invitesList}
                </h3>
                {event.published && ohneAntwort.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => setAskRemind(true)} disabled={pending}>
                    {t.resendAll}
                  </Button>
                )}
              </div>
              {invites === null ? (
                <p className="ct-help">{common.loading}</p>
              ) : invites.length === 0 ? (
                <p className="ct-help">{t.invitesEmpty}</p>
              ) : (
                <ul className="flex flex-col">
                  {invites.map((i) => (
                    <li key={i.profile_id} className="flex flex-col gap-2 border-b py-3 last:border-b-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="ct-label text-ink">{nameOf(i)}</p>
                          <p className="ct-help tabular-nums">
                            {[
                              t.rowInvited.replace("{datum}", day.format(new Date(i.invited_at))),
                              i.responded_at ? t.rowAnswered.replace("{datum}", day.format(new Date(i.responded_at))).replace("{via}", t[`via_${i.via}`] ?? i.via) : null,
                              i.status === "yes" && i.guests > 0 ? t.rowGuests.replace("{n}", String(i.guests)) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={TON[i.status]}>{t[`status_${i.status}`] ?? i.status}</Badge>
                          <Button size="sm" variant="secondary" onClick={() => standOeffnen(i)} disabled={pending}>
                            {t.setStatus}
                          </Button>
                          {i.status === "invited" && event.published && (
                            <Button size="sm" variant="ghost" onClick={() => einladen([i.profile_id], true)} disabled={pending}>
                              {t.resendOne}
                            </Button>
                          )}
                        </div>
                      </div>
                      {i.note && (
                        <p className="ct-small">
                          <span className="text-muted">{t.rowNote}: </span>
                          {i.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Drawer>
      )}

      {event && stand && (
        <Modal label={t.setStatusTitle.replace("{name}", nameOf(stand.invite))} onCancel={() => setStand(null)} error={standFehler}>
          <h2 className="ct-h3">{t.setStatusTitle.replace("{name}", nameOf(stand.invite))}</h2>
          <p className="ct-help mt-2">{t.setStatusLead}</p>
          <div className="mt-4 flex flex-col gap-4">
            <Field label={t.fieldStatus} htmlFor="se-status">
              <Select
                id="se-status"
                value={stand.status}
                onChange={(e) => setStand({ ...stand, status: e.target.value as InviteStatus })}
                options={(["invited", "yes", "no"] as const).map((s) => ({ value: s, label: t[`status_${s}`] }))}
              />
            </Field>
            {stand.status === "yes" && (
              <Field label={t.fieldGuests} htmlFor="se-guests" hint={t.fieldGuestsHint}>
                <Input
                  id="se-guests"
                  type="number"
                  min={0}
                  max={3}
                  value={stand.guests}
                  onChange={(e) => setStand({ ...stand, guests: e.target.value })}
                />
              </Field>
            )}
            <Field label={t.fieldNote} htmlFor="se-note" hint={t.fieldNoteHint}>
              <Textarea id="se-note" rows={2} maxLength={500} value={stand.note} onChange={(e) => setStand({ ...stand, note: e.target.value })} />
            </Field>
          </div>
          <ModalFuss>
            <Button type="button" onClick={standSpeichern} loading={pending}>
              {common.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStand(null)}>
              {common.cancel}
            </Button>
          </ModalFuss>
        </Modal>
      )}

      {askRemind && (
        <ConfirmDialog
          title={t.resendAllTitle}
          body={t.resendAllBody.replace("{n}", String(ohneAntwort.length))}
          confirmLabel={t.resendAll}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskRemind(false)}
          onConfirm={() => einladen(ohneAntwort.map((i) => i.profile_id), true)}
        />
      )}

      {askDelete && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody}
          detail={<p className="ct-label">{askDelete.title_de}</p>}
          confirmLabel={t.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskDelete(null)}
          onConfirm={() => loeschen(askDelete)}
        />
      )}
    </div>
  );
}
