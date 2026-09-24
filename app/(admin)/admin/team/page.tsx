import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamView, type TeamMember } from "./TeamView";

export const dynamic = "force-dynamic";

/**
 * Wer gehört zum Team, mit welcher Rolle.
 *
 * Die Seite verlangt kein eigenes Gate über `requireArea` hinaus — `team_members()`
 * prüft `has_role('admin')` selbst und ist damit die verbindliche Grenze. Wer
 * den Admin-Bereich über eine andere Rolle betritt, sieht hier nichts.
 */
export default async function AdminTeamPage() {
  await requireAdminSection("team", "/admin/team");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: roleKeys }, { data: edition }, vocab] = await Promise.all([
    supabase.rpc("team_members"),
    supabase.rpc("team_role_keys"),
    supabase
      .from("event")
      .select("id, name")
      .eq("is_edition", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadVocabMap(supabase, locale),
  ]);

  const members = (rows ?? []) as TeamMember[];

  return (
    <>
      <PageHeader
        word={t.admin.words.team}
        title={t.adminTeam.title}
        description={`${t.adminTeam.lead} · ${members.length} ${t.common.shown}`}
      />
      <TeamView
        members={members}
        roleKeys={(roleKeys ?? []) as string[]}
        editionId={edition?.id ?? null}
        editionName={edition?.name ?? null}
        labels={vgroup(vocab, "role")}
        dateLocale={t.meta.dateLocale}
        t={t.adminTeam}
        common={{ cancel: t.common.cancel, choose: t.common.choose, none: t.common.none }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
