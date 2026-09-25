"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { attachSession, createSlot, moveSlot, upsertSession } from "@/components/programme/actions";
import {
  PARTNER_STATUS_TON,
  fehlendAusDetail,
  fehlendFuerFreigabe,
  fensterText,
  imFenster,
  partnerStatus,
  type FehlendesFeld,
  type StandFenster,
} from "@/components/partner/standbuehne";
import { formatMinutes, minutesOfDay, parseClock, zonedTimeToInstant } from "@/lib/tz";
import { GastZuordnung } from "@/components/partner/GastZuordnung";
import type { GastWahl } from "@/components/partner/gaeste";
import { RueckgabeHinweis, type RueckgabeTexte } from "../Rueckgabe";
import { assignStageGuest, requestStagePublish, withdrawStagePublish } from "../actions";

/** Ein Slot der eigenen Standbühne, wie ihn die Seite aus `programme_board` und `session` zusammenstellt. */
export type StandZeile = {
  slot_id: string;
  stage_id: string;
  event_day_id: string;
  day_date: string;
  start_at: string;
  end_at: string;
  session_id: string | null;
  title_de: string | null;
  title_en: string | null;
  description_de: string | null;
  description_en: string | null;
  format: string | null;
  publish_status: string | null;
  /** Speaker der Session; Gäste der Organisation lassen sich hier zuordnen (PART-081). */
  speakers: { person_id: string; name: string }[];
  return_note: string | null;
  returned_at: string | null;
  can_edit: boolean;
};

export type StandTag = { id: string; day_date: string; label: string };
/** Gast der eigenen Organisation (`partner_stage_guests`), zur Auswahl in den Details. */
export type StandGast = GastWahl;
export type StandBuehne = { id: string; name: string; default_duration_min: number };

type Texte = Record<string, string>;
type Ergebnis = { ok: true } | { ok: false; key: string; detail?: string };

/** Für neue Sessions aus der Tabelle; im Kalender wählt man das Format im Drawer. */
const FORMAT_NEU = "talk";

const fensterSchluessel = (stageId: string, dayId: string) => `${stageId}|${dayId}`;

/**
 * Die Standbühne als Tabelle (PART-078, Vorbild Airtable): alle Slots der
 * eigenen Bühne über alle Tage, Zeit, Titel und Format direkt in der Zeile,
 * Beschreibung beim Aufklappen, darunter „Slot anlegen“. Das Kalender-Board
 * bleibt die zweite Sicht auf dieselben Daten.
 *
 * Geschrieben wird über dieselben RPCs wie im Board (`create_slot`,
 * `move_slot`, `upsert_session`, `attach_session_to_slot`) — die Datenbank
 * prüft Recht und Zeitfenster (PART-079). Das Fenster wird hier nur gezeigt
 * und vor dem Absenden geprüft, damit niemand erst an der Fehlermeldung
 * merkt, wo die Grenze liegt. Statt des internen Slot-Status steht der
 * Partner-Status da (PART-080); „Veröffentlichen“ ist die Anfrage an die
 * Programmleitung und kommt mit einer Rückfrage.
 */
