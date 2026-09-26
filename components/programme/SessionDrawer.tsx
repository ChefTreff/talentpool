"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Modal";
import { formatMinutes, parseClock } from "@/lib/tz";
import { Input, Textarea } from "@/components/ui/Input";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  attachSession,
  detachSession,
  loadQuestionCatalog,
  loadSession,
  loadSessionQuestions,
  setSessionQuestions,
  publishSession,
  searchBoardPartners,
  searchBoardPeople,
  setSessionPartner,
  setSessionSpeakers,
  setSlotStatus,
  unpublishSession,
  upsertSession,
  type ActionResult,
  type CatalogQuestion,
  type SessionDetail,
} from "./actions";
import { SLOT_STATUS_ORDER, speakerName, type BoardLabels, type SessionSpeaker } from "./types";
import { SuchAuswahl } from "./SuchAuswahl";
import { fehlerText } from "./fehler";
import { boardPartnerStatus, partnerStatusTexte, type PartnerSicht } from "./partnerSicht";
import type { ProgrammeStrings } from "./Board";
import { GastZuordnung } from "@/components/partner/GastZuordnung";
import type { GastWahl } from "@/components/partner/gaeste";
import {
  PARTNER_STATUS_TON,
  fehlendAusDetail,
  fehlendFuerFreigabe,
  type FehlendesFeld,
} from "@/components/partner/standbuehne";

type Draft = {
  title_de: string;
  title_en: string;
  description_de: string;
  description_en: string;
  format: string;
  language: string;
  access_mode: string;
  capacity: string;
  application_deadline: string;
  confirm_by_hours: string;
  /** Themen aus `session_topic` (LEAD-019). */
  tags: string[];
};

const EMPTY: Draft = {
  title_de: "",
  title_en: "",
  description_de: "",
  description_en: "",
  format: "keynote",
  language: "de",
  access_mode: "open",
  capacity: "",
  application_deadline: "",
  confirm_by_hours: "72",
  tags: [],
};

/** Was der Drawer vom Slot wissen muss, ohne ihn selbst zu laden (LEAD-019). */
export type SlotInfo = {
  /** Die Bühne des Slots — im Admin wählbar (LEAD-044). */
  stageId: string;
  stageName: string;
  /** Tag und Uhrzeit, fertig formatiert. */
  when: string;
  status: string;
  slotType: string;
  /** Beginn und Ende in Minuten seit Mitternacht — für die Zeitfelder (LEAD-018). */
  startMin?: number;
  endMin?: number;
};

/**
 * Freie Start- und Endzeit (LEAD-018, Konrad 24.09.: „45-Minuten-Panel,
 * 20-Minuten-Keynote“). Eigene Komponente mit eigenem Entwurf: das Board gibt
 * über `key` die Zeit des Slots herein, und nach dem Verschieben beginnt der
 * Entwurf neu — ohne Effekt, der Server-Stand in den Zustand kopiert.
 */
function ZeitFelder({
  startMin,
  endMin,
  pending,
  t,
  onApply,
}: {
  startMin: number;
  endMin: number;
  pending: boolean;
  t: ProgrammeStrings;
  onApply: (startMin: number, endMin: number) => void;
}) {
  const [von, setVon] = useState(formatMinutes(startMin));
  const [bis, setBis] = useState(formatMinutes(endMin));
  const a = parseClock(von);
  const b = parseClock(bis);
  const ungueltig = a === null || b === null || b <= a;
  const unveraendert = a === startMin && b === endMin;
  return (
    <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
      <Field label={t.timeStart} htmlFor="slot_von" className="w-32">
        <Input id="slot_von" type="time" step={300} value={von} onChange={(e) => setVon(e.target.value)} />
      </Field>
      <Field label={t.timeEnd} htmlFor="slot_bis" className="w-32">
        <Input id="slot_bis" type="time" step={300} value={bis} onChange={(e) => setBis(e.target.value)} />
      </Field>
      <Button
        variant="secondary"
        disabled={pending || ungueltig || unveraendert}
        onClick={() => a !== null && b !== null && onApply(a, b)}
      >
        {t.timeApply}
      </Button>
      {a !== null && b !== null && b <= a && <p className="ct-help w-full text-error-ink">{t.timeInvalid}</p>}
    </div>
  );
}

/** Speakerliste für `set_session_speakers` — mit Reihenfolge und `confirmed`. */
function speakerPayload(list: SessionSpeaker[]) {
  return list.map((s, i) => ({
    person_id: s.person_id,
    role: s.role ?? "speaker",
    sort_order: i,
    // Ohne `confirmed` müsste die RPC raten; sie behält dann den alten
    // Wert, und die Oberfläche zeigte womöglich einen anderen.
    confirmed: s.confirmed ?? false,
  }));
}

