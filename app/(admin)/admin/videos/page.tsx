import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { VIDEO_SCHLUESSEL } from "@/components/video/schluessel";
import { VideoAdmin, type AdminVideo } from "./VideoAdmin";

export const dynamic = "force-dynamic";

/**
 * Alle eingebetteten Videos an einer Stelle (F9.4).
 *
 * Konrads Anforderung: „im Admin muss es eine allgemeine Liste aller
 * eingebetteten Videos geben, wo man solche Links zentral austauschen kann."
 * Die Seiten binden über den **Schlüssel** ein — wer hier den Link tauscht,
 * tauscht das Video überall, wo dieser Schlüssel steht.
 *
 * Darüber steht, welche Schlüssel die Seiten einbinden und wo der Link noch
 * fehlt (PART-039 Messeshop, PART-075 Event-App) — sonst müsste man im Code
 * nachsehen, unter welchem Schlüssel ein neues Video erwartet wird.
 */
export default async function AdminVideosPage() {
  await requireAdminSection("videos", "/admin/videos");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const [{ data: videos }, { data: editions }] = await Promise.all([
    supabase.rpc("portal_videos_admin"),
    supabase.from("event").select("id, slug, name").eq("is_edition", true).order("start_date", { ascending: false }),
  ]);

  const vorhanden = new Set(((videos ?? []) as AdminVideo[]).map((v) => v.key));

  return (
    <>
      <PageHeader word={t.admin.words.videos} title={t.videos.title} description={t.videos.lead} />
      <Card className="mb-6">
        <h2 className="ct-h3 text-ink">{t.videos.expectedTitle}</h2>
        <p className="ct-help mt-1 max-w-text">{t.videos.expectedLead}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {VIDEO_SCHLUESSEL.map((v) => (
            <li key={v.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <code className="ct-small text-ink">{v.key}</code>
              <Link className="ct-link ct-small" href={v.seite}>
                {v.seite}
              </Link>
              {vorhanden.has(v.key) ? (
                <Badge tone="success">{t.videos.expectedSet}</Badge>
              ) : (
                <Badge tone="warning">{t.videos.expectedMissing}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
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