export function StandTabelle({
  zeilen,
  tage,
  buehnen,
  gaeste,
  fenster,
  eventId,
  hostOrgId,
  timezone,
  dateLocale,
  formatLabels,
  t,
  rueckgabe,
  rpcMessages,
}: {
  zeilen: StandZeile[];
  tage: StandTag[];
  buehnen: StandBuehne[];
  gaeste: StandGast[];
  /** Fenster je Bühne und Tag, Schlüssel `stageId|dayId`. */
  fenster: Record<string, StandFenster>;
  eventId: string;
  hostOrgId: string;
  timezone: string;
  dateLocale: string;
  formatLabels: Record<string, string>;
  t: Texte;
  rueckgabe: RueckgabeTexte;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [offen, setOffen] = useState<string | null>(null);
  const [fehlt, setFehlt] = useState<{ slotId: string; felder: FehlendesFeld[] } | null>(null);
  const [bestaetigen, setBestaetigen] = useState<StandZeile | null>(null);
  // Laufende Neuanlagen je Slot: wer vor dem Neuladen gleich das zweite Feld
  // ausfüllt, schreibt in dieselbe Session statt eine zweite anzulegen.
  const neuAngelegt = useRef(new Map<string, Promise<string | null>>());

  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const fensterVon = (stageId: string, dayId: string) => fenster[fensterSchluessel(stageId, dayId)] ?? null;
  const feldName: Record<FehlendesFeld, string> = {
    title_de: t.fieldTitleDe,
    title_en: t.fieldTitleEn,
    description: t.fieldDescription,
  };

  /** Eine Schreibaktion: Fehler als Toast (Zellen haben kein Formular), danach neu laden. */
  function run(aktion: () => Promise<Ergebnis>, okText: string, onOk?: () => void, onFehler?: () => void) {
    startTransition(async () => {
      const res = await aktion();
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        onFehler?.();
        return;
      }
      toast("success", okText);
      onOk?.();
      router.refresh();
    });
  }

  function speichern(z: StandZeile, felder: { title_de?: string; title_en?: string; format?: string }) {
    run(async () => {
      const sessionId = z.session_id ?? (await neuAngelegt.current.get(z.slot_id)) ?? null;
      if (sessionId) {
        const res = await upsertSession({ id: sessionId, ...felder });
        return res.ok ? { ok: true } : res;
      }
      // Leerer Slot: Session anlegen und gleich anhängen — wie der Drawer im Board.
      let fehler: Ergebnis = { ok: false, key: "unknown" };
      const anlegen = (async () => {
        const neu = await upsertSession({ event_id: eventId, format: FORMAT_NEU, host_org_id: hostOrgId, ...felder });
        if (!neu.ok) {
          fehler = neu;
          return null;
        }
        const dran = await attachSession(neu.data.sessionId, z.slot_id);
        if (!dran.ok) {
          fehler = dran;
          return null;
        }
        return neu.data.sessionId;
      })();
      neuAngelegt.current.set(z.slot_id, anlegen);
      const id = await anlegen;
      if (id) return { ok: true };
      neuAngelegt.current.delete(z.slot_id);
      return fehler;
    }, t.saved);
  }

  function verschieben(z: StandZeile, start: number, ende: number, zuruecksetzen: () => void): boolean {
    if (ende <= start) {
      toast("error", t.endBeforeStart);
      return false;
    }
    const f = fensterVon(z.stage_id, z.event_day_id);
    if (f && !imFenster(f, start, ende)) {
      toast("error", message("outside_partner_window", fensterText(f, t.windowUntil)));
      return false;
    }
    run(async () => {
      const res = await moveSlot({
        slotId: z.slot_id,
        stageId: z.stage_id,
        startAt: zonedTimeToInstant(z.day_date, start, timezone).toISOString(),
        endAt: zonedTimeToInstant(z.day_date, ende, timezone).toISOString(),
      });
      if (!res.ok) return res;
      // Hinweise zum Tagesrahmen sind kein Fehler — wie im Board als Info.
      if (res.data.warnings.length > 0) toast("info", res.data.warnings.map((w) => message(w)).join(" · "));
      return { ok: true };
    }, t.timeSaved, undefined, zuruecksetzen);
    return true;
  }

  function gastZuordnen(z: StandZeile, profileId: string, zuordnen: boolean) {
    run(() => assignStageGuest(z.session_id!, profileId, zuordnen), zuordnen ? t.guestAssigned : t.guestUnassigned);
  }

  function veroeffentlichen(z: StandZeile) {
    const felder = fehlendFuerFreigabe(z);
    if (felder.length > 0) {
      setFehlt({ slotId: z.slot_id, felder });
      setOffen(z.slot_id);
      return;
    }
    setFehlt(null);
    setBestaetigen(z);
  }

  function anfrageSenden(z: StandZeile) {
    startTransition(async () => {
      const res = await requestStagePublish(z.session_id!);
      setBestaetigen(null);
      if (!res.ok) {
        if (res.key === "fields_required") {
          setFehlt({ slotId: z.slot_id, felder: fehlendAusDetail(res.detail) });
          setOffen(z.slot_id);
          return;
        }
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", t.publishDone);
      router.refresh();
    });
  }

  const statusText: Record<string, string> = {
    offen: t.statusOpen,
    in_bearbeitung: t.statusDraft,
    zurueckgegeben: t.statusReturned,
    zur_freigabe: t.statusReview,
    veroeffentlicht: t.statusPublished,
    abgesagt: t.statusCancelled,
  };
  const formatOptionen = Object.entries(formatLabels).map(([value, label]) => ({ value, label }));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="stand-slots">
        <h2 id="stand-slots" className="ct-h2 mb-4 text-ink">
          {t.slotsTitle}
        </h2>
        {zeilen.length === 0 ? (
          <EmptyState title={t.emptyTableTitle} description={t.emptyTableBody} />
        ) : (
          <div className="flex flex-col gap-6">
            {tage
              .filter((tag) => zeilen.some((z) => z.event_day_id === tag.id))
              .map((tag) => {
                const eigene = zeilen.filter((z) => z.event_day_id === tag.id);
                return (
                  <section key={tag.id} aria-labelledby={`stand-tag-${tag.id}`} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 id={`stand-tag-${tag.id}`} className="ct-h3 text-ink">
                        {tag.label}
                      </h3>
                      <span className="ct-help">
                        {(eigene.length === 1 ? t.slotOne : t.slotMany).replace("{n}", String(eigene.length))}
                      </span>
                    </div>
                    <Table>
                      <Thead>
                        <Th>{t.colTime}</Th>
                        <Th>{t.colTitleDe}</Th>
                        <Th>{t.colTitleEn}</Th>
                        <Th>{t.colStatus}</Th>
                        <Th>
                          <span className="sr-only">{t.colActions}</span>
                        </Th>
                      </Thead>
                      <Tbody>
                        {eigene.map((z) => (
                          <Zeile
                            key={z.slot_id}
                            z={z}
                            timezone={timezone}
                            dateLocale={dateLocale}
                            pending={pending}
                            offen={offen === z.slot_id}
                            fehlt={fehlt?.slotId === z.slot_id ? fehlt.felder : []}
                            feldName={feldName}
                            status={partnerStatus({
                              sessionId: z.session_id,
                              publishStatus: z.publish_status,
                              returnNote: z.return_note,
                            })}
                            statusText={statusText}
                            formatOptionen={formatOptionen}
                            formatLabels={formatLabels}
                            t={t}
                            rueckgabe={rueckgabe}
                            onToggle={() => setOffen((id) => (id === z.slot_id ? null : z.slot_id))}
                            onSpeichern={(felder) => speichern(z, felder)}
                            onVerschieben={(start, ende, zuruecksetzen) => verschieben(z, start, ende, zuruecksetzen)}
                            onBeschreibung={(de, en) =>
                              run(
                                async () => {
                                  const res = await upsertSession({ id: z.session_id!, description_de: de, description_en: en });
                                  return res.ok ? { ok: true } : res;
                                },
                                t.saved,
                                () => setFehlt(null),
                              )
                            }
                            gaeste={gaeste}
                            onGast={(profileId, zuordnen) => gastZuordnen(z, profileId, zuordnen)}
                            onVeroeffentlichen={() => veroeffentlichen(z)}
                            onZuruecknehmen={() =>
                              run(async () => {
                                const res = await withdrawStagePublish(z.session_id!);
                                return res.ok ? { ok: true } : res;
                              }, t.withdrawDone)
                            }
                          />
                        ))}
                      </Tbody>
                    </Table>
                  </section>
                );
              })}
          </div>
        )}
      </section>

      <NeuerSlot
        tage={tage}
        buehnen={buehnen}
        zeilen={zeilen}
        fensterVon={fensterVon}
        eventId={eventId}
        hostOrgId={hostOrgId}
        timezone={timezone}
        t={t}
        message={message}
      />

      {bestaetigen && (
        <ConfirmDialog
          title={t.publishConfirmTitle}
          body={t.publishConfirmBody}
          confirmLabel={t.publishConfirm}
          cancelLabel={t.cancel}
          pending={pending}
          onConfirm={() => anfrageSenden(bestaetigen)}
          onCancel={() => setBestaetigen(null)}
        />
      )}
    </div>
  );
}

