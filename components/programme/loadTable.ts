import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { getI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/shared";
import type { BoardDay, BoardLabels, BoardSlot, BoardStage } from "./types";
import type { BoardEvent } from "./load";

/**
 * Dieselben Daten wie das Kalender-Board, nur **über alle Tage** der
 * Veranstaltung (Feedback-Runde 1, Punkt 6: „Programmboard zusätzlich als
 * Tabelle").
 *
 * Gelesen wird wieder `programme_board` mit dem Sitzungs-Client, nicht mit
 * `service_role`: die Sicht liefert `can_edit` je Zeile aus `can_edit_slot()`,
 * und die Schreib-RPCs prüfen es noch einmal. Ein Stage Lead bekommt deshalb
 * die ganze Tabelle zu sehen, kann aber nur die eigenen Zeilen anfassen —
 * genau wie im Board. Die Tabelle hängt keine eigene Regel davor.
 */
export type TableData = {
  locale: Locale;
  events: BoardEvent[];
  currentEvent: BoardEvent | null;
  days: BoardDay[];
  stages: BoardStage[];
  rows: BoardSlot[];
  labels: BoardLabels;
};

function tableLabels(vocab: Awaited<ReturnType<typeof loadVocabMap>>): BoardLabels {
  const group = (vocabulary: string, keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, vlabel(vocab, vocabulary, k)]));
  return {
    slotStatus: group("slot_status", ["open", "requested", "confirmed_title_open", "final", "unused"]),
    slotType: group("slot_type", ["content", "fixed_block", "placeholder", "partner_block", "frame"]),
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

export async function loadProgrammeTable(input: {
  eventSlug?: string;
  fallbackLocale?: Locale;
  /** Vorauswahl wie im Board: nur Veranstaltungen dieser Editionen. */
  editionIds?: string[];
}): Promise<TableData> {
  const { locale } = await getI18n(input.fallbackLocale);
  const supabase = await createSupabaseServerClient();

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

  const vocab = await loadVocabMap(supabase, locale);
  const empty: TableData = {
    locale,
    events,
    currentEvent: null,
    days: [],
    stages: [],
    rows: [],
    labels: tableLabels(vocab),
  };
  if (events.length === 0) return empty;

  const currentEvent = events.find((e) => e.slug === input.eventSlug) ?? events[0];

  const [{ data: dayRows }, { data: stageRows }, { data: slotRows }] = await Promise.all([
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
    // Ohne Tagesfilter: die Tabelle ist der Blick über die ganze Veranstaltung.
    supabase.from("programme_board").select("*").eq("event_id", currentEvent.id).order("start_at"),
  ]);

  return {
    locale,
    events,
    currentEvent,
    days: (dayRows ?? []) as BoardDay[],
    stages: (stageRows ?? []) as BoardStage[],
    rows: (slotRows ?? []) as BoardSlot[],
    labels: tableLabels(vocab),
  };
}