/** Reihenfolge lückenlos halten — `set_session_questions` übernimmt sie 1:1. */
/** Ein zugeordneter Gast als Eintrag der Speakerliste (LEAD-037). */
function gastAlsSpeaker(g: GastWahl): SessionSpeaker {
  const [first, ...rest] = g.name.split(" ");
  return {
    person_id: g.person_id,
    role: "speaker",
    first_name: first ?? g.name,
    last_name: rest.join(" ") || null,
    employer_name: null,
    confirmed: true,
  };
}

function renumber<T>(list: T[]): (T & { sort_order: number })[] {
  return list.map((q, i) => ({ ...q, sort_order: i }));
}

/** `timestamptz` ↔ `datetime-local` (Browserzeit; für eine Frist genau genug). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SessionDrawer({
  open,
  eventId,
  sessionId,
  slotId,
  canPublish = true,
  hostOrgId,
  partnerSicht,
  slotInfo,
  stageOptions,
  onChangeStage,
  onChangeTime,
  labels,
  locale,
  t,
  rpcMessages,
  onClose,
  onChanged,
  onSaved,
}: {
  open: boolean;
  eventId: string;
  sessionId: string | null;
  slotId: string | null;
  /** Veröffentlichen anbieten? Nur das Programm-Team darf es (`publish_session`). */
  canPublish?: boolean;
  /** Gastgebende Org für neu angelegte Sessions (Partner-Bühne). */
  hostOrgId?: string;
  /**
   * Partner-Sicht (LEAD-036/037): Partner-Status statt Slot-Status,
   * „Veröffentlichen“ als Anfrage, Gäste statt Personensuche. Die Suche wäre
   * dort ohnehin leer — `board_search_people` ist Partnern verschlossen.
   * (Nicht zu verwechseln mit `partner` unten: das ist der buchende Partner.)
   */
  partnerSicht?: PartnerSicht;
  /** Bühne, Zeit und Status des Slots — oben sichtbar statt versteckt (LEAD-019). */
  slotInfo?: SlotInfo | null;
  /**
   * Bühnen, zwischen denen der Slot hier getauscht werden darf (LEAD-044) —
   * nur im Admin. Bei Stage Leads und Partnern bleibt die Bühne gesetzt und
   * nur zu lesen: dort gibt es die Liste nicht.
   */
  stageOptions?: { id: string; name: string }[];
  /** Bühne wechseln: das Board verschiebt den Slot (`move_slot`, gleiche Zeit). */
  onChangeStage?: (stageId: string) => void;
  /**
   * Zeit ändern (LEAD-018): das Board verschiebt den Slot auf derselben Bühne.
   * Nur, wo diese Sicht den Slot bearbeiten darf — sonst fehlt die Funktion.
   */
  onChangeTime?: (startMin: number, endMin: number) => void;
  labels: BoardLabels;
  locale: "de" | "en";
  t: ProgrammeStrings;
  rpcMessages: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
  /**
   * Nach dem Speichern: Titel und Session an das Board, damit die Karte den
   * Titel sofort zeigt und nicht erst nach dem Nachladen (LEAD-048).
   */
  onSaved?: (info: { sessionId: string; title_de: string | null; title_en: string | null }) => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [speakers, setSpeakers] = useState<SessionSpeaker[]>([]);
  const [partner, setPartner] = useState<{ id: string; name: string | null } | null>(null);
  // Die Moderation ist ein Eintrag in `session_speaker` mit der Rolle
  // `moderator` — so steht es im Masterplan, und so fliesst sie in die
  // Speakerliste und später nach Swapcard. Die Spalte
  // `session.moderation_person_id`, in die #147 schrieb, liest niemand.
  const moderator = speakers.find((sp) => sp.role === "moderator") ?? null;
  const moderation = moderator
    ? { id: moderator.person_id, name: speakerName(moderator) }
    : null;
  const [status, setStatus] = useState(slotInfo?.status ?? "open");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [catalog, setCatalog] = useState<CatalogQuestion[]>([]);
  const [picked, setPicked] = useState<
    { question_id: string; required: boolean; sort_order: number }[]
  >([]);
  // Der Drawer wird je Session über `key` neu montiert — deshalb reicht der
  // Initialwert, und der Effekt unten lädt nur nach.
  const [id, setId] = useState<string | null>(sessionId);
  // Partner-Sicht: Gäste vor dem ersten Speichern (LEAD-037, wie LEAD-040 für
  // Speaker) — `partner_assign_stage_guest` braucht die Session.
  const [gastPuffer, setGastPuffer] = useState<string[]>([]);
  // Stand nach Anfrage oder Rücknahme, bis das Board neu lädt.
  const [publishLokal, setPublishLokal] = useState<string | null>(null);
  const [anfrageOffen, setAnfrageOffen] = useState(false);
  const [fehltFreigabe, setFehltFreigabe] = useState<FehlendesFeld[]>([]);

  const message = (key: string) => rpcMessages[key] ?? key;

  // Was Swapcard für eine Session braucht (Legacy-Inventar, Planning: Titel und
  // Beschreibung zweisprachig, Zeit, Ort, Speaker, Aussteller, Tracks). Die
  // Übertragung selbst baut EA3; hier steht nur, was noch fehlt, damit es
  // nicht erst beim Export auffällt (LEAD-019, QS-036).
  const OHNE_SPEAKER = new Set(["break", "networking", "reception"]);
  const fehltFuerApp = [
    !draft.title_de.trim() && t.titleDe,
    !draft.title_en.trim() && t.titleEn,
    !draft.description_de.trim() && t.descriptionDe,
    !draft.description_en.trim() && t.descriptionEn,
    !slotId && t.appSlot,
    !OHNE_SPEAKER.has(draft.format) && speakers.length === 0 && t.speakers,
    slotInfo?.slotType === "partner_block" && !partner && !hostOrgId && t.partner,
    draft.tags.length === 0 && t.topics,
  ].filter(Boolean) as string[];

  function report(res: ActionResult<unknown>, okText: string): boolean {
    if (res.ok) {
      toast("success", okText);
      onChanged();
      return true;
    }
    toast("error", fehlerText(message, res));
    return false;
  }

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    loadSession(sessionId).then((d) => {
      if (!alive || !d) return;
      setDetail(d);
      setSpeakers(d.speakers);
      setDraft({
        title_de: d.title_de ?? "",
        title_en: d.title_en ?? "",
        description_de: d.description_de ?? "",
        description_en: d.description_en ?? "",
        format: d.format ?? "keynote",
        language: d.language ?? "de",
        access_mode: d.access_mode ?? "open",
        capacity: d.capacity != null ? String(d.capacity) : "",
        application_deadline: toLocalInput(d.application_deadline),
        confirm_by_hours: d.confirm_by_hours != null ? String(d.confirm_by_hours) : "72",
        tags: d.tags ?? [],
      });
      setPartner(d.refs.partner);
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  useEffect(() => {
    let alive = true;
    loadQuestionCatalog(locale).then((c) => {
      if (alive) setCatalog(c);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    loadSessionQuestions(sessionId).then((q) => {
      if (alive) setPicked(q);
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // Personensuche mit kleiner Verzögerung, damit nicht jeder Tastendruck geht.
  useEffect(() => {
    const handle = setTimeout(() => {
      const term = query.trim();
      if (term.length < 2) {
        setHits([]);
        return;
      }
      searchBoardPeople(eventId, term).then((h) => setHits(h.map(({ id, name }) => ({ id, name }))));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, eventId]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // `session_title_chk` verlangt mindestens einen Titel — ohne ihn antwortet die
  // Datenbank mit 23514. Das fangen wir hier ab, statt es als Fehler zu zeigen.
  //
  // Den Hinweis erst zeigen, wenn der Entwurf steht: beim Öffnen einer
  // bestehenden Session ist er einen Wimpernschlag lang leer, und „ohne Titel
  // nicht speicherbar" wäre da schlicht falsch.
  const titleMissing = draft.title_de.trim() === "";
  // LEAD-043 (Konrad 25.09.): die deutsche Beschreibung ist Pflicht wie der
  // Titel — ohne sie fehlt dem Programm auf Website und in der App der Text.
  const descriptionMissing = draft.description_de.trim() === "";
  const draftLoaded = sessionId === null || detail !== null;

  function save() {
    if (titleMissing || descriptionMissing) return;
    startTransition(async () => {
      const res = await upsertSession({
        ...(id ? { id } : { event_id: eventId }),
        title_de: draft.title_de,
        title_en: draft.title_en,
        description_de: draft.description_de,
        description_en: draft.description_en,
        format: draft.format,
        language: draft.language,
        access_mode: draft.access_mode,
        capacity: draft.capacity,
        // LEAD-041 (Konrad 25.09.): „Ticket erforderlich“ gilt für alle Slots
        // des Summits — das Board zeigt nur noch den Summit (LEAD-014), also
        // steht es hier fest und nicht mehr in der Maske.
        ticket_required: true,
        application_deadline: draft.application_deadline
          ? new Date(draft.application_deadline).toISOString()
          : "",
        confirm_by_hours: draft.confirm_by_hours,
        tags: draft.tags,
        // Nur beim Anlegen auf der Partner-Bühne: `upsert_session` setzt die
        // Gastgeberin nicht von selbst, und ohne sie fände der Partner seine
        // Session später nicht unter „Bewerber" wieder. **Das Partnerfeld im
        // Board schreibt `host_org_id` nicht** — es meint den buchenden
        // Partner und geht unten über `setSessionPartner` (Korrektur zu #147).
        ...(!id && hostOrgId ? { host_org_id: hostOrgId } : {}),
      });
      if (!res.ok) {
        toast("error", fehlerText(message, res));
        return;
      }
      const newId = res.data.sessionId;
      setId(newId);
      // Der **buchende** Partner (`partner_org_id`) hat seinen eigenen
      // Schreibweg — nur wenn er sich geändert hat, und nie auf der
      // Partner-Bühne, wo er feststeht.
      if (!hostOrgId && (partner?.id ?? null) !== (detail?.refs.partner?.id ?? null)) {
        const gesetzt = await setSessionPartner(newId, partner?.id ?? null);
        if (!gesetzt.ok) {
          toast("error", fehlerText(message, gesetzt));
          return;
        }
      }
      // Neu angelegt und aus einem leeren Slot heraus geöffnet: gleich anhängen.
      // Scheitert das, steht die Session im Backlog — das sagt die Meldung,
      // statt danach „Gespeichert“ zu zeigen, als läge sie im Slot (LEAD-048).
      if (!id && slotId) {
        const attached = await attachSession(newId, slotId);
        if (!attached.ok) {
          toast("error", `${t.attachFailed} (${fehlerText(message, attached)})`);
          onChanged();
          return;
        }
      }
      // Gäste, die vor dem ersten Speichern gewählt wurden (LEAD-037) — der
      // Partner-Weg ist `partner_assign_stage_guest`, nicht `set_session_speakers`.
      if (!id && partnerSicht && gastPuffer.length > 0) {
        const zugeordnet: SessionSpeaker[] = [];
        for (const profileId of gastPuffer) {
          const res = await partnerSicht.gastZuordnen(newId, profileId, true);
          if (!res.ok) {
            toast("error", fehlerText(message, res));
            setSpeakers(zugeordnet);
            setGastPuffer([]);
            onChanged();
            return;
          }
          const g = partnerSicht.gaeste.find((x) => x.profile_id === profileId);
          if (g) zugeordnet.push(gastAlsSpeaker(g));
        }
        setSpeakers(zugeordnet);
        setGastPuffer([]);
      }
      // Speaker und Moderation, die vor dem ersten Speichern gewählt wurden
      // (LEAD-040): erst jetzt gibt es die Session, an der sie hängen.
      if (!id && !partnerSicht && speakers.length > 0) {
        const gesetzt = await setSessionSpeakers(newId, speakerPayload(speakers));
        if (!gesetzt.ok) {
          toast("error", fehlerText(message, gesetzt));
          onChanged();
          return;
        }
      }
      toast("success", t.saved);
      // Was für die Anfrage fehlte, ist vielleicht eben ergänzt — die nächste
      // Anfrage prüft neu (LEAD-036).
      setFehltFreigabe([]);
      onSaved?.({
        sessionId: newId,
        title_de: draft.title_de.trim() || null,
        title_en: draft.title_en.trim() || null,
      });
      onChanged();
    });
  }

  function addSpeaker(person: { id: string; name: string }) {
    if (speakers.some((s) => s.person_id === person.id)) return;
    const [first, ...rest] = person.name.split(" ");
    const next: SessionSpeaker[] = [
      ...speakers,
      {
        person_id: person.id,
        role: "speaker",
        first_name: first ?? person.name,
        last_name: rest.join(" ") || null,
        employer_name: null,
        confirmed: false,
      },
    ];
    persistSpeakers(next);
    setQuery("");
    setHits([]);
  }

  function removeSpeaker(personId: string) {
    persistSpeakers(speakers.filter((s) => s.person_id !== personId));
  }

  /**
   * Vor dem ersten Speichern gibt es keine Session, an der ein Speaker hängen
   * könnte — die Auswahl bleibt dann hier stehen und geht mit dem Speichern
   * mit (LEAD-040, Konrad 25.09.: „erst nach dem ersten Speichern — nicht
   * intuitiv“). Danach wird jede Änderung sofort geschrieben.
   */
  function persistSpeakers(next: SessionSpeaker[]) {
    if (!id) {
      setSpeakers(next);
      return;
    }
    startTransition(async () => {
      const res = await setSessionSpeakers(id, speakerPayload(next));
      if (res.ok) setSpeakers(next);
      report(res, t.speakersSaved);
    });
  }

  // ---- Partner-Sicht (LEAD-036/037)
  const publishStatus = publishLokal ?? detail?.publish_status ?? null;
  const partnerStand = partnerSicht
    ? boardPartnerStatus({ session_id: id, publish_status: publishStatus }, partnerSicht.rueckgaben)
    : null;
  const partnerTexte = partnerSicht ? partnerStatusTexte(partnerSicht.t) : null;
  const feldName = (f: FehlendesFeld) =>
    f === "title_de"
      ? partnerSicht?.t.fieldTitleDe
      : f === "title_en"
        ? partnerSicht?.t.fieldTitleEn
        : partnerSicht?.t.fieldDescription;

  /** Erst die Pflichtfelder wie `partner_request_publish`, dann die Warnung. */
  function anfragePruefen() {
    const fehlt = fehlendFuerFreigabe(draft);
    setFehltFreigabe(fehlt);
    if (fehlt.length === 0) setAnfrageOffen(true);
  }

  function anfrageSenden() {
    if (!partnerSicht || !id) return;
    startTransition(async () => {
      const res = await partnerSicht.anfragen(id);
      setAnfrageOffen(false);
      if (!res.ok) {
        if (res.key === "fields_required") {
          setFehltFreigabe(fehlendAusDetail(res.detail));
          return;
        }
        toast("error", fehlerText(message, res));
        return;
      }
      setPublishLokal(res.data.status);
      toast("success", partnerSicht.t.publishDone);
      onChanged();
    });
  }

  function anfrageZuruecknehmen() {
    if (!partnerSicht || !id) return;
    startTransition(async () => {
      const res = await partnerSicht.zuruecknehmen(id);
      if (!res.ok) {
        toast("error", fehlerText(message, res));
        return;
      }
      setPublishLokal(res.data.status);
      toast("success", partnerSicht.t.withdrawDone);
      onChanged();
    });
  }

  function gastWaehlen(profileId: string, zuordnen: boolean) {
    if (!partnerSicht) return;
    if (!id) {
      setGastPuffer((p) => (zuordnen ? [...p, profileId] : p.filter((x) => x !== profileId)));
      return;
    }
    const g = partnerSicht.gaeste.find((x) => x.profile_id === profileId);
    startTransition(async () => {
      const res = await partnerSicht.gastZuordnen(id, profileId, zuordnen);
      if (!res.ok) {
        toast("error", fehlerText(message, res));
        return;
      }
      if (g) {
        setSpeakers((list) =>
          zuordnen
            ? [...list.filter((sp) => sp.person_id !== g.person_id), gastAlsSpeaker(g)]
            : list.filter((sp) => sp.person_id !== g.person_id),
        );
      }
      toast("success", zuordnen ? partnerSicht.t.guestAssigned : partnerSicht.t.guestUnassigned);
      onChanged();
    });
  }

  const isPublished = detail?.publish_status === "published";
  const opt = (map: Record<string, string>) =>
    Object.entries(map).map(([value, label]) => ({ value, label }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      closeLabel={t.close}
      title={id ? t.editSession : t.newSession}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={pending} disabled={titleMissing || descriptionMissing}>
            {t.save}
          </Button>
          {canPublish && id && !isPublished && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  void report(await publishSession(id), t.published),
                )
              }
            >
              {t.publish}
            </Button>
          )}
          {canPublish && id && isPublished && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  void report(await unpublishSession(id), t.unpublished),
                )
              }
            >
              {t.unpublish}
            </Button>
          )}
          {/* Partner-Sicht (LEAD-036): die Anfrage an die Programmleitung — mit
              Warnung, weil die Session nach der Freigabe so ins offizielle
              Programm geht. Zurücknehmen, solange nicht freigegeben ist. */}
          {partnerSicht && id && (partnerStand === "in_bearbeitung" || partnerStand === "zurueckgegeben") && (
            <Button variant="secondary" disabled={pending} onClick={anfragePruefen}>
              {partnerSicht.t.publish}
            </Button>
          )}
          {partnerSicht && id && partnerStand === "zur_freigabe" && (
            <Button variant="ghost" disabled={pending} onClick={anfrageZuruecknehmen}>
              {partnerSicht.t.withdraw}
            </Button>
          )}
          {/* Ohne das Recht steht statt des Knopfes, wer entscheidet. */}
          {!canPublish && !partnerSicht && id && !isPublished && (
            <p className="ct-help self-center">{t.awaitingRelease}</p>
          )}
          {id && detail?.slot_id && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  void report(await detachSession(id), t.detached),
                )
              }
            >
              {t.detach}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Bühne, Zeit und Status oben (LEAD-019). Der Status stand ganz unten
            als fünf gleich aussehende Knöpfe — welcher gilt, sah man nicht.
            Die Bühne ist gesetzt, weil der Slot auf ihr liegt (LEAD-044): bei
            Stage Leads und Partnern nur zu lesen, im Admin wählbar — so lässt
            sich ein Slot einfach zwischen Bühnen tauschen. */}
        {slotId && slotInfo && (
          <div className="grid gap-3 rounded-ct-md border bg-canvas p-3 sm:grid-cols-2">
            {stageOptions && onChangeStage ? (
              <Field label={t.stage} htmlFor="slot_stage" hint={`${slotInfo.when} · ${t.stageChangeHint}`}>
                <Select
                  id="slot_stage"
                  value={slotInfo.stageId}
                  disabled={pending}
                  onChange={(e) => onChangeStage(e.target.value)}
                  options={stageOptions.map((st) => ({ value: st.id, label: st.name }))}
                />
              </Field>
            ) : (
              <div>
                <p className="ct-help">{t.stage}</p>
                <p className="ct-label text-ink">{slotInfo.stageName}</p>
                <p className="ct-help tabular-nums">{slotInfo.when}</p>
              </div>
            )}
            {onChangeTime && slotInfo.startMin !== undefined && slotInfo.endMin !== undefined && (
              <ZeitFelder
                key={`${slotInfo.startMin}-${slotInfo.endMin}`}
                startMin={slotInfo.startMin}
                endMin={slotInfo.endMin}
                pending={pending}
                t={t}
                onApply={onChangeTime}
              />
            )}
            {/* Der interne Slot-Status ist Sprache der Programmleitung (PART-080) —
                in der Partner-Sicht steht der Partner-Status darunter. */}
            {!partnerSicht && (
            <Field label={t.slotStatus} htmlFor="slot_status">
              <Select
                id="slot_status"
                value={status}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.value;
                  const vorher = status;
                  setStatus(next);
                  startTransition(async () => {
                    if (!report(await setSlotStatus(slotId, next), t.statusSaved)) setStatus(vorher);
                  });
                }}
                options={SLOT_STATUS_ORDER.map((st) => ({ value: st, label: labels.slotStatus[st] ?? st }))}
              />
            </Field>
            )}
          </div>
        )}

        {id && fehltFuerApp.length > 0 && (
          <p className="rounded-ct-md border border-warning-soft bg-warning-soft px-3 py-2 ct-small">
            <span className="ct-label">{t.appMissing}</span> {fehltFuerApp.join(" · ")}
          </p>
        )}

        {partnerSicht && partnerStand && partnerTexte ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={PARTNER_STATUS_TON[partnerStand]}>{partnerTexte[partnerStand]}</Badge>
              {detail && !detail.slot_id && <Badge tone="warning">{t.inBacklog}</Badge>}
            </div>
            {partnerStand === "zurueckgegeben" && id && partnerSicht.rueckgaben[id] && (
              <p className="rounded-ct-md border border-warning-soft bg-warning-soft px-3 py-2 ct-small">
                <span className="ct-label">{partnerSicht.t.legendReturned}</span> {partnerSicht.rueckgaben[id]}
              </p>
            )}
            {fehltFreigabe.length > 0 && (
              <p role="alert" className="rounded-ct-md border border-warning-soft bg-warning-soft px-3 py-2 ct-small">
                {partnerSicht.t.missingFields.replace("{fields}", fehltFreigabe.map(feldName).join(", "))}
              </p>
            )}
          </div>
        ) : (
          detail && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={isPublished ? "success" : "neutral"}>
                  {labels.publishStatus[detail.publish_status ?? "draft"]}
                </Badge>
                {!detail.slot_id && <Badge tone="warning">{t.inBacklog}</Badge>}
              </div>
              {/* LEAD-038: was die Programmleitung bei der Rückgabe geschrieben hat —
                  bis zur Veröffentlichung, auch wenn der Partner neu angefragt hat. */}
              {detail.rueckgabe && !isPublished && (
                <p className="rounded-ct-md border border-warning-soft bg-warning-soft px-3 py-2 ct-small">
                  <span className="ct-label">
                    {t.returnedBy
                      .replace("{name}", detail.rueckgabe.returned_by_name ?? "—")
                      .replace(
                        "{date}",
                        new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { dateStyle: "medium" }).format(
                          new Date(detail.rueckgabe.returned_at),
                        ),
                      )}
                  </span>{" "}
                  {detail.rueckgabe.note}
                </p>
              )}
            </div>
          )
        )}

        <Field
          label={t.titleDe}
          htmlFor="title_de"
          required
          requiredLabel={t.required}
          hint={draftLoaded && titleMissing ? t.titleRequired : undefined}
        >
          <Input
            id="title_de"
            value={draft.title_de}
            onChange={(e) => set("title_de", e.target.value)}
          />
        </Field>
        <Field label={t.titleEn} htmlFor="title_en">
          <Input
            id="title_en"
            value={draft.title_en}
            onChange={(e) => set("title_en", e.target.value)}
          />
        </Field>

        {/* Partner-Sicht (LEAD-037): wer auf der Standbühne spricht, sind die
            Gäste der Organisation (PART-081) — dieselbe Auswahl wie in der
            Tabelle. Reguläre Speaker stehen ohne Knopf da, die teilt das
            Programm-Team zu. */}
        {partnerSicht ? (
          <section className="flex flex-col gap-1">
            <GastZuordnung
              speakers={
                id
                  ? speakers
                      .filter((sp) => sp.role !== "moderator")
                      .map((sp) => ({ person_id: sp.person_id, name: speakerName(sp) }))
                  : partnerSicht.gaeste
                      .filter((g) => gastPuffer.includes(g.profile_id))
                      .map((g) => ({ person_id: g.person_id, name: g.name }))
              }
              gaeste={partnerSicht.gaeste}
              canEdit
              pending={pending}
              t={{
                label: t.speakers,
                none: t.noSpeakers,
                noGuests: partnerSicht.t.guestNone,
                choose: partnerSicht.t.guestChoose,
                add: partnerSicht.t.guestAdd,
                remove: partnerSicht.t.guestRemove,
              }}
              onGast={gastWaehlen}
            />
            {!id && gastPuffer.length > 0 && <p className="ct-help">{t.speakersOnSave}</p>}
          </section>
        ) : (
        /* Speaker direkt unter dem Titel (LEAD-047, Konrad 25.09.) — wer auftritt,
            gehört zur ersten Angabe einer Session, nicht ans Ende der Maske. */
        <section aria-labelledby="speaker_titel" className="flex flex-col gap-2">
          <h3 id="speaker_titel" className="ct-label text-ink">{t.speakers}</h3>
          {speakers.every((sp) => sp.role === "moderator") ? (
            <p className="ct-help">{t.noSpeakers}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {speakers.filter((sp) => sp.role !== "moderator").map((s) => (
                <li key={s.person_id}>
                  <span className="inline-flex items-center gap-2 rounded-ct-md border bg-surface px-2.5 py-1.5 ct-small">
                    {speakerName(s)}
                    <button
                      type="button"
                      onClick={() => removeSpeaker(s.person_id)}
                      aria-label={`${t.removeSpeaker}: ${speakerName(s)}`}
                      className="text-muted hover:text-error-ink"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* Vor dem ersten Speichern merkt sich das Feld die Auswahl und
              schreibt sie mit dem Speichern (LEAD-040). */}
          <Field label={t.addSpeaker} htmlFor="speaker_search" hint={id ? t.addSpeakerHint : t.speakersOnSave}>
            <Input
              id="speaker_search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          {hits.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => addSpeaker(h)}
                    className="w-full rounded-ct-sm px-2 py-1 text-left ct-small hover:bg-surface-hover"
                  >
                    {h.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        <Field
          label={t.descriptionDe}
          htmlFor="desc_de"
          required
          requiredLabel={t.required}
          hint={draftLoaded && descriptionMissing ? t.descriptionRequired : undefined}
        >
          <Textarea
            id="desc_de"
            rows={3}
            value={draft.description_de}
            onChange={(e) => set("description_de", e.target.value)}
          />
        </Field>
        <Field label={t.descriptionEn} htmlFor="desc_en">
          <Textarea
            id="desc_en"
            rows={3}
            value={draft.description_en}
            onChange={(e) => set("description_en", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.format} htmlFor="format">
            <Select
              id="format"
              value={draft.format}
              options={opt(labels.format)}
              onChange={(e) => set("format", e.target.value)}
            />
          </Field>
          <Field label={t.language} htmlFor="language">
            <Select
              id="language"
              value={draft.language}
              options={opt(labels.language)}
              onChange={(e) => set("language", e.target.value)}
            />
          </Field>
          <Field label={t.accessMode} htmlFor="access_mode">
            <Select
              id="access_mode"
              value={draft.access_mode}
              options={opt(labels.accessMode)}
              onChange={(e) => set("access_mode", e.target.value)}
            />
          </Field>
          <Field label={t.capacity} htmlFor="capacity" hint={t.capacityHint}>
            <Input
              id="capacity"
              type="number"
              min={1}
              value={draft.capacity}
              onChange={(e) => set("capacity", e.target.value)}
            />
          </Field>
          {draft.access_mode !== "open" && (
            <>
              <Field label={t.deadline} htmlFor="deadline">
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={draft.application_deadline}
                  onChange={(e) => set("application_deadline", e.target.value)}
                />
              </Field>
              <Field label={t.confirmHours} htmlFor="confirm_hours" hint={t.confirmHoursHint}>
                <Input
                  id="confirm_hours"
                  type="number"
                  min={1}
                  value={draft.confirm_by_hours}
                  onChange={(e) => set("confirm_by_hours", e.target.value)}
                />
              </Field>
            </>
          )}
        </div>

        {/* Themen (LEAD-019) als aufklappbare Mehrfachauswahl (LEAD-046, Konrad
            25.09.: die Kacheln nahmen zu viel Platz) — dieselbe Liste wie bei
            der Einreichung (SPK-027), damit Board und Speaker-Portal dieselben
            Wörter benutzen. */}
        {Object.keys(labels.topics).length > 0 && (
          <Field label={t.topics} htmlFor="topics">
            <MehrfachAuswahl
              id="topics"
              options={Object.entries(labels.topics).map(([value, label]) => ({ value, label }))}
              value={draft.tags}
              onChange={(tags) => set("tags", tags)}
              placeholder={t.topicsSearch}
              disabled={pending}
              t={{ remove: t.topicRemove, noHits: t.topicsNoHits }}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Die Moderation setzt das Programm-Team — Partner sehen sie nur
              (die Suche ist ihnen verschlossen, LEAD-037). */}
          {partnerSicht ? (
            moderation && (
              <div>
                <p className="ct-label text-ink">{t.moderation}</p>
                <p className="ct-small">{moderation.name}</p>
              </div>
            )
          ) : (
          <SuchAuswahl
            id="moderation"
            label={t.moderation}
            hint={t.moderationHint}
            value={moderation}
            disabled={pending}
            // LEAD-042: auch Stage Leads der Edition — ohne Speaker-Profil, der
            // Treffer sagt es dazu.
            suchen={(q) =>
              searchBoardPeople(eventId, q, { moderation: true }).then((list) =>
                list.map((h) => (h.stageLead ? { ...h, hint: t.stageLeadHint } : h)),
              )
            }
            onChange={(h) => {
              const ohne = speakers.filter((sp) => sp.role !== "moderator");
              const [first, ...rest] = (h?.name ?? "").split(" ");
              // Wer schon als Speaker dabei ist und nun moderiert, wechselt die
              // Rolle — doppelt eintragen liesse die Datenbank ohnehin nicht zu.
              const next: SessionSpeaker[] = h
                ? [
                    ...ohne.filter((sp) => sp.person_id !== h.id),
                    {
                      person_id: h.id,
                      role: "moderator",
                      first_name: first ?? h.name,
                      last_name: rest.join(" ") || null,
                      employer_name: null,
                      confirmed: false,
                    },
                  ]
                : ohne;
              persistSpeakers(next);
            }}
            t={{ remove: t.remove, noHits: t.noHits }}
          />
          )}
          {/* Auf der Partner-Bühne steht die Gastgeberin fest. */}
          {!hostOrgId && (
            <SuchAuswahl
              id="partner"
              label={t.partner}
              hint={t.partnerHint}
              value={partner}
              disabled={pending}
              suchen={(q) => searchBoardPartners(eventId, q)}
              onChange={(h) => setPartner(h ? { id: h.id, name: h.name } : null)}
              t={{ remove: t.remove, noHits: t.noHits }}
            />
          )}
        </div>
        <p className="ct-help -mt-2">{t.saveToApply}</p>

        {/* Fragen zur Bewerbung */}
        {draft.access_mode === "application" && (
          <section className="border-t pt-4">
            <h3 className="ct-h3 mb-1">{t.questions}</h3>
            <p className="ct-help mb-3">{t.questionsHint}</p>
            {!id ? (
              <p className="ct-help">{t.saveFirst}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {catalog.map((q) => {
                  const active = picked.find((p) => p.question_id === q.id);
                  return (
                    <li key={q.id} className="rounded-ct-md border p-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={Boolean(active)}
                          onChange={(e) => {
                            const next = renumber(
                              e.target.checked
                                ? [...picked, { question_id: q.id, required: false, sort_order: 0 }]
                                : picked.filter((p) => p.question_id !== q.id),
                            );
                            setPicked(next);
                            startTransition(async () =>
                              void report(await setSessionQuestions(id, next), t.questionsSaved),
                            );
                          }}
                        />
                        <span>
                          <span className="ct-label">{q.label}</span>
                          {q.help && <span className="ct-help block">{q.help}</span>}
                        </span>
                      </label>
                      {active && (
                        <label className="mt-2 flex items-center gap-2 pl-7 ct-help">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={active.required}
                            onChange={(e) => {
                              const next = picked.map((p) =>
                                p.question_id === q.id
                                  ? { ...p, required: e.target.checked }
                                  : p,
                              );
                              setPicked(next);
                              startTransition(async () =>
                                void report(await setSessionQuestions(id, next), t.questionsSaved),
                              );
                            }}
                          />
                          {t.questionRequired}
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

      </div>
      {anfrageOffen && partnerSicht && (
        <ConfirmDialog
          title={partnerSicht.t.publishConfirmTitle}
          body={partnerSicht.t.publishConfirmBody}
          confirmLabel={partnerSicht.t.publishConfirm}
          cancelLabel={t.cancel}
          pending={pending}
          onConfirm={anfrageSenden}
          onCancel={() => setAnfrageOffen(false)}
        />
      )}
    </Drawer>
  );
}