/**
 * Entwurf eines Feldes, der dem Stand der Datenbank folgt, sobald **dieser**
 * Wert sich ändert. Die Zeile wird nach dem Speichern nicht neu aufgebaut:
 * wer vom deutschen zum englischen Titel springt, tippt weiter, während der
 * deutsche gespeichert wird und die Seite neu lädt.
 */
function useEntwurf(wert: string): [string, (v: string) => void] {
  const [entwurf, setEntwurf] = useState(wert);
  const [basis, setBasis] = useState(wert);
  if (basis !== wert) {
    setBasis(wert);
    setEntwurf(wert);
  }
  return [entwurf, setEntwurf];
}

function Zeile({
  z,
  timezone,
  dateLocale,
  pending,
  offen,
  fehlt,
  feldName,
  status,
  statusText,
  formatOptionen,
  formatLabels,
  t,
  rueckgabe,
  onToggle,
  onSpeichern,
  onVerschieben,
  onBeschreibung,
  gaeste,
  onGast,
  onVeroeffentlichen,
  onZuruecknehmen,
}: {
  z: StandZeile;
  timezone: string;
  dateLocale: string;
  pending: boolean;
  offen: boolean;
  fehlt: FehlendesFeld[];
  feldName: Record<FehlendesFeld, string>;
  status: keyof typeof PARTNER_STATUS_TON;
  statusText: Record<string, string>;
  formatOptionen: { value: string; label: string }[];
  formatLabels: Record<string, string>;
  t: Texte;
  rueckgabe: RueckgabeTexte;
  onToggle: () => void;
  onSpeichern: (felder: { title_de?: string; title_en?: string; format?: string }) => void;
  onVerschieben: (start: number, ende: number, zuruecksetzen: () => void) => boolean;
  onBeschreibung: (de: string, en: string) => void;
  gaeste: StandGast[];
  onGast: (profileId: string, zuordnen: boolean) => void;
  onVeroeffentlichen: () => void;
  onZuruecknehmen: () => void;
}) {
  const startMin = minutesOfDay(z.start_at, timezone);
  const endeMin = minutesOfDay(z.end_at, timezone);
  const [start, setStart] = useEntwurf(formatMinutes(startMin));
  const [ende, setEnde] = useEntwurf(formatMinutes(endeMin));
  const [titelDe, setTitelDe] = useEntwurf(z.title_de ?? "");
  const [titelEn, setTitelEn] = useEntwurf(z.title_en ?? "");
  const [beschreibungDe, setBeschreibungDe] = useEntwurf(z.description_de ?? "");
  const [beschreibungEn, setBeschreibungEn] = useEntwurf(z.description_en ?? "");

  // Nicht an `pending` hängen: sonst würden während jeder Speicherung alle Felder
  // zu Text, und wer schon im nächsten Feld tippt, verlöre den Fokus.
  const bearbeitbar = z.can_edit;
  // Eine veröffentlichte Session verschiebt man bewusst im Kalender — dort fragt
  // das Board nach (`confirmation_required`); in der Zeile bleibt die Zeit Text.
  const zeitBearbeitbar = bearbeitbar && z.publish_status !== "published";
  const zeitText = `${formatMinutes(startMin)}–${formatMinutes(endeMin)}`;
  const detailsId = `stand-details-${z.slot_id}`;

  function zuruecksetzen() {
    setStart(formatMinutes(startMin));
    setEnde(formatMinutes(endeMin));
  }

  function zeitUebernehmen(feld: "start" | "ende") {
    const s = parseClock(start);
    const e = parseClock(ende);
    if (s === null || e === null || (s === startMin && e === endeMin)) {
      zuruecksetzen();
      return;
    }
    // Neuer Beginn verschiebt den Slot, neue Endzeit ändert die Länge.
    const neuEnde = feld === "start" ? s + (endeMin - startMin) : e;
    if (!onVerschieben(s, neuEnde, zuruecksetzen)) {
      zuruecksetzen();
      return;
    }
    if (feld === "start") setEnde(formatMinutes(neuEnde));
  }

  function titelUebernehmen(feld: "title_de" | "title_en", wert: string, vorher: string | null) {
    if (wert.trim() === (vorher ?? "").trim()) return;
    // Ein leerer Slot bekommt erst mit einem Titel eine Session.
    if (!z.session_id && wert.trim() === "") return;
    onSpeichern({ [feld]: wert });
  }

  return (
    <Fragment>
      <Tr controls>
        <Td className="whitespace-nowrap">
          {zeitBearbeitbar ? (
            <div className="flex items-center gap-1">
              <Input
                type="time"
                step={300}
                aria-label={`${t.colStart} ${zeitText}`}
                className="w-28"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                onBlur={() => zeitUebernehmen("start")}
              />
              <span aria-hidden="true" className="text-muted">
                –
              </span>
              <Input
                type="time"
                step={300}
                aria-label={`${t.colEnd} ${zeitText}`}
                className="w-28"
                value={ende}
                onChange={(e) => setEnde(e.target.value)}
                onBlur={() => zeitUebernehmen("ende")}
              />
            </div>
          ) : (
            <span className="tabular-nums text-muted">{zeitText}</span>
          )}
        </Td>
        <Td>
          {bearbeitbar ? (
            <Input
              aria-label={`${t.colTitleDe} ${zeitText}`}
              className="w-full min-w-48"
              placeholder={z.session_id ? undefined : t.titlePlaceholder}
              value={titelDe}
              invalid={fehlt.includes("title_de")}
              onChange={(e) => setTitelDe(e.target.value)}
              onBlur={() => titelUebernehmen("title_de", titelDe, z.title_de)}
            />
          ) : (
            <span className={z.title_de ? "ct-label text-ink" : "text-muted"}>{z.title_de || t.noTitle}</span>
          )}
        </Td>
        <Td>
          {bearbeitbar ? (
            <Input
              aria-label={`${t.colTitleEn} ${zeitText}`}
              className="w-full min-w-48"
              value={titelEn}
              invalid={fehlt.includes("title_en")}
              onChange={(e) => setTitelEn(e.target.value)}
              onBlur={() => titelUebernehmen("title_en", titelEn, z.title_en)}
            />
          ) : (
            <span className={z.title_en ? "text-ink" : "text-muted"}>{z.title_en || "—"}</span>
          )}
        </Td>
        <Td>
          <Badge tone={PARTNER_STATUS_TON[status]} className="whitespace-nowrap">
            {statusText[status]}
          </Badge>
        </Td>
        <Td className="whitespace-nowrap">
          <div className="flex items-center justify-end gap-1">
            {z.can_edit && (status === "in_bearbeitung" || status === "zurueckgegeben") && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={onVeroeffentlichen}>
                {t.publish}
              </Button>
            )}
            {z.can_edit && status === "zur_freigabe" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onZuruecknehmen}>
                {t.withdraw}
              </Button>
            )}
            {z.session_id && (
              <Button size="sm" variant="ghost" aria-expanded={offen} aria-controls={detailsId} onClick={onToggle}>
                {offen ? t.detailsClose : t.details}
              </Button>
            )}
          </div>
        </Td>
      </Tr>
      {offen && z.session_id && (
        <tr id={detailsId} className="border-b bg-canvas">
          <td colSpan={5} className="px-4 py-4">
            <div className="flex max-w-text flex-col gap-4">
              {fehlt.length > 0 && (
                <p role="alert" className="ct-small text-error-ink">
                  {t.missingFields.replace("{fields}", fehlt.map((f) => feldName[f]).join(", "))}
                </p>
              )}
              {status === "zurueckgegeben" && z.return_note && z.returned_at && (
                <RueckgabeHinweis note={z.return_note} returnedAt={z.returned_at} dateLocale={dateLocale} t={rueckgabe} />
              )}
              <Field label={t.colFormat} htmlFor={bearbeitbar ? `${detailsId}-format` : undefined} className="max-w-xs">
                {bearbeitbar ? (
                  <Select
                    id={`${detailsId}-format`}
                    value={z.format ?? ""}
                    options={formatOptionen}
                    onChange={(e) => onSpeichern({ format: e.target.value })}
                  />
                ) : (
                  <span className="text-ink">
                    {formatLabels[z.format ?? ""] ?? "—"}
                  </span>
                )}
              </Field>
              <GastZuordnung
                speakers={z.speakers}
                gaeste={gaeste}
                canEdit={z.can_edit}
                pending={pending}
                t={{
                  label: t.colSpeakers,
                  none: t.noSpeakers,
                  noGuests: t.guestNone,
                  choose: t.guestChoose,
                  add: t.guestAdd,
                  remove: t.guestRemove,
                }}
                onGast={onGast}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t.descriptionDe} htmlFor={`${detailsId}-de`} error={fehlt.includes("description") ? t.descriptionHint : undefined}>
                  <Textarea
                    id={`${detailsId}-de`}
                    rows={5}
                    value={beschreibungDe}
                    disabled={!bearbeitbar}
                    invalid={fehlt.includes("description")}
                    onChange={(e) => setBeschreibungDe(e.target.value)}
                  />
                </Field>
                <Field label={t.descriptionEn} htmlFor={`${detailsId}-en`} hint={fehlt.includes("description") ? undefined : t.descriptionHint}>
                  <Textarea
                    id={`${detailsId}-en`}
                    rows={5}
                    value={beschreibungEn}
                    disabled={!bearbeitbar}
                    invalid={fehlt.includes("description")}
                    onChange={(e) => setBeschreibungEn(e.target.value)}
                  />
                </Field>
              </div>
              {z.can_edit && (
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    disabled={
                      beschreibungDe.trim() === (z.description_de ?? "").trim() &&
                      beschreibungEn.trim() === (z.description_en ?? "").trim()
                    }
                    onClick={() => onBeschreibung(beschreibungDe, beschreibungEn)}
                  >
                    {t.saveDescription}
                  </Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * „Slot anlegen“: Tag, Zeit und — wenn schon bekannt — der Titel. Vorschlag
 * für den Beginn ist das Ende des letzten Slots am Tag oder der Anfang des
 * Fensters; die Länge kommt aus der Bühne (`default_duration_min`).
 */
function NeuerSlot({
  tage,
  buehnen,
  zeilen,
  fensterVon,
  eventId,
  hostOrgId,
  timezone,
  t,
  message,
}: {
  tage: StandTag[];
  buehnen: StandBuehne[];
  zeilen: StandZeile[];
  fensterVon: (stageId: string, dayId: string) => StandFenster | null;
  eventId: string;
  hostOrgId: string;
  timezone: string;
  t: Texte;
  message: (key: string, detail?: string) => string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function vorschlag(dayId: string, stageId: string): { start: string; ende: string } {
    const dauer = buehnen.find((b) => b.id === stageId)?.default_duration_min ?? 30;
    const f = fensterVon(stageId, dayId);
    const letzte = zeilen
      .filter((z) => z.event_day_id === dayId && z.stage_id === stageId)
      .map((z) => minutesOfDay(z.end_at, timezone));
    const beginn = letzte.length > 0 ? Math.max(...letzte) : f?.von ?? null;
    if (beginn === null) return { start: "", ende: "" };
    return { start: formatMinutes(beginn), ende: formatMinutes(beginn + dauer) };
  }

  const ersterTag = tage[0]?.id ?? "";
  const ersteBuehne = buehnen[0]?.id ?? "";
  const [tag, setTag] = useState(ersterTag);
  const [buehne, setBuehne] = useState(ersteBuehne);
  const [zeit, setZeit] = useState(() => vorschlag(ersterTag, ersteBuehne));
  const [titel, setTitel] = useState("");
  const [fehler, setFehler] = useState<{ zeit?: string; server?: string }>({});

  const f = tag && buehne ? fensterVon(buehne, tag) : null;

  function waehlen(neuerTag: string, neueBuehne: string) {
    setTag(neuerTag);
    setBuehne(neueBuehne);
    setZeit(vorschlag(neuerTag, neueBuehne));
    setFehler({});
  }

  function anlegen() {
    const s = parseClock(zeit.start);
    const e = parseClock(zeit.ende);
    const datum = tage.find((x) => x.id === tag)?.day_date;
    if (s === null || e === null || !datum) {
      setFehler({ zeit: t.timeRequired });
      return;
    }
    if (e <= s) {
      setFehler({ zeit: t.endBeforeStart });
      return;
    }
    if (f && !imFenster(f, s, e)) {
      setFehler({ zeit: message("outside_partner_window", fensterText(f, t.windowUntil)) });
      return;
    }
    setFehler({});
    startTransition(async () => {
      const slot = await createSlot({
        stageId: buehne,
        startAt: zonedTimeToInstant(datum, s, timezone).toISOString(),
        endAt: zonedTimeToInstant(datum, e, timezone).toISOString(),
      });
      if (!slot.ok) {
        setFehler({ server: message(slot.key, slot.detail) });
        return;
      }
      if (titel.trim() !== "") {
        const neu = await upsertSession({ event_id: eventId, title_de: titel, format: FORMAT_NEU, host_org_id: hostOrgId });
        const dran = neu.ok ? await attachSession(neu.data.sessionId, slot.data.slotId) : neu;
        if (!dran.ok) {
          // Der Slot steht, nur der Titel fehlt — er lässt sich in der Zeile nachtragen.
          setFehler({ server: `${t.slotWithoutTitle} ${message(dran.key, dran.detail)}` });
          router.refresh();
          return;
        }
      }
      toast("success", t.addDone);
      setTitel("");
      // Nächster Vorschlag schliesst an den eben angelegten Slot an.
      const dauer = buehnen.find((b) => b.id === buehne)?.default_duration_min ?? 30;
      setZeit({ start: formatMinutes(e), ende: formatMinutes(e + dauer) });
      router.refresh();
    });
  }

  if (tage.length === 0 || buehnen.length === 0) return null;

  return (
    <section aria-labelledby="stand-neu">
      <h2 id="stand-neu" className="ct-h2 mb-1 text-ink">
        {t.addTitle}
      </h2>
      <p className="ct-help mb-4">{f ? t.addLead.replace("{fenster}", fensterText(f, t.windowUntil)) : t.windowRule}</p>
      <form
        className="flex max-w-detail flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          anlegen();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.addDay} htmlFor="stand-neu-tag">
            <Select
              id="stand-neu-tag"
              value={tag}
              options={tage.map((x) => ({ value: x.id, label: x.label }))}
              onChange={(ev) => waehlen(ev.target.value, buehne)}
            />
          </Field>
          {buehnen.length > 1 && (
            <Field label={t.addStage} htmlFor="stand-neu-buehne">
              <Select
                id="stand-neu-buehne"
                value={buehne}
                options={buehnen.map((b) => ({ value: b.id, label: b.name }))}
                onChange={(ev) => waehlen(tag, ev.target.value)}
              />
            </Field>
          )}
          <Field label={t.colStart} htmlFor="stand-neu-start">
            <Input
              id="stand-neu-start"
              type="time"
              step={300}
              value={zeit.start}
              invalid={!!fehler.zeit}
              onChange={(ev) => setZeit((z) => ({ ...z, start: ev.target.value }))}
            />
          </Field>
          <Field label={t.colEnd} htmlFor="stand-neu-ende" error={fehler.zeit}>
            <Input
              id="stand-neu-ende"
              type="time"
              step={300}
              value={zeit.ende}
              invalid={!!fehler.zeit}
              onChange={(ev) => setZeit((z) => ({ ...z, ende: ev.target.value }))}
            />
          </Field>
        </div>
        <Field label={t.colTitleDe} htmlFor="stand-neu-titel" hint={t.addTitleHint} className="max-w-form">
          <Input id="stand-neu-titel" value={titel} onChange={(ev) => setTitel(ev.target.value)} />
        </Field>
        {fehler.server && (
          <p role="alert" className="ct-small text-error-ink">
            {fehler.server}
          </p>
        )}
        <div>
          <Button type="submit" loading={pending}>
            {t.addSubmit}
          </Button>
        </div>
      </form>
    </section>
  );
}
