import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TechCheckQueue, type CheckAsset, type SpeakerHint } from "./TechCheckQueue";

export const dynamic = "force-dynamic";

export default async function AdminTechPage() {
  await requireArea("admin", "/admin/technik");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  // `my_speaker_assets(null)` liefert dem Team alle Dateien; für den
  // Technik-Check zählen die aktuellen Präsentationen. Wessen Datei das ist,
  // steht dort nicht — deshalb `manager_speakers` daneben: eine Datei ohne
  // Namen und Session kann niemand prüfen.
  const [{ data: rows }, { data: speakerRows }] = await Promise.all([
    supabase.rpc("my_speaker_assets", { p_profile_id: null }),
    supabase.rpc("manager_speakers"),
  ]);
  const assets = ((rows ?? []) as CheckAsset[]).filter(
    (a) => a.kind === "presentation" && a.is_current,
  );
  const open = assets.filter((a) => a.tech_check_status === "pending").length;

  const speakers = new Map<string, SpeakerHint>();
  for (const row of (speakerRows ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    sessions: { session_id: string; title_de: string | null; title_en: string | null }[] | null;
  }[]) {
    speakers.set(row.id, {
      name: [row.first_name, row.last_name].filter(Boolean).join(" "),
      sessions: Object.fromEntries(
        (row.sessions ?? []).map((x) => [
          x.session_id,
          (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? "",
        ]),
      ),
    });
  }

  return (
    <>
      <PageHeader
        title={t.admin.tech.title}
        description={`${t.admin.tech.lead} · ${open} ${t.admin.tech.openCount}`}
      />
      {assets.length === 0 ? (
        <EmptyState title={t.admin.tech.emptyTitle} description={t.admin.tech.emptyBody} />
      ) : (
        <TechCheckQueue
          assets={assets}
          speakers={Object.fromEntries(speakers)}
          dateLocale={t.meta.dateLocale}
          t={t.admin.tech}
          common={{ none: t.common.none }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
