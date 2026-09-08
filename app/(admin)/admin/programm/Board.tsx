"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDay, formatMinutes, minutesOfDay, parseClock, zonedTimeToInstant } from "@/lib/tz";
import {
  dayWindow,
  hourMarks as hourMarksIn,
  minutesFromOffset,
  resizedEnd,
  slotBox,
  PX_PER_MIN,
} from "./geometry";
import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  createSlot,
  moveSlot,
  type ActionResult,
} from "./actions";
import { SessionDrawer } from "./SessionDrawer";
import {
  SLOT_STATUS_ORDER,
  SLOT_STATUS_STYLE,
  type BacklogSession,
  type BoardDay,
  type BoardLabels,
  type BoardSlot,
  type BoardStage,
  speakerName,
} from "./types";

export type ProgrammeStrings = Record<string, string>;

type Stats = {
  stage_id: string;
  slot_quota: number | null;
  slots_used: number;
  slots_available: number | null;
};

export function Board({
  events,
  currentEventId,
  currentEventSlug,
  timezone,
  days,
  currentDayId,
  stages,
  slots,
  backlog,
  stats,
  labels,
  locale,
  t,
  rpcMessages,
}: {
  events: { id: string; slug: string; name: string }[];
  currentEventId: string;
  currentEventSlug: string;
  timezone: string;
  days: BoardDay[];
  currentDayId: string | null;
  stages: BoardStage[];
  slots: BoardSlot[];
  backlog: BacklogSession[];
  stats: Stats[];
  labels: BoardLabels;
  locale: Locale;
  t: ProgrammeStrings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<
    { kind: "slot"; slot: BoardSlot } | { kind: "backlog"; session: BacklogSession } | null
  >(null);
  const [editing, setEditing] = useState<
    { sessionId: string | null; slotId: string | null } | null
  >(null);
  const [confirmMove, setConfirmMove] = useState<Parameters<typeof moveSlot>[0] | null>(
    null,
  );
  const gridRef = useRef<HTMLDivElement>(null);

  const day = days.find((d) => d.id === currentDayId) ?? null;
  const dateLocale = locale === "en" ? "en-GB" : "de-DE";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Zeitfenster: Programmzeiten des Tages, sonst aus den Slots, sonst 08–20 Uhr.
  const { start: windowStart, end: windowEnd } = useMemo(
    () =>
      dayWindow(
        slots.map((s) => ({
          startMin: minutesOfDay(s.start_at, timezone),
          endMin: minutesOfDay(s.end_at, timezone),
        })),
        parseClock(day?.programme_start),
        parseClock(day?.programme_end),
      ),
    [day, slots, timezone],
  );

  const gridHeight = (windowEnd - windowStart) * PX_PER_MIN;

  const statsByStage = useMemo(
    () => new Map(stats.map((s) => [s.stage_id, s])),
    [stats],
  );
  const slotsByStage = useMemo(() => {
    const m = new Map<string, BoardSlot[]>();
    for (const s of slots) (m.get(s.stage_id) ?? m.set(s.stage_id, []).get(s.stage_id)!).push(s);
    return m;
  }, [slots]);

  // Die Tabellen `slot`/`session` stehen nicht in der Realtime-Publikation, also
  // gibt es keine Postgres-Änderungen zum Abonnieren (das wäre eine Migration).
  // Stattdessen ein Broadcast-Kanal je Tag: wer etwas ändert, sagt Bescheid,
  // die anderen Tabs laden neu.
  const channelName = `programme-board:${currentDayId ?? "none"}`;
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "changed" }, () => router.refresh())
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [channelName, router]);

  const notifyPeers = useCallback(() => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "changed",
      payload: {},
    });
  }, []);

  const message = useCallback(
    (key: string, fallback?: string) => rpcMessages[key] ?? fallback ?? key,
    [rpcMessages],
  );

  const handle = useCallback(
    (res: ActionResult<unknown>, onOk?: () => void) => {
      if (res.ok) {
        notifyPeers();
        router.refresh();
        onOk?.();
        return true;
      }
      toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
      return false;
    },
    [message, notifyPeers, router, toast],
  );

  const runMove = useCallback(
    (input: Parameters<typeof moveSlot>[0]) => {
      startTransition(async () => {
        const res = await moveSlot(input);
        if (!res.ok) {
          if (res.key === "confirmation_required") {
            setConfirmMove(input);
            return;
          }
          toast("error", message(res.key));
          return;
        }
        setConfirmMove(null);
        const warnings = res.data.warnings;
        if (warnings.length > 0) {
          toast("info", warnings.map((w) => message(w)).join(" · "));
        } else {
          toast("success", t.moved);
        }
        notifyPeers();
        router.refresh();
      });
    },
    [message, notifyPeers, router, t.moved, toast],
  );

  /** Minute aus der Y-Position des losgelassenen Elements in der Spalte. */
  const minutesFromDrop = useCallback(
    (event: DragEndEvent): number | null => {
      const overRect = event.over?.rect;
      const activeRect = event.active.rect.current.translated;
      if (!overRect || !activeRect) return null;
      return minutesFromOffset(activeRect.top - overRect.top, windowStart, windowEnd);
    },
    [windowEnd, windowStart],
  );

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { kind: "slot"; slot: BoardSlot }
      | { kind: "backlog"; session: BacklogSession }
      | undefined;
    setDragging(data ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const overId = String(event.over?.id ?? "");
    if (!overId.startsWith("stage:") || !day) return;
    const stageId = overId.slice("stage:".length);
    const startMin = minutesFromDrop(event);
    if (startMin === null) return;

    const data = event.active.data.current as
      | { kind: "slot"; slot: BoardSlot }
      | { kind: "backlog"; session: BacklogSession }
      | undefined;
    if (!data) return;

    if (data.kind === "slot") {
      const slot = data.slot;
      const duration =
        minutesOfDay(slot.end_at, timezone) - minutesOfDay(slot.start_at, timezone);
      if (
        stageId === slot.stage_id &&
        startMin === minutesOfDay(slot.start_at, timezone)
      ) {
        return; // nichts bewegt
      }
      runMove({
        slotId: slot.slot_id,
        stageId,
        startAt: zonedTimeToInstant(day.day_date, startMin, timezone).toISOString(),
        endAt: zonedTimeToInstant(
          day.day_date,
          startMin + duration,
          timezone,
        ).toISOString(),
      });
      return;
    }

    const stage = stages.find((s) => s.id === stageId);
    const duration = stage?.default_duration_min || 30;
    startTransition(async () => {
      const res = await createSlot({
        stageId,
        startAt: zonedTimeToInstant(day.day_date, startMin, timezone).toISOString(),
        endAt: zonedTimeToInstant(
          day.day_date,
          startMin + duration,
          timezone,
        ).toISOString(),
        sessionId: data.session.session_id,
      });
      if (handle(res)) toast("success", t.placed);
    });
  }

  /** Ziehen am unteren Rand ändert die Dauer. */
  const resize = useCallback(
    (slot: BoardSlot, deltaPx: number) => {
      if (!day) return;
      const startMin = minutesOfDay(slot.start_at, timezone);
      const endMin = minutesOfDay(slot.end_at, timezone);
      const next = resizedEnd(startMin, endMin, deltaPx);
      if (next === endMin) return;
      runMove({
        slotId: slot.slot_id,
        stageId: slot.stage_id,
        startAt: slot.start_at,
        endAt: zonedTimeToInstant(day.day_date, next, timezone).toISOString(),
      });
    },
    [day, runMove, timezone],
  );

  /** Doppelklick auf freie Fläche legt einen leeren Slot an. */
  function onColumnDoubleClick(stage: BoardStage, e: React.MouseEvent<HTMLDivElement>) {
    if (!day) return;
    if ((e.target as HTMLElement).closest("[data-slot-card]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startMin = minutesFromOffset(e.clientY - rect.top, windowStart, windowEnd);
    const duration = stage.default_duration_min || 30;
    startTransition(async () => {
      const res = await createSlot({
        stageId: stage.id,
        startAt: zonedTimeToInstant(day.day_date, startMin, timezone).toISOString(),
        endAt: zonedTimeToInstant(day.day_date, startMin + duration, timezone).toISOString(),
      });
      if (handle(res)) toast("success", t.slotCreated);
    });
  }

  const hourMarks = useMemo(
    () => hourMarksIn(windowStart, windowEnd),
    [windowEnd, windowStart],
  );

  if (days.length === 0) {
    return <EmptyState title={t.noDayTitle} description={t.noDayBody} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Event- und Tagwahl */}
      <div className="flex flex-wrap items-center gap-2">
        {events.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={t.event}>
            {events.map((e) => (
              <a
                key={e.id}
                href={`/admin/programm?event=${e.slug}`}
                aria-current={e.id === currentEventId ? "page" : undefined}
                className={cn(
                  "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold",
                  e.id === currentEventId
                    ? "bg-accent-soft text-accent-deep"
                    : "text-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                {e.name}
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1" role="group" aria-label={t.day}>
          {days.map((d) => (
            <a
              key={d.id}
              href={`/admin/programm?event=${currentEventSlug}&tag=${d.day_date}`}
              aria-current={d.id === currentDayId ? "page" : undefined}
              className={cn(
                "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold",
                d.id === currentDayId
                  ? "bg-accent-soft text-accent-deep"
                  : "text-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              {(locale === "en" ? d.label_en : d.label_de) ?? formatDay(d.day_date, dateLocale)}
            </a>
          ))}
        </div>
        <span className="ml-auto ct-help">{t.hint}</span>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {/* Backlog */}
        <section
          aria-label={t.backlog}
          className="rounded-ct-lg border bg-surface p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="ct-eyebrow text-muted">
              {t.backlog} ({backlog.length})
            </h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing({ sessionId: null, slotId: null })}
            >
              {t.newSession}
            </Button>
          </div>
          {backlog.length === 0 ? (
            <p className="ct-help">{t.backlogEmpty}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {backlog.map((s) => (
                <BacklogChip
                  key={s.session_id}
                  session={s}
                  labels={labels}
                  locale={locale}
                  onOpen={() => setEditing({ sessionId: s.session_id, slotId: null })}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Board */}
        <div className="overflow-x-auto rounded-ct-lg border bg-surface">
          <div className="min-w-[900px]">
            {/* Kopfzeile */}
            <div
              className="grid border-b bg-surface"
              style={{ gridTemplateColumns: `64px repeat(${stages.length}, minmax(180px, 1fr))` }}
            >
              <div />
              {stages.map((s) => {
                const st = statsByStage.get(s.id);
                return (
                  <div key={s.id} className="border-l px-3 py-2">
                    <div className="ct-label text-ink">{s.name}</div>
                    <div className="ct-help">
                      {st
                        ? `${st.slots_used}${st.slot_quota ? ` / ${st.slot_quota}` : ""} ${t.slotsUsed}`
                        : `0 ${t.slotsUsed}`}
                      {s.changeover_min > 0 && ` · ${t.changeover} ${s.changeover_min}′`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Raster */}
            <div
              ref={gridRef}
              className="relative grid"
              style={{
                gridTemplateColumns: `64px repeat(${stages.length}, minmax(180px, 1fr))`,
                height: gridHeight,
              }}
            >
              {/* Stundenachse */}
              <div className="relative">
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="absolute right-2 -translate-y-1/2 text-[12px] tabular-nums text-muted"
                    style={{ top: (m - windowStart) * PX_PER_MIN }}
                  >
                    {formatMinutes(m)}
                  </div>
                ))}
              </div>

              {stages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  windowStart={windowStart}
                  hourMarks={hourMarks}
                  onDoubleClick={(e) => onColumnDoubleClick(stage, e)}
                >
                  {(slotsByStage.get(stage.id) ?? []).map((slot) => (
                    <SlotCard
                      key={slot.slot_id}
                      slot={slot}
                      timezone={timezone}
                      windowStart={windowStart}
                      labels={labels}
                      locale={locale}
                      t={t}
                      onOpen={() =>
                        setEditing({ sessionId: slot.session_id, slotId: slot.slot_id })
                      }
                      onResize={(delta) => resize(slot, delta)}
                    />
                  ))}
                </StageColumn>
              ))}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging?.kind === "slot" && (
            <div className="rounded-ct-md border border-accent bg-accent-soft px-2 py-1 text-[13px] font-semibold text-accent-deep shadow">
              {dragging.slot.title_de ?? t.untitled}
            </div>
          )}
          {dragging?.kind === "backlog" && (
            <div className="rounded-ct-md border border-accent bg-accent-soft px-2 py-1 text-[13px] font-semibold text-accent-deep shadow">
              {dragging.session.title_de ?? t.untitled}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Legende */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="ct-eyebrow text-muted">{t.legend}</span>
        {SLOT_STATUS_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[13px]">
            <span
              className={cn("inline-block size-3 rounded-sm border", SLOT_STATUS_STYLE[s])}
            />
            {labels.slotStatus[s]}
          </span>
        ))}
        {pending && <span className="ct-help ml-auto">{t.saving}</span>}
      </div>

      {/* Bestätigung: veröffentlichter Slot wird verschoben */}
      {confirmMove && (
        <ConfirmDialog
          title={t.confirmMoveTitle}
          body={t.confirmMoveBody}
          confirmLabel={t.confirmMoveAction}
          cancelLabel={t.cancel}
          onCancel={() => setConfirmMove(null)}
          onConfirm={() => runMove({ ...confirmMove, confirm: true })}
        />
      )}

      {editing && (
        <SessionDrawer
          key={editing.sessionId ?? `new:${editing.slotId ?? "backlog"}`}
          open
          eventId={currentEventId}
          sessionId={editing.sessionId}
          slotId={editing.slotId}
          labels={labels}
          locale={locale}
          t={t}
          rpcMessages={rpcMessages}
          onClose={() => setEditing(null)}
          onChanged={() => {
            notifyPeers();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StageColumn({
  stage,
  windowStart,
  hourMarks,
  onDoubleClick,
  children,
}: {
  stage: BoardStage;
  windowStart: number;
  hourMarks: number[];
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  return (
    <div
      ref={setNodeRef}
      onDoubleClick={onDoubleClick}
      className={cn("relative border-l", isOver && "bg-accent-soft/40")}
    >
      {hourMarks.map((m) => (
        <div
          key={m}
          className="pointer-events-none absolute inset-x-0 border-t border-border/60"
          style={{ top: (m - windowStart) * PX_PER_MIN }}
        />
      ))}
      {children}
    </div>
  );
}

function SlotCard({
  slot,
  timezone,
  windowStart,
  labels,
  locale,
  t,
  onOpen,
  onResize,
}: {
  slot: BoardSlot;
  timezone: string;
  windowStart: number;
  labels: BoardLabels;
  locale: Locale;
  t: ProgrammeStrings;
  onOpen: () => void;
  onResize: (deltaPx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: slot.slot_id,
    data: { kind: "slot", slot },
    disabled: !slot.can_edit,
  });

  const startMin = minutesOfDay(slot.start_at, timezone);
  const endMin = minutesOfDay(slot.end_at, timezone);
  const title =
    (locale === "en" ? slot.title_en : slot.title_de) ??
    slot.title_de ??
    slot.title_en ??
    (slot.session_id ? t.untitled : labels.slotType[slot.slot_type]);

  const [resizing, setResizing] = useState(false);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    setResizing(true);
    const move = () => {};
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      onResize(ev.clientY - startY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={setNodeRef}
      data-slot-card
      style={slotBox(startMin, endMin, windowStart)}
      className={cn(
        "absolute inset-x-1 overflow-hidden rounded-ct-sm border text-[13px]",
        SLOT_STATUS_STYLE[slot.slot_status] ?? SLOT_STATUS_STYLE.open,
        isDragging && "opacity-40",
        resizing && "ring-2 ring-accent",
        slot.can_edit ? "cursor-grab" : "cursor-default",
      )}
    >
      <div
        {...(slot.can_edit ? listeners : {})}
        {...attributes}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="h-full px-2 py-1 text-left"
      >
        <div className="flex items-center gap-1 tabular-nums text-muted">
          {formatMinutes(startMin)}–{formatMinutes(endMin)}
          {slot.publish_status === "published" && (
            <span aria-label={labels.publishStatus.published} title={labels.publishStatus.published}>
              ●
            </span>
          )}
        </div>
        <div className="truncate font-semibold text-ink">{title}</div>
        {slot.speakers && slot.speakers.length > 0 && (
          <div className="truncate text-muted">
            {slot.speakers.map(speakerName).join(", ")}
          </div>
        )}
      </div>
      {slot.can_edit && (
        <div
          onPointerDown={startResize}
          role="separator"
          aria-label={t.resize}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize bg-transparent hover:bg-accent/30"
        />
      )}
    </div>
  );
}

function BacklogChip({
  session,
  labels,
  locale,
  onOpen,
}: {
  session: BacklogSession;
  labels: BoardLabels;
  locale: Locale;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `backlog:${session.session_id}`,
    data: { kind: "backlog", session },
    disabled: !session.can_edit,
  });
  const title =
    (locale === "en" ? session.title_en : session.title_de) ??
    session.title_de ??
    session.title_en ??
    "—";

  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <span
        {...(session.can_edit ? listeners : {})}
        {...attributes}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-ct-md border px-2.5 py-1.5 text-[13px]",
          session.can_edit ? "cursor-grab bg-surface hover:bg-surface-hover" : "bg-surface-hover",
        )}
      >
        <span className="font-semibold text-ink">{title}</span>
        {session.format && <Badge>{labels.format[session.format] ?? session.format}</Badge>}
      </span>
    </li>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onCancel}
      className="max-w-[420px] rounded-ct-lg border bg-surface p-6 text-ink backdrop:bg-navy/40"
    >
      <h2 className="ct-h3">{title}</h2>
      <p className="ct-help mt-2">{body}</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </dialog>
  );
}
