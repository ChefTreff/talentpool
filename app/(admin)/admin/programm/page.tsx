import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Board } from "./Board";
import type { BoardDay, BoardSlot, BacklogSession, BoardStage } from "./types";

export const dynamic = "force-dynamic";

type EventRow = { id: string; slug: string; name: string; timezone: string };

export default async function ProgrammPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tag?: string }>;
}) {
  // Gate je Seite, nicht nur im Layout. Die Board-RPCs prüfen zusätzlich
  // can_edit_slot()/can_edit_session() — ein Speaker-Manager darf hier lesen,
  // aber nur im eigenen Scope schreiben.
  await requireArea("admin", "/admin/programm");
  const { locale, t } = await getI18n();
  const { event: eventSlug, tag } = await searchParams;

  const supabase = await createSupabaseServerClient();

  // Bespielbare Events der Edition: alles, was Bühnen hat.
  const { data: eventRows } = await supabase
    .from("event")
    .select("id, slug, name, timezone, is_edition, stage(id)")
    .order("start_date");

  const events = ((eventRows ?? []) as (EventRow & {
    is_edition: boolean;
    stage: { id: string }[] | null;
  })[])
    .filter((e) => !e.is_edition && (e.stage?.length ?? 0) > 0)
    .map(({ id, slug, name, timezone }) => ({ id, slug, name, timezone }));

  if (events.length === 0) {
    return (
      <>
        <PageHeader title={t.admin.programme.title} description={t.admin.programme.lead} />
        <EmptyState
          title={t.admin.programme.noEventTitle}
          description={t.admin.programme.noEventBody}
        />
      </>
    );
  }

  const currentEvent = events.find((e) => e.slug === eventSlug) ?? events[0];

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
  const stages = (stageRows ?? []) as BoardStage[];
  const currentDay = days.find((d) => d.day_date === tag) ?? days[0] ?? null;

  const [{ data: slotRows }, { data: backlogRows }, { data: statsRows }] =
    await Promise.all([
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
        ? supabase
            .from("stage_day_slot_stats")
            .select("*")
            .eq("event_day_id", currentDay.id)
        : Promise.resolve({ data: [] }),
    ]);

  // Vokabular-Labels einmal serverseitig auflösen — im Board sind sie nur Text.
  const labels = {
    slotStatus: Object.fromEntries(
      ["open", "requested", "confirmed_title_open", "final", "unused"].map((k) => [
        k,
        vlabel(vocab, "slot_status", k),
      ]),
    ),
    slotType: Object.fromEntries(
      ["content", "fixed_block", "placeholder", "partner_block", "frame"].map((k) => [
        k,
        vlabel(vocab, "slot_type", k),
      ]),
    ),
    format: Object.fromEntries(
      [
        "keynote", "panel", "fireside_chat", "interview", "podcast", "impulse",
        "talk", "pitch_battle", "award", "opening", "closing", "masterclass",
        "company_tour", "workshop", "networking", "reception", "side_event", "break",
      ].map((k) => [k, vlabel(vocab, "session_format", k)]),
    ),
    language: Object.fromEntries(
      ["de", "en", "mixed"].map((k) => [k, vlabel(vocab, "language", k)]),
    ),
    accessMode: Object.fromEntries(
      ["open", "registration", "application"].map((k) => [
        k,
        vlabel(vocab, "access_mode", k),
      ]),
    ),
    publishStatus: Object.fromEntries(
      ["draft", "review", "published", "cancelled"].map((k) => [
        k,
        vlabel(vocab, "publish_status", k),
      ]),
    ),
  };

  return (
    <>
      <PageHeader title={t.admin.programme.title} description={t.admin.programme.lead} />
      <Board
        events={events}
        currentEventId={currentEvent.id}
        currentEventSlug={currentEvent.slug}
        timezone={currentEvent.timezone}
        days={days}
        currentDayId={currentDay?.id ?? null}
        stages={stages}
        slots={(slotRows ?? []) as BoardSlot[]}
        backlog={(backlogRows ?? []) as BacklogSession[]}
        stats={(statsRows ?? []) as { stage_id: string; slot_quota: number | null; slots_used: number; slots_available: number | null }[]}
        labels={labels}
        locale={locale}
        t={t.admin.programme}
        rpcMessages={t.rpc}
      />
    </>
  );
}
