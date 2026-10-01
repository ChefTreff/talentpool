import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { AREA_KEYS } from "@/lib/areas";
import { ADMIN_SECTIONS, TEAM_ROLES } from "@/lib/admin-sections";
import { ADMIN_NAVIGATION } from "@/lib/admin-navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { sectionOverrides } from "./actions";
import { RolesView } from "./RolesView";
import { LeistenVorschau } from "./LeistenVorschau";

export const dynamic = "force-dynamic";

/**
 * Die Menübeschriftung je Abschnitt kommt aus der Leiste selbst (QS-032):
 * der erste Punkt, der den Abschnitt öffnet. Vorher stand hier eine eigene
 * Zuordnung für die zwei Abschnitte, deren Beschriftung anders heisst
 * (`partner` → `partnerCare`) — eine zweite Liste, die hätte driften können.
 */
const NAV_JE_ABSCHNITT: Record<string, string> = Object.fromEntries(
  [...ADMIN_NAVIGATION.flatMap((g) => g.punkte)].reverse().map((p) => [p.section, p.label]),
);

/**
 * Rollenverwaltung. Die Seite lädt nur die Auswahllisten; Personen, Rollen und
 * Schreibwege laufen über die RPCs aus Migration 0022.
 *
 * Der Scope `org` hat keine Auswahlliste: `organization` hat RLS ohne
 * Lesepolicy, gesucht wird über `search_organizations` (Migration 0024).
 */
export default async function RollenPage() {
  await requireAdminSection("roles", "/admin/rollen");
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

  // Ausnahmen zur Abschnitts-Vorgabe (ADM-053). Schlägt das Lesen fehl, steht
  // die Seite trotzdem — die Rollenverwaltung ist das Wichtigere.
  const ausnahmen = await sectionOverrides();

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

  const rollenNamen = vgroup(vocab, "role");
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  // `admin.nav` enthält neben den Beschriftungen die Gruppenköpfe (`sections`);
  // nur die Zeichenketten sind Beschriftungen.
  const navLabel = (key: string): string | null => {
    const wert = (t.admin.nav as Record<string, unknown>)[key];
    return typeof wert === "string" ? wert : null;
  };
  const dayFormat = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "short" });
  const timeFormat = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  return (
    <>
      <PageHeader word={t.admin.words.roles} title={t.admin.roles.title} description={t.admin.roles.lead} />
      <RolesView
        roles={rollenNamen}
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
        overrides={ausnahmen.ok ? ausnahmen.data : []}
        sections={ADMIN_SECTIONS.map((s) => ({
          key: s.key,
          label: navLabel(NAV_JE_ABSCHNITT[s.key] ?? s.key) ?? s.key,
        }))}
        vorgabe={Object.fromEntries(ADMIN_SECTIONS.map((s) => [s.key, s.roles]))}
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
      <LeistenVorschau
        rollen={TEAM_ROLES.map((r) => ({ value: r, label: rollenNamen[r] ?? r }))}
        vorgabe={Object.fromEntries(ADMIN_SECTIONS.map((s) => [s.key, s.roles]))}
        rollenAusnahmen={(ausnahmen.ok ? ausnahmen.data : [])
          .filter((a) => a.role !== null)
          .map((a) => ({ section: a.section, role: a.role as string, allowed: a.allowed }))}
        nav={t.admin.nav as Record<string, unknown>}
        t={t.admin.roles}
      />
    </>
  );
}
