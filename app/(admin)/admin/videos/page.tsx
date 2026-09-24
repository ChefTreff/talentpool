import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { VideoAdmin, type AdminVideo } from "./VideoAdmin";

export const dynamic = "force-dynamic";

/**
 * Alle eingebetteten Videos an einer Stelle (F9.4).
 *
 * Konrads Anforderung: „im Admin muss es eine allgemeine Liste aller
 * eingebetteten Videos geben, wo man solche Links zentral austauschen kann."
 * Die Seiten binden über den **Schlüssel** ein — wer hier den Link tauscht,
 * tauscht das Video überall, wo dieser Schlüssel steht.
 */
export default async function AdminVideosPage() {
  await requireAdminSection("videos", "/admin/videos");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const [{ data: videos }, { data: editions }] = await Promise.all([
    supabase.rpc("portal_videos_admin"),
    supabase.from("event").select("id, slug, name").eq("is_edition", true).order("start_date", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader word={t.admin.words.videos} title={t.videos.title} description={t.videos.lead} />
      <VideoAdmin
        videos={(videos ?? []) as AdminVideo[]}
        editions={(editions ?? []) as { id: string; slug: string; name: string }[]}
        t={t.videos}
        common={{ save: t.common.save, cancel: t.common.cancel, delete: t.common.delete, none: t.common.none }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
