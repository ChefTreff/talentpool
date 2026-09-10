import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { AREA_KEYS } from "@/lib/areas";
import { PageHeader } from "@/components/ui/PageHeader";
import { RolesView } from "./RolesView";

export const dynamic = "force-dynamic";

/**
 * Rollenverwaltung. Die Seite lädt nur die Auswahllisten; Personen, Rollen und
 * Schreibwege laufen über die RPCs aus Migration 0022.
 *
 * Der Scope `org` hat keine Auswahlliste: `organization` hat RLS ohne
 * Lesepolicy, gesucht wird über `search_organizations` (Migration 0024).
 */
export default async function RollenPage() {
  await requireArea("admin", "/admin/rollen");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: events }, { data: stages }, { data: stageDays }, { data: slots }, vocab] =
    await Promise.all([
      supabase.from("event").select("id, name, slug, is_edition").order("name"),
      supabase.from("stage").select("id, name, event_id").order("sort_order"),
      supabase
        .from("stage_day")
        .select("id, stage_id, event_day_id, stage(name), event_day(day_date)")
        .limit(200),
      supabase
        .from("slot")
        .select("id, start_at, stage_id, stage(name)")
        .order("start_at")
        .limit(200),
      loadVocabMap(supabase, locale),
    ]);

  type Named = { id: string; name: string | null };
  const eventRows = (events ?? []) as (Named & { slug: string; is_edition: boolean })[];
  const stageRows = (stages ?? []) as (Named & { event_id: string })[];
  const stageDayRows = (stageDays ?? []) as unknown as {
    id: string;
    stage: { name: string } | { name: string }[] | null;
    event_day: { day_date: string } | { day_date: string }[] | null;
  }[];
  const slotRows = (slots ?? []) as unknown as {
    id: string;
    start_at: string;
    stage: { name: string } | { name: string }[] | null;
  }[];

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const dayFormat = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "short" });
  const timeFormat = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  return (
    <>
      <PageHeader title={t.admin.roles.title} description={t.admin.roles.lead} />
      <RolesView
        roles={vgroup(vocab, "role")}
        scopes={{
          edition: eventRows
            .filter((e) => e.is_edition)
            .map((e) => ({ value: e.id, label: e.name ?? e.slug })),
          portal: AREA_KEYS.map((key) => ({ value: key, label: t.areas[key].name })),
          stage: stageRows.map((s) => ({ value: s.id, label: s.name ?? "—" })),
          stage_day: stageDayRows.map((d) => ({
            value: d.id,
            label: `${one(d.stage)?.name ?? "—"} · ${
              one(d.event_day) ? dayFormat.format(new Date(one(d.event_day)!.day_date)) : "—"
            }`,
          })),
          slot: slotRows.map((s) => ({
            value: s.id,
            label: `${one(s.stage)?.name ?? "—"} · ${timeFormat.format(new Date(s.start_at))}`,
          })),
        }}
        dateLocale={t.meta.dateLocale}
        t={t.admin.roles}
        common={{
          cancel: t.common.cancel,
          choose: t.common.choose,
          inactive: t.common.inactive,
          none: t.common.none,
          save: t.common.save,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
