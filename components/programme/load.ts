import "server-only";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import type { Locale } from "@/lib/i18n/shared";
import type {
  BacklogSession,
  BoardDay,
  BoardLabels,
  BoardSlot,
  BoardStage,
} from "./types";

/**
 * Daten des Programm-Boards an einer Stelle.
 *
 * Zwei Bereiche zeigen dasselbe Board: das Team unter `/admin/programm`, die
 * Speaker-Leads unter `/speaker-leads/board`. Was sie sehen dürfen, entscheidet
 * nicht diese Datei, sondern RLS — `programme_board` und `programme_backlog`
 * liefern `can_edit` je Zeile, und die Board-RPCs prüfen es noch einmal.
 * Geteilt wird hier nur das Laden, damit die beiden Seiten nicht auseinander
 * driften.
 */

export type BoardEvent = { id: string; slug: string; name: string; timezone: string };

export type BoardStats = {
  stage_id: string;
  slot_quota: number | null;
  slots_used: number;
  slots_available: number | null;
};

export type BoardData = {
  locale: Locale;
  events: BoardEvent[];
  currentEvent: BoardEvent | null;
  days: BoardDay[];
  currentDay: BoardDay | null;
  stages: BoardStage[];
  slots: BoardSlot[];
  backlog: BacklogSession[];
  stats: BoardStats[];
  labels: BoardLabels;
};

/** Vokabular-Labels einmal serverseitig auflösen — im Board sind sie nur Text. */
function boardLabels(vocab: Awaited<ReturnType<typeof loadVocabMap>>): BoardLabels {
  const group = (vocabulary: string, keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, vlabel(vocab, vocabulary, k)]));
  return {
    slotStatus: group("slot_status", [
      "open", "requested", "confirmed_title_open", "final", "unused",
    ]),
    slotType: group("slot_type", [
      "content", "fixed_block", "placeholder", "partner_block", "frame",
    ]),
    format: group("session_format", [
      "keynote", "panel", "fireside_chat", "interview", "podcast", "impulse",
      "talk", "pitch_battle", "award", "opening", "closing", "masterclass",
      "company_tour", "workshop", "networking", "reception", "side_event", "break",
    ]),
    language: group("language", ["de", "en", "mixed"]),
    accessMode: group("access_mode", ["open", "registration", "application"]),
    publishStatus: group("publish_status", ["draft", "review", "published", "cancelled"]),
  };
}

export async function loadBoard(input: {
  /** `?event=` aus der URL. */
  eventSlug?: string;
  /** `?tag=` aus der URL. */
  day?: string;
  /** Ausgangssprache des Bereichs. */
  fallbackLocale?: Locale;
  /**
   * Vorauswahl: nur Veranstaltungen dieser Editionen anbieten. Die Leads
   * bekommen so ihre eigene Edition, ohne durch fremde blättern zu müssen.
   * Leer oder `undefined` heißt: alles, was Bühnen hat.
   */
  editionIds?: string[];
}): Promise<BoardData> {
  const { locale } = await getI18n(input.fallbackLocale);
  const supabase = await createSupabaseServerClient();

  // Bespielbare Events der Edition: alles, was Bühnen hat.
  const { data: eventRows } = await supabase
    .from("event")
    .select("id, slug, name, timezone, edition_id, is_edition, stage(id)")
    .order("start_date");

  const scoped = new Set(input.editionIds ?? []);
  const events = ((eventRows ?? []) as (BoardEvent & {
    edition_id: string | null;
    is_edition: boolean;
    stage: { id: string }[] | null;
  })[])
    .filter((e) => !e.is_edition && (e.stage?.length ?? 0) > 0)
    .filter((e) => scoped.size === 0 || (e.edition_id !== null && scoped.has(e.edition_id)))
    .map(({ id, slug, name, timezone }) => ({ id, slug, name, timezone }));

  const empty: BoardData = {
    locale,
    events,
    currentEvent: null,
    days: [],
    currentDay: null,
    stages: [],
    slots: [],
    backlog: [],
    stats: [],
    labels: boardLabels(await loadVocabMap(supabase, locale)),
  };
  if (events.length === 0) return empty;

  const currentEvent = events.find((e) => e.slug === input.eventSlug) ?? events[0];

  const [{ data: dayRows }, { data: stageRows }, vocab] = await Promise.all([
    supabase
      .from("event_day")
      .select("id, day_date, label_de, label_en, programme_start, programme_end")
      .eq("event_id", currentEvent.id)
      .order("day_date"),
    supabase
      .from("stage")
      .select("id, name, slug, type, room, sort_order, changeover_min, default_duration_min")
      .eq("event_id", currentEvent.id)
      .eq("active", true)
      .order("sort_order"),
    loadVocabMap(supabase, locale),
  ]);

  const days = (dayRows ?? []) as BoardDay[];
  const currentDay = days.find((d) => d.day_date === input.day) ?? days[0] ?? null;

  const [{ data: slotRows }, { data: backlogRows }, { data: statsRows }] = await Promise.all([
    currentDay
      ? supabase
          .from("programme_board")
          .select("*")
          .eq("event_day_id", currentDay.id)
          .order("start_at")
      : Promise.resolve({ data: [] }),
    supabase
      .from("programme_backlog")
      .select("*")
      .eq("event_id", currentEvent.id)
      .order("created_at", { ascending: false })
      .limit(50),
    currentDay
      ? supabase.from("stage_day_slot_stats").select("*").eq("event_day_id", currentDay.id)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    locale,
    events,
    currentEvent,
    days,
    currentDay,
    stages: (stageRows ?? []) as BoardStage[],
    slots: (slotRows ?? []) as BoardSlot[],
    backlog: (backlogRows ?? []) as BacklogSession[],
    stats: (statsRows ?? []) as BoardStats[],
    labels: boardLabels(vocab),
  };
}
