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
  searchPeople,
  setSessionSpeakers,
  setSlotStatus,
  unpublishSession,
  upsertSession,
  type ActionResult,
  type CatalogQuestion,
  type SessionDetail,
} from "./actions";
import { SLOT_STATUS_ORDER, speakerName, type BoardLabels, type SessionSpeaker } from "./types";
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
};

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
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [catalog, setCatalog] = useState<CatalogQuestion[]>([]);
  const [picked, setPicked] = useState<{ question_id: string; required: boolean }[]>([]);
  // Der Drawer wird je Session über `key` neu montiert — deshalb reicht der
  // Initialwert, und der Effekt unten lädt nur nach.
  const [id, setId] = useState<string | null>(sessionId);

  const message = (key: string) => rpcMessages[key] ?? key;

  function report(res: ActionResult<unknown>, okText: string): boolean {
    if (res.ok) {
      toast("success", okText);
      onChanged();
      return true;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
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
      });
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
      searchPeople(term).then(setHits);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function save() {
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
      });
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      const newId = res.data.sessionId;
      setId(newId);
      // Neu angelegt und aus einem leeren Slot heraus geöffnet: gleich anhängen.
      if (!id && slotId) {
        const attached = await attachSession(newId, slotId);
        if (!attached.ok) toast("error", message(attached.key));
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
          <Button onClick={save} loading={pending}>
            {t.save}
          </Button>
          {id && !isPublished && (
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
          {id && isPublished && (
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
        {detail && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isPublished ? "success" : "neutral"}>
              {labels.publishStatus[detail.publish_status ?? "draft"]}
            </Badge>
            {!detail.slot_id && <Badge tone="warning">{t.inBacklog}</Badge>}
          </div>
        )}

        <Field label={t.titleDe} htmlFor="title_de" required requiredLabel={t.required}>
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

        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <input
            type="checkbox"
            checked={draft.ticket_required}
            onChange={(e) => set("ticket_required", e.target.checked)}
            className="size-4"
          />
          {t.ticketRequired}
        </label>

        {/* Speaker */}
        <section className="border-t pt-4">
          <h3 className="ct-h3 mb-2">{t.speakers}</h3>
          {speakers.length === 0 ? (
            <p className="ct-help">{t.noSpeakers}</p>
          ) : (
            <ul className="mb-3 flex flex-wrap gap-2">
              {speakers.map((s) => (
                <li key={s.person_id}>
                  <span className="inline-flex items-center gap-2 rounded-ct-md border bg-surface px-2.5 py-1.5 text-[14px]">
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
          <Field label={t.addSpeaker} htmlFor="speaker_search" hint={t.addSpeakerHint}>
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
                    className="w-full rounded-ct-sm px-2 py-1 text-left text-[14px] hover:bg-surface-hover"
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
                            const next = e.target.checked
                              ? [...picked, { question_id: q.id, required: false }]
                              : picked.filter((p) => p.question_id !== q.id);
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
                        <label className="mt-2 flex items-center gap-2 pl-7 text-[13px]">
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

        {/* Slot-Status */}
        {slotId && (
          <section className="border-t pt-4">
            <h3 className="ct-h3 mb-2">{t.slotStatus}</h3>
            <div className="flex flex-wrap gap-2">
              {SLOT_STATUS_ORDER.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () =>
                      void report(await setSlotStatus(slotId, s), t.statusSaved),
                    )
                  }
                >
                  {labels.slotStatus[s]}
                </Button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Drawer>
  );
}
