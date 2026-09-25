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
  type DragMoveEvent,
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
import { fehlerText } from "./fehler";
import { geschlossen, oeffnung, oeffnungText, type BoardStageDay } from "./oeffnung";
import {
  PARTNER_KARTE,
  PARTNER_LEGENDE,
  boardPartnerStatus,
  partnerStatusTexte,
  type PartnerSicht,
} from "./partnerSicht";
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
  basePath,
  canPublish = true,
  editableStageIds,
  hostOrgId,
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
  stageDays = [],
  partner,
  labels,
  locale,
  t,
  rpcMessages,
}: {
  /** Route, unter der das Board hängt — Event- und Tagwahl verlinken dorthin. */
  basePath: string;
  /**
   * Darf hier veröffentlicht werden? Entschieden wird es in `publish_session`;
   * die Oberfläche bietet den Knopf nur an, wo er auch greifen kann.
   */
  canPublish?: boolean;
  /**
   * Welche Bühnen in **dieser Sicht** bearbeitbar sind (LEAD-016).
   *
   * `undefined` heisst: keine Einschränkung durch die Sicht — dann entscheidet
   * allein `can_edit` je Zeile, wie im Admin-Programm.
   *
   * Konrad, 24.09.: er konnte auf jeder Bühne Slots anlegen und verschieben.
   * Die Datenbank war dicht (`create_slot` prüft `can_edit_stage`, `move_slot`
   * die Zielbühne) — er sah alles, **weil er admin ist**. Genau das ist der
   * Fehler: eine Bühnensicht muss der Rolle des Portals folgen, nicht der
   * stärksten Rolle der Person. Wer im Partner-Portal auf seine Bühne schaut,
   * arbeitet dort als Partner, auch wenn er nebenbei Admin ist.
   *
   * Die Liste **verengt** nur. Sie ist keine Rechtegrenze — die steht in den
   * RPCs und bleibt dort.
   */
  editableStageIds?: readonly string[];
  /** Gastgebende Org für neu angelegte Sessions (Partner-Bühne). */
  hostOrgId?: string;
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
  /** Öffnungszeiten der Bühnen am gezeigten Tag (LEAD-033) — `loadBoard` liefert sie. */
  stageDays?: readonly BoardStageDay[];
  /**
   * Partner-Sicht (LEAD-035/036/037), nur aus dem Partner-Portal: die eigenen
   * Bühnen zeigen den Partner-Status, das Schubfach fragt „Veröffentlichen“ an
   * und ordnet Gäste zu. Fremde Bühnen stehen dann ohne internen Status da —
   * die Legende erklärt nur, was der Partner auch deuten soll.
   */
  partner?: PartnerSicht;
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
    {
      sessionId: string | null;
      slotId: string | null;
      /**
       * Ein eben per Doppelklick angelegter Slot (LEAD-021/044): er steht erst
       * nach dem Nachladen in `slots`. Bis dahin zeigt das Schubfach Bühne und
       * Zeit aus diesen Angaben — sonst fehlte die Bühne in der Maske.
       */
      neu?: { stageId: string; startAt: string; endAt: string };
    } | null
  >(null);
  /**
   * Titel, die gerade gespeichert wurden, bis das Board sie vom Server hat
   * (LEAD-048, Konrad 25.09.: „nach dem ersten Speichern erscheint der Titel
   * nicht in der Slot-Vorschau“). Je Slot und nur, solange der Server am Slot
   * noch keine Session meldet — danach gilt, was der Server sagt, auch wenn
   * die Session später wieder abgelöst wird.
   */
  const [vorlaeufig, setVorlaeufig] = useState<
    Record<string, { session_id: string; title_de: string | null; title_en: string | null }>
  >({});
  // Aufräumen beim Wechsel der Server-Daten, im Rendern statt im Effekt
  // (React: „Informationen aus früheren Renderings speichern“).
  const [slotsStand, setSlotsStand] = useState(slots);
  if (slots !== slotsStand) {
    setSlotsStand(slots);
    setVorlaeufig((v) =>
      Object.fromEntries(
        Object.entries(v).filter(([slotId]) =>
          slots.some((sl) => sl.slot_id === slotId && sl.session_id === null),
        ),
      ),
    );
  }
  const [confirmMove, setConfirmMove] = useState<Parameters<typeof moveSlot>[0] | null>(
    null,
  );
  /**
   * LEAD-050 (Konrad 25.09.): beim Ziehen „Wirklich verschieben?“ mit Von →
   * Nach — man verzieht sich schnell. Bei einer veröffentlichten Session steht
   * die Warnung gleich mit darin, statt danach einen zweiten Dialog zu öffnen.
   */
  const [rueckfrage, setRueckfrage] = useState<{
    input: Parameters<typeof moveSlot>[0];
    von: string;
    nach: string;
    veroeffentlicht: boolean;
  } | null>(null);
  /** LEAD-051: wohin die gezogene Karte fiele — Bühne und Zeit, bevor losgelassen wird. */
  const [vorschau, setVorschau] = useState<{ stageId: string; startMin: number; endMin: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const day = days.find((d) => d.id === currentDayId) ?? null;

  /**
   * Darf in dieser Sicht auf dieser Bühne gearbeitet werden?
   *
   * Eine Stelle, vier Verwendungen: Karte ziehbar, Spalte als Ziel, Doppelklick
   * legt an, Kopfzeile beschriftet. Vier eigene Vergleiche wären vier Stellen,
   * an denen die Sicht auseinanderläuft.
   */
  const bearbeitbar = useCallback(
    (stageId: string) => !editableStageIds || editableStageIds.includes(stageId),
    [editableStageIds],
  );

  /**
   * Die eigene Bühne einer Bühnen-Sicht (LEAD-015). Im Admin gibt es keine —
   * dort ist jede Bühne bearbeitbar, und keine steht vor den anderen.
   */
  const eigen = useCallback(
    (stageId: string) => editableStageIds !== undefined && editableStageIds.includes(stageId),
    [editableStageIds],
  );

  /**
   * Konrad, 24.09.: „Die eigene Bühne ist nicht zu erkennen.“ Sie steht deshalb
   * immer ganz links und doppelt so breit; die anderen folgen in ihrer
   * Reihenfolge und bleiben sichtbar — man plant um sie herum.
   */
  const spalten = useMemo(
    () => [...stages.filter((s) => eigen(s.id)), ...stages.filter((s) => !eigen(s.id))],
    [eigen, stages],
  );
  const rasterSpalten = `64px ${spalten
    .map((s) => (eigen(s.id) ? "minmax(360px, 2fr)" : "minmax(180px, 1fr)"))
    .join(" ")}`;
  // Mindestbreite aus denselben Zahlen: sonst ragen die Spalten über das Raster
  // hinaus, und Kopfzeile wie Hintergrund enden vor der letzten Bühne.
  const rasterBreite = Math.max(
    900,
    64 + spalten.reduce((summe, s) => summe + (eigen(s.id) ? 360 : 180), 0),
  );
  const aktuellesEvent = events.find((e) => e.id === currentEventId) ?? null;
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

  // LEAD-033: Öffnungszeiten je Bühne und was davon im Raster geschlossen ist.
  const oeffnungen = useMemo(
    () => new Map(stages.map((s) => [s.id, oeffnung(s, stageDays, day)])),
    [day, stageDays, stages],
  );
  const zuJeBuehne = useMemo(
    () =>
      new Map(
        stages.map((s) => [s.id, geschlossen(oeffnungen.get(s.id) ?? null, windowStart, windowEnd)]),
      ),
    [oeffnungen, stages, windowEnd, windowStart],
  );
  const irgendwoZu = [...zuJeBuehne.values()].some((z) => z.length > 0);

  // LEAD-035: in der Partner-Sicht spricht die Karte die Sprache des Partners.
  const statusTexte = partner ? partnerStatusTexte(partner.t) : null;
  const kartenStil = (slot: BoardSlot): { stil: string; stand?: string } => {
    if (!partner || !statusTexte) {
      return { stil: SLOT_STATUS_STYLE[slot.slot_status] ?? SLOT_STATUS_STYLE.open };
    }
    // Fremde Bühnen: belegt, aber ohne den Status der Programmleitung.
    if (!eigen(slot.stage_id)) return { stil: SLOT_STATUS_STYLE.open };
    const stand = boardPartnerStatus(slot, partner.rueckgaben);
    return { stil: PARTNER_KARTE[stand], stand: statusTexte[stand] };
  };

  const statsByStage = useMemo(
    () => new Map(stats.map((s) => [s.stage_id, s])),
    [stats],
  );
  const slotsByStage = useMemo(() => {
    const m = new Map<string, BoardSlot[]>();
    for (const s of slots) (m.get(s.stage_id) ?? m.set(s.stage_id, []).get(s.stage_id)!).push(s);
    return m;
  }, [slots]);

  // Realtime je Event, nicht je Tag: eine Verschiebung kann den Tag wechseln,
  // und der Nachbar-Tab soll das auch dann mitbekommen.
  //
  // `private: true` — der Kanal ist damit an die Session gebunden und nur für
  // Authentifizierte offen; ein Broadcast trägt ohnehin keine Daten, aber wer
  // am Board arbeitet, soll auch nur dort mithören.
  //
  // Gesendet wird aus der Datenbank: Trigger auf `slot`, `session` und
  // `session_speaker` rufen `realtime.send(..., 'changed', 'programme-board:<event>')`
  // (Migration `v2_board_realtime_questions`). Damit kommt auch an, was nicht
  // über diese Oberfläche läuft. `notifyPeers()` bleibt als Fallback, falls
  // `realtime.send` im Projekt fehlt.
  const channelName = `programme-board:${currentEventId}`;
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let abgebrochen = false;

    // Der private Kanal prüft `is_programme_board_user()` gegen das Token (seit
    // LEAD-032; vorher `is_programme_reader()`, das Externen alles zeigte). Der Socket
    // verbindet aber schneller, als die Session aus den Cookies gelesen ist —
    // ohne dieses `setAuth` autorisiert Realtime als anon und lehnt ab
    // ("Unauthorized: You do not have permissions to read from this Channel topic").
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (abgebrochen) return;
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (abgebrochen) return;

      channel = supabase
        .channel(channelName, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => router.refresh())
        .subscribe((status, error) => {
          // Nicht still scheitern: ohne Kanal merkt der Nachbar-Tab nichts, und
          // ein stummes Board sieht aus wie ein verlorener Slot.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(
              `[programm] Realtime-Kanal ${channelName} nicht verbunden (${status})` +
                (error ? `: ${error.message}` : "") +
                " — Board aktualisiert beim Zurückkehren in den Tab.",
            );
          }
        });
      channelRef.current = channel;
    })();

    return () => {
      abgebrochen = true;
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [channelName, router]);

  // Netz für den Fall, dass der Kanal nicht steht: wer zum Tab zurückkehrt,
  // bekommt den aktuellen Stand. Billig, weil `router.refresh()` nur die
  // Server-Komponenten neu holt.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

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
      toast("error", fehlerText(message, res));
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
          toast("error", fehlerText(message, res));
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

  /** Wohin ein Zug fiele: Bühne, Beginn und Ende — `null` außerhalb einer bearbeitbaren Spalte. */
  function zugZiel(event: DragMoveEvent | DragEndEvent): { stageId: string; startMin: number; endMin: number } | null {
    const overId = String(event.over?.id ?? "");
    if (!overId.startsWith("stage:")) return null;
    const stageId = overId.slice("stage:".length);
    if (!bearbeitbar(stageId)) return null;
    const startMin = minutesFromDrop(event);
    if (startMin === null) return null;
    const data = event.active.data.current as
      | { kind: "slot"; slot: BoardSlot }
      | { kind: "backlog"; session: BacklogSession }
      | undefined;
    if (!data) return null;
    const dauer =
      data.kind === "slot"
        ? minutesOfDay(data.slot.end_at, timezone) - minutesOfDay(data.slot.start_at, timezone)
        : stages.find((st) => st.id === stageId)?.default_duration_min || 30;
    return { stageId, startMin, endMin: startMin + dauer };
  }

  function onDragMove(event: DragMoveEvent) {
    const ziel = zugZiel(event);
    setVorschau((alt) =>
      alt?.stageId === ziel?.stageId && alt?.startMin === ziel?.startMin && alt?.endMin === ziel?.endMin
        ? alt
        : ziel,
    );
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { kind: "slot"; slot: BoardSlot }
      | { kind: "backlog"; session: BacklogSession }
      | undefined;
    setDragging(data ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    setVorschau(null);
    const overId = String(event.over?.id ?? "");
    if (!overId.startsWith("stage:") || !day) return;
    const stageId = overId.slice("stage:".length);
    // Auf einer fremden Bühne wird nichts abgelegt — auch nicht aus dem
    // Backlog, wo sonst ein Slot auf einer Bühne entstünde, die man hier gar
    // nicht bearbeiten darf.
    if (!bearbeitbar(stageId)) return;
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
      const wo = (id: string, von: number, bis: number) =>
        `${stages.find((st) => st.id === id)?.name ?? "—"} ${formatMinutes(von)}–${formatMinutes(bis)}`;
      setRueckfrage({
        input: {
          slotId: slot.slot_id,
          stageId,
          startAt: zonedTimeToInstant(day.day_date, startMin, timezone).toISOString(),
          endAt: zonedTimeToInstant(
            day.day_date,
            startMin + duration,
            timezone,
          ).toISOString(),
        },
        von: wo(slot.stage_id, minutesOfDay(slot.start_at, timezone), minutesOfDay(slot.end_at, timezone)),
        nach: wo(stageId, startMin, startMin + duration),
        veroeffentlicht: slot.publish_status === "published",
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

  /**
   * Doppelklick auf freie Fläche legt einen leeren Slot an und öffnet ihn
   * gleich (LEAD-021) — vorher stand er nur da, und man musste ihn erst
   * suchen und anklicken, um ihm eine Session zu geben.
   */
  function onColumnDoubleClick(stage: BoardStage, e: React.MouseEvent<HTMLDivElement>) {
    if (!day || !bearbeitbar(stage.id)) return;
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
      if (!handle(res) || !res.ok) return;
      toast("success", t.slotCreated);
      setEditing({
        sessionId: null,
        slotId: res.data.slotId,
        neu: {
          stageId: stage.id,
          startAt: zonedTimeToInstant(day.day_date, startMin, timezone).toISOString(),
          endAt: zonedTimeToInstant(day.day_date, startMin + duration, timezone).toISOString(),
        },
      });
    });
  }

  const hourMarks = useMemo(
    () => hourMarksIn(windowStart, windowEnd),
    [windowEnd, windowStart],
  );

  // LEAD-018: die Zeit im Schubfach ist nur änderbar, wo diese Sicht den Slot
  // bearbeiten darf — sonst bekommt das Schubfach die Funktion gar nicht.
  const zeitSlot = editing?.slotId ? slots.find((x) => x.slot_id === editing.slotId) : undefined;
  const zeitAenderbar =
    !!editing?.slotId &&
    !!day &&
    (zeitSlot ? zeitSlot.can_edit && bearbeitbar(zeitSlot.stage_id) : !!editing.neu && bearbeitbar(editing.neu.stageId));

  if (days.length === 0) {
    return <EmptyState title={t.noDayTitle} description={t.noDayBody} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Board-Kopf (LEAD-014): der Summit als Überschrift, darunter Tag 1 und
          Tag 2 als Schalter. Eine Wahl der Veranstaltung gibt es nur noch, wo
          zwei Editionen je einen Summit haben — Nebenveranstaltungen bietet
          `boardEvents` nicht mehr an. */}
      <div className="flex flex-col gap-3">
        {events.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={t.event}>
            {events.map((e) => (
              <a
                key={e.id}
                href={`${basePath}?event=${e.slug}`}
                aria-current={e.id === currentEventId ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-ct-sm px-3 ct-label",
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
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-2">
            {aktuellesEvent && <h2 className="ct-h2 text-ink">{aktuellesEvent.name}</h2>}
            <div
              className="inline-flex flex-wrap gap-1 self-start rounded-ct-md border border-border-strong bg-surface p-1"
              role="group"
              aria-label={t.day}
            >
              {days.map((d, i) => {
                const aktiv = d.id === currentDayId;
                const name = (locale === "en" ? d.label_en : d.label_de) ?? formatDay(d.day_date, dateLocale);
                return (
                  <a
                    key={d.id}
                    href={`${basePath}?event=${currentEventSlug}&tag=${d.day_date}`}
                    aria-current={aktiv ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-ct-sm px-4 ct-label transition-colors",
                      aktiv ? "bg-accent text-white" : "text-muted hover:bg-surface-hover hover:text-ink",
                    )}
                  >
                    <span>{t.dayN.replace("{n}", String(i + 1))}</span>
                    <span aria-hidden>·</span>
                    <span>{name}</span>
                  </a>
                );
              })}
            </div>
          </div>
          <span className="ct-help">{t.hint}</span>
        </div>
      </div>

      <DndContext
        // Fester Name statt dnd-kits fortlaufender Nummer: die zaehlt im Browser
        // je Mount hoch, der Server beginnt bei 0 — daraus wurde bei jedem Laden
        // ein Hydration-Fehler in `aria-describedby`.
        id="programme-board"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
          setVorschau(null);
        }}
      >
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

        {/* Legende über dem Kalender (LEAD-045, Konrad 25.09.): erst lesen, was
            die Farben heißen, dann planen. In der Partner-Sicht die Stände des
            Partners (LEAD-035) — dieselben Wörter wie in der Tabelle. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="ct-eyebrow text-muted">{partner ? partner.t.colStatus : t.legend}</span>
          {partner && statusTexte
            ? PARTNER_LEGENDE.map((s) => (
                <span key={s} className="flex items-center gap-1.5 ct-help">
                  <span aria-hidden className={cn("inline-block size-3 rounded-sm border", PARTNER_KARTE[s])} />
                  {statusTexte[s]}
                </span>
              ))
            : SLOT_STATUS_ORDER.map((s) => (
                <span key={s} className="flex items-center gap-1.5 ct-help">
                  <span aria-hidden className={cn("inline-block size-3 rounded-sm border", SLOT_STATUS_STYLE[s])} />
                  {labels.slotStatus[s]}
                </span>
              ))}
          {irgendwoZu && (
            <span className="flex items-center gap-1.5 ct-help">
              <span aria-hidden className="inline-block size-3 rounded-sm border border-border bg-hatch-closed" />
              {t.closedLegend}
            </span>
          )}
          {pending && <span className="ct-help ml-auto">{t.saving}</span>}
        </div>

        {/* Board. Es scrollt in sich, damit die Kopfzeile mit den Bühnen
            oben und die Zeitachse links stehen bleiben (LEAD-015) — `sticky`
            greift nur innerhalb des Containers, der scrollt, und ein
            `overflow-x-auto` allein scrollt nicht senkrecht. */}
        <div className="max-h-[75vh] overflow-auto rounded-ct-lg border bg-surface">
          <div style={{ minWidth: rasterBreite }}>
            {/* Kopfzeile: fixiert und als eigene Zeile eingefärbt (LEAD-015,
                Konrad 25.09.) — am Freitag liegt der Einlass als Block über
                allen Bühnen, und ohne eigenen Grund verschwanden die Namen
                darin. */}
            <div
              className="sticky top-0 z-20 grid border-b border-border-strong bg-accent-soft"
              style={{ gridTemplateColumns: rasterSpalten }}
            >
              <div className="sticky left-0 z-10 bg-accent-soft" />
              {spalten.map((s) => {
                const st = statsByStage.get(s.id);
                const istEigen = eigen(s.id);
                const o = oeffnungen.get(s.id) ?? null;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "px-3 py-2",
                      istEigen ? "border-x-2 border-accent bg-accent text-white" : "border-l border-border",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("ct-label", istEigen ? "text-white" : "text-ink")}>{s.name}</span>
                      {/* Nur Farbe zu ändern reichte nicht: der Unterschied
                          muss auch da sein, wo Farben nicht unterschieden
                          werden (Design-Regel 4). */}
                      {istEigen && <Badge tone="accent">{t.ownStage}</Badge>}
                      {!bearbeitbar(s.id) && <Badge>{t.stageReadOnly}</Badge>}
                    </div>
                    <div className={cn("ct-help", istEigen && "text-white")}>
                      {st
                        ? `${st.slots_used}${st.slot_quota ? ` / ${st.slot_quota}` : ""} ${t.slotsUsed}`
                        : `0 ${t.slotsUsed}`}
                      {s.changeover_min > 0 && ` · ${t.changeover} ${s.changeover_min}′`}
                    </div>
                    {/* LEAD-033: die Öffnungszeit als Text — die Schraffur im
                        Raster wiederholt sie nur. */}
                    {o && (
                      <div className={cn("ct-help tabular-nums", istEigen && "text-white")}>
                        {t.openHours.replace("{zeit}", oeffnungText(o, { from: t.openFrom, until: t.openUntil }))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Raster */}
            <div
              ref={gridRef}
              className="relative grid"
              style={{
                gridTemplateColumns: rasterSpalten,
                height: gridHeight,
              }}
            >
              {/* Stundenachse — bleibt beim seitlichen Scrollen stehen. */}
              <div className="sticky left-0 z-10 bg-surface">
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    // Die erste Marke steht unter ihrer Linie statt mittig: halb
                    // darüber läge sie unter der fixierten Kopfzeile.
                    className={cn(
                      "absolute right-2 ct-help tabular-nums",
                      m > windowStart && "-translate-y-1/2",
                    )}
                    style={{ top: (m - windowStart) * PX_PER_MIN }}
                  >
                    {formatMinutes(m)}
                  </div>
                ))}
              </div>

              {spalten.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  editable={bearbeitbar(stage.id)}
                  own={eigen(stage.id)}
                  zu={zuJeBuehne.get(stage.id) ?? []}
                  vorschau={vorschau?.stageId === stage.id ? vorschau : null}
                  windowStart={windowStart}
                  hourMarks={hourMarks}
                  onDoubleClick={(e) => onColumnDoubleClick(stage, e)}
                >
                  {(slotsByStage.get(stage.id) ?? []).map((serverSlot) => {
                    const v = serverSlot.session_id === null ? vorlaeufig[serverSlot.slot_id] : undefined;
                    const slot = v ? { ...serverSlot, ...v } : serverSlot;
                    const { stil, stand } = kartenStil(slot);
                    return (
                    <SlotCard
                      key={slot.slot_id}
                      slot={slot}
                      stil={stil}
                      stand={stand}
                      editable={bearbeitbar(slot.stage_id)}
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
                    );
                  })}
                </StageColumn>
              ))}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging?.kind === "slot" && (
            <div className="rounded-ct-md border border-accent bg-accent-soft px-2 py-1 ct-label ct-help text-accent-deep shadow">
              {dragging.slot.title_de ?? t.untitled}
            </div>
          )}
          {dragging?.kind === "backlog" && (
            <div className="rounded-ct-md border border-accent bg-accent-soft px-2 py-1 ct-label ct-help text-accent-deep shadow">
              {dragging.session.title_de ?? t.untitled}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* LEAD-050: Rückfrage nach dem Ziehen */}
      {rueckfrage && (
        <ConfirmDialog
          title={t.dragConfirmTitle}
          body={
            t.dragConfirmBody.replace("{von}", rueckfrage.von).replace("{nach}", rueckfrage.nach) +
            (rueckfrage.veroeffentlicht ? ` ${t.dragConfirmPublished}` : "")
          }
          confirmLabel={t.dragConfirmAction}
          cancelLabel={t.cancel}
          onCancel={() => setRueckfrage(null)}
          onConfirm={() => {
            const { input, veroeffentlicht } = rueckfrage;
            setRueckfrage(null);
            runMove({ ...input, confirm: veroeffentlicht });
          }}
        />
      )}

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
          // In der Partner-Sicht wird nie freigegeben, auch nicht von einem
          // Admin, der hier als Partner arbeitet (LEAD-016) — dort steht die
          // Anfrage an die Programmleitung (LEAD-036).
          canPublish={canPublish && !partner}
          hostOrgId={hostOrgId}
          partnerSicht={partner}
          slotInfo={(() => {
            // Was der Drawer oben zeigt (LEAD-019): der Slot ist hier schon
            // geladen, ein zweiter Abruf im Drawer wäre doppelte Arbeit. Ein
            // eben angelegter Slot kommt aus `editing.neu` (LEAD-044).
            const sl = slots.find((x) => x.slot_id === editing.slotId);
            const lage = sl
              ? { stageId: sl.stage_id, startAt: sl.start_at, endAt: sl.end_at }
              : editing.slotId
                ? editing.neu
                : undefined;
            if (!lage) return null;
            const stage = stages.find((x) => x.id === lage.stageId);
            return {
              stageId: lage.stageId,
              stageName: stage?.name ?? "—",
              when: `${day ? formatDay(day.day_date, dateLocale) + " · " : ""}${formatMinutes(
                minutesOfDay(lage.startAt, timezone),
              )}–${formatMinutes(minutesOfDay(lage.endAt, timezone))}`,
              status: sl?.slot_status ?? "open",
              slotType: sl?.slot_type ?? "content",
              startMin: minutesOfDay(lage.startAt, timezone),
              endMin: minutesOfDay(lage.endAt, timezone),
            };
          })()}
          // LEAD-018: freie Start- und Endzeit im Schubfach — nur, wo diese
          // Sicht den Slot bearbeiten darf. Veröffentlichte Sessions fragt
          // `move_slot` wie beim Ziehen nach (`confirmation_required`).
          onChangeTime={
            zeitAenderbar
              ? (startMin, endMin) => {
                  const sl = slots.find((x) => x.slot_id === editing.slotId);
                  const stageId = sl?.stage_id ?? editing.neu?.stageId;
                  if (!editing.slotId || !stageId || !day) return;
                  runMove({
                    slotId: editing.slotId,
                    stageId,
                    startAt: zonedTimeToInstant(day.day_date, startMin, timezone).toISOString(),
                    endAt: zonedTimeToInstant(day.day_date, endMin, timezone).toISOString(),
                  });
                }
              : undefined
          }
          // LEAD-044: im Admin lässt sich die Bühne im Schubfach tauschen — die
          // Sicht ohne `editableStageIds` ist die des Programm-Teams. Stage
          // Leads und Partner sehen die Bühne nur (ihre Sicht verengt).
          stageOptions={editableStageIds ? undefined : stages.map((st) => ({ id: st.id, name: st.name }))}
          onChangeStage={
            editableStageIds
              ? undefined
              : (stageId) => {
                  const sl = slots.find((x) => x.slot_id === editing.slotId);
                  const lage = sl ? { startAt: sl.start_at, endAt: sl.end_at } : editing.neu;
                  if (!editing.slotId || !lage) return;
                  runMove({ slotId: editing.slotId, stageId, startAt: lage.startAt, endAt: lage.endAt });
                  if (!sl && editing.neu) setEditing({ ...editing, neu: { ...editing.neu, stageId } });
                }
          }
          onSaved={(info) => {
            const slotId = editing.slotId;
            if (!slotId) return;
            setVorlaeufig((v) => ({
              ...v,
              [slotId]: { session_id: info.sessionId, title_de: info.title_de, title_en: info.title_en },
            }));
          }}
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
  editable,
  own,
  zu,
  vorschau,
  windowStart,
  hourMarks,
  onDoubleClick,
  children,
}: {
  stage: BoardStage;
  /** Nur in dieser Sicht (LEAD-016) — die Rechtegrenze steht in den RPCs. */
  editable: boolean;
  /** Die eigene Bühne einer Bühnen-Sicht: mit Rahmen, wie ihr Kopf (LEAD-015). */
  own: boolean;
  /** Außerhalb der Öffnungszeit (LEAD-033), Minuten seit Mitternacht. */
  zu: { von: number; bis: number }[];
  /** LEAD-051: wohin die gezogene Karte in dieser Spalte fiele. */
  vorschau: { startMin: number; endMin: number } | null;
  windowStart: number;
  hourMarks: number[];
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  // `disabled` statt „kein Droppable": so bleibt die Spalte im selben Raster
  // und die Karten darin sichtbar — nur als Ziel taugt sie nicht mehr.
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}`, disabled: !editable });
  return (
    <div
      ref={setNodeRef}
      onDoubleClick={onDoubleClick}
      className={cn(
        "relative",
        own ? "border-x-2 border-b-2 border-accent" : "border-l",
        isOver && editable && "bg-accent-soft/40",
        // Ruhiger Grund, nicht ausgegraut: die fremde Bühne ist weiter zum
        // Lesen da — man plant schliesslich um sie herum.
        !editable && "bg-canvas",
      )}
    >
      {/* Geschlossen: schraffiert als Form, nicht nur als Farbe (Design-Regel 4).
          Die Zeit steht als Text im Kopf der Spalte; die Fläche bleibt
          klickbar, die Datenbank entscheidet über den Doppelklick. */}
      {zu.map((b) => (
        <div
          key={b.von}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bg-hatch-closed"
          style={{ top: (b.von - windowStart) * PX_PER_MIN, height: (b.bis - b.von) * PX_PER_MIN }}
        />
      ))}
      {hourMarks.map((m) => (
        <div
          key={m}
          className="pointer-events-none absolute inset-x-0 border-t border-border/60"
          style={{ top: (m - windowStart) * PX_PER_MIN }}
        />
      ))}
      {children}
      {/* LEAD-051 (Konrad 25.09.: „wie im Google-Kalender“): die Karte zeigt
          ihr Ziel, bevor losgelassen wird — gestrichelt, mit der Zielzeit. */}
      {vorschau && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 z-10 rounded-ct-sm border-2 border-dashed border-accent bg-accent-soft/70 px-2 py-1 ct-help tabular-nums text-accent-deep"
          style={slotBox(vorschau.startMin, vorschau.endMin, windowStart)}
        >
          {formatMinutes(vorschau.startMin)}–{formatMinutes(vorschau.endMin)}
        </div>
      )}
    </div>
  );
}

function SlotCard({
  slot,
  stil,
  stand,
  editable,
  timezone,
  windowStart,
  labels,
  locale,
  t,
  onOpen,
  onResize,
}: {
  slot: BoardSlot;
  /** Rand und Grund der Karte: Slot-Status, in der Partner-Sicht der Partner-Status (LEAD-035). */
  stil: string;
  /** Partner-Status als Text — die Farbe allein trägt keine Information. */
  stand?: string;
  /**
   * Ob die Sicht diese Bühne bearbeiten lässt (LEAD-016). Zusammen mit
   * `slot.can_edit` — **beides** muss gelten. `can_edit` kommt aus der
   * Datenbank und bleibt die Wahrheit; das hier ist die engere Frage, ob es
   * in **diesem** Portal auch angeboten wird.
   */
  editable: boolean;
  timezone: string;
  windowStart: number;
  labels: BoardLabels;
  locale: Locale;
  t: ProgrammeStrings;
  onOpen: () => void;
  onResize: (deltaPx: number) => void;
}) {
  // Beides muss gelten: `can_edit` aus der Datenbank und die Sichtregel des
  // Portals (LEAD-016). Einmal ausgerechnet, viermal benutzt.
  const ziehbar = slot.can_edit && editable;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: slot.slot_id,
    data: { kind: "slot", slot },
    disabled: !ziehbar,
  });

  const startMin = minutesOfDay(slot.start_at, timezone);
  const serverEnde = minutesOfDay(slot.end_at, timezone);
  // LEAD-052: beim Ziehen am unteren Rand folgt die Karte der Maus und zeigt
  // das neue Ende — gespeichert wird erst beim Loslassen.
  const [vorschauEnde, setVorschauEnde] = useState<number | null>(null);
  const endMin = vorschauEnde ?? serverEnde;
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
    const move = (ev: PointerEvent) => setVorschauEnde(resizedEnd(startMin, serverEnde, ev.clientY - startY));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      setVorschauEnde(null);
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
        "group absolute inset-x-1 overflow-hidden rounded-ct-sm border ct-help",
        stil,
        isDragging && "opacity-40",
        resizing && "ring-2 ring-accent",
        ziehbar ? "cursor-grab" : "cursor-default",
      )}
    >
      {/* `attributes` nur, wenn wirklich gezogen werden darf: sonst kündigt
          `aria-roledescription="draggable"` einen Griff an, den es auf fremden
          Bühnen nicht gibt. Rolle, Fokus und Enter stehen darunter, das Öffnen
          bleibt also möglich. */}
      <div
        {...(ziehbar ? { ...listeners, ...attributes } : {})}
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
          {stand && <span className="truncate text-ink">· {stand}</span>}
          {!stand && slot.publish_status === "published" && (
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
      {/* LEAD-052: der Griff am unteren Rand ist sichtbar, sobald man über der
          Karte ist — vorher war er eine unsichtbare Zwei-Pixel-Kante. */}
      {ziehbar && (
        <div
          onPointerDown={startResize}
          role="separator"
          aria-label={t.resize}
          title={t.resize}
          className="absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize items-end justify-center bg-transparent hover:bg-accent/20"
        >
          <span
            aria-hidden
            className="mb-0.5 h-0.5 w-8 rounded-full bg-border-strong opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
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
        {...(session.can_edit ? { ...listeners, ...attributes } : {})}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-ct-md border px-2.5 py-1.5 ct-help",
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
      // `m-auto` wie im Kit-Modal: Preflight nimmt dem Dialog das zentrierende `margin: auto`.
      className="m-auto max-w-[420px] rounded-ct-lg border bg-surface p-6 text-ink backdrop:bg-navy/40"
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
