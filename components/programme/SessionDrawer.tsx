"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
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
import type { ProgrammeStrings } from "./Board";

type Draft = {
  title_de: string;
  title_en: string;
  description_de: string;
  description_en: string;
  format: string;
  language: string;
  access_mode: string;
  capacity: string;
  ticket_required: boolean;
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
  ticket_required: true,
  application_deadline: "",
  confirm_by_hours: "72",
  tags: [],
};

/** Was der Drawer vom Slot wissen muss, ohne ihn selbst zu laden (LEAD-019). */
export type SlotInfo = {
  stageName: string;
  /** Tag und Uhrzeit, fertig formatiert. */
  when: string;
  status: string;
  slotType: string;
};

/** Reihenfolge lückenlos halten — `set_session_questions` übernimmt sie 1:1. */
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
  slotInfo,
  labels,
  locale,
  t,
  rpcMessages,
  onClose,
  onChanged,
}: {
  open: boolean;
  eventId: string;
  sessionId: string | null;
  slotId: string | null;
  /** Veröffentlichen anbieten? Nur das Programm-Team darf es (`publish_session`). */
  canPublish?: boolean;
  /** Gastgebende Org für neu angelegte Sessions (Partner-Bühne). */
  hostOrgId?: string;
  /** Bühne, Zeit und Status des Slots — oben sichtbar statt versteckt (LEAD-019). */
  slotInfo?: SlotInfo | null;
  labels: BoardLabels;
  locale: "de" | "en";
  t: ProgrammeStrings;
  rpcMessages: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
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
        ticket_required: d.ticket_required,
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
  const draftLoaded = sessionId === null || detail !== null;

  function save() {
    if (titleMissing) {
      toast("error", t.titleRequired);
      return;
    }
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
        ticket_required: draft.ticket_required,
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
      if (!id && slotId) {
        const attached = await attachSession(newId, slotId);
        if (!attached.ok) toast("error", fehlerText(message, attached));
      }
      toast("success", t.saved);
      onChanged();
    });
  }

  function addSpeaker(person: { id: string; name: string }) {
    if (!id) {
      toast("error", t.saveFirst);
      return;
    }
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

  function persistSpeakers(next: SessionSpeaker[]) {
    if (!id) return;
    startTransition(async () => {
      const res = await setSessionSpeakers(
        id,
        next.map((s, i) => ({
          person_id: s.person_id,
          role: s.role ?? "speaker",
          sort_order: i,
          // Ohne `confirmed` müsste die RPC raten; sie behält dann den alten
          // Wert, und die Oberfläche zeigte womöglich einen anderen.
          confirmed: s.confirmed ?? false,
        })),
      );
      if (res.ok) setSpeakers(next);
      report(res, t.speakersSaved);
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
          <Button onClick={save} loading={pending} disabled={titleMissing}>
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
          {/* Ohne das Recht steht statt des Knopfes, wer entscheidet. */}
          {!canPublish && id && !isPublished && (
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
            Die Bühne ist gesetzt, weil der Slot auf ihr liegt; sie steht hier,
            damit man sieht, worauf man gerade schaut. */}
        {slotId && slotInfo && (
          <div className="grid gap-3 rounded-ct-md border bg-canvas p-3 sm:grid-cols-2">
            <div>
              <p className="ct-help">{t.stage}</p>
              <p className="ct-label text-ink">{slotInfo.stageName}</p>
              <p className="ct-help tabular-nums">{slotInfo.when}</p>
            </div>
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
          </div>
        )}

        {id && fehltFuerApp.length > 0 && (
          <p className="rounded-ct-md border border-warning-soft bg-warning-soft px-3 py-2 ct-small">
            <span className="ct-label">{t.appMissing}</span> {fehltFuerApp.join(" · ")}
          </p>
        )}

        {detail && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isPublished ? "success" : "neutral"}>
              {labels.publishStatus[detail.publish_status ?? "draft"]}
            </Badge>
            {!detail.slot_id && <Badge tone="warning">{t.inBacklog}</Badge>}
          </div>
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
        <Field label={t.descriptionDe} htmlFor="desc_de">
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

        <label className="flex items-center gap-2 ct-label">
          <input
            type="checkbox"
            checked={draft.ticket_required}
            onChange={(e) => set("ticket_required", e.target.checked)}
            className="size-4"
          />
          {t.ticketRequired}
        </label>

        {/* Themen als Mehrfachauswahl (LEAD-019) — dieselbe Liste wie bei der
            Einreichung (SPK-027), damit Board und Speaker-Portal dieselben
            Wörter benutzen. */}
        {Object.keys(labels.topics).length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="ct-label mb-1 text-ink">{t.topics}</legend>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {Object.entries(labels.topics).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 ct-small">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={draft.tags.includes(key)}
                    onChange={(e) =>
                      set(
                        "tags",
                        e.target.checked
                          ? [...draft.tags, key]
                          : draft.tags.filter((k) => k !== key),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SuchAuswahl
            id="moderation"
            label={t.moderation}
            hint={t.moderationHint}
            value={moderation}
            disabled={pending}
            suchen={(q) => searchBoardPeople(eventId, q)}
            onChange={(h) => {
              if (!id) {
                toast("error", t.saveFirst);
                return;
              }
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

        {/* Speaker */}
        <section className="border-t pt-4">
          <h3 className="ct-h3 mb-2">{t.speakers}</h3>
          {speakers.length === 0 ? (
            <p className="ct-help">{t.noSpeakers}</p>
          ) : (
            <ul className="mb-3 flex flex-wrap gap-2">
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
          {/* Ohne gespeicherte Session gibt es nichts, woran ein Speaker hängen
              könnte. Vorher war das Feld dann einfach grau — und das hiess im
              Board „die Suche funktioniert nicht" (LEAD-020). */}
          <Field label={t.addSpeaker} htmlFor="speaker_search" hint={id ? t.addSpeakerHint : t.saveFirst}>
            <Input
              id="speaker_search"
              value={query}
              disabled={!id}
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
    </Drawer>
  );
}
