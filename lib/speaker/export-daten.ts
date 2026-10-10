import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { boardEvents } from "@/components/programme/events";
import { vgroup, type VocabMap } from "@/lib/vocab";
import type { Locale } from "@/lib/i18n/shared";
import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";
import {
  hotelZeilen,
  programmZeilen,
  type BerichtId,
  type BoardQuelle,
  type ExportKontext,
  type KontingentQuelle,
  type Rohdaten,
} from "./export-berichte";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Die Vokabular-Gruppen, aus denen die Berichte ihre Beschriftungen nehmen — alle aus `vocab_term`, nie von Hand. */
const VOKABULAR = [
  "speaker_type",
  "speaker_pipeline",
  "speaker_decline_reason",
  "speaker_category",
  "topic_cluster",
  "speaker_priority",
  "session_format",
  "outreach_channel",
  "publish_status",
  "hospitality_status",
  "hotel_tier",
  "ticket_type",
  "language",
] as const;

/**
 * Was die Spalten zum Beschriften brauchen: das Vokabular der Gruppen oben, ein flaches Wörterbuch (`ja`, `nein`, `moderation` aus `adminSpeakerExport`, dazu
 * `booking_<stand>` aus dem Hospitality-Admin — derselbe Name für denselben Stand wie dort) und die Sprache der Titel.
 */
export function exportKontext(vocab: VocabMap, ta: Record<string, string>, hospitality: Record<string, string>, locale: Locale): ExportKontext {
  return {
    vokabular: Object.fromEntries(VOKABULAR.map((g) => [g, vgroup(vocab, g)])),
    woerter: { ...hospitality, ja: ta.yes, nein: ta.no, moderation: ta.moderation },
    sprache: locale === "en" ? "en" : "de",
  };
}

export type BerichtDaten =
  | { ok: true; roh: Rohdaten }
  /** `nicht_erlaubt`: angemeldet, aber die Datenbank verweigert den Bericht (42501). `keine_edition`: es gibt keine Edition. */
  | { ok: false; grund: "nicht_erlaubt" | "keine_edition" | "fehler" };

const verweigert = (fehler: { code?: string } | null): BerichtDaten | null =>
  fehler ? { ok: false, grund: fehler.code === "42501" ? "nicht_erlaubt" : "fehler" } : null;

/**
 * Die Rohdaten eines Berichts für die **aktuelle Edition** (die jüngste mit `is_edition`, wie unter `/admin/speaker-leads`). Wer was lesen darf, entscheidet die
 * Datenbank — hier steht nur das Bereichsgate der Seite:
 *
 * - `speaker`: `manager_speakers` (Speaker-Team und Programmleitung sehen alle, ein Stage Lead nur seine),
 * - `hotel`: `hospitality_admin_overview` (nur das Speaker-Team, sonst 42501),
 * - `programm`: die Sicht `programme_board` mit den Bühnen des Summits (`boardEvents`).
 *
 * Die Seite und der Download laden hier — dieselben Zeilen für Vorschau und Datei.
 */
export async function ladeBericht(supabase: Client, bericht: BerichtId, locale: Locale): Promise<BerichtDaten> {
  const { data: edition } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!edition) return { ok: false, grund: "keine_edition" };

  if (bericht === "speaker") {
    const { data, error } = await supabase.rpc("manager_speakers", { p_edition_id: edition.id });
    return verweigert(error) ?? { ok: true, roh: { bericht, zeilen: (data ?? []) as ManagedSpeaker[] } };
  }

  if (bericht === "hotel") {
    const { data, error } = await supabase.rpc("hospitality_admin_overview", { p_edition_id: edition.id });
    return verweigert(error) ?? { ok: true, roh: { bericht, zeilen: hotelZeilen((data ?? []) as KontingentQuelle[], locale === "en" ? "en" : "de") } };
  }

  const events = await boardEvents(supabase, [edition.id]);
  if (events.length === 0) return { ok: true, roh: { bericht, zeilen: [] } };
  const { data, error } = await supabase
    .from("programme_board")
    .select("stage_name, stage_sort, day_date, start_at, end_at, slot_type, session_id, title_de, title_en, format, language, publish_status, capacity, speakers")
    .in("event_id", events.map((e) => e.id));
  return verweigert(error) ?? { ok: true, roh: { bericht, zeilen: programmZeilen((data ?? []) as BoardQuelle[]) } };
}
