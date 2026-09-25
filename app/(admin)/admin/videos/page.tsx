import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { removeLink, saveLink } from "./actions";
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
 * Darunter die **Links** (PART-072): zuerst die Store-Links der Event-App, die
 * Teilnehmer-Programm und Partner-Portal lesen — gepflegt wie die Videos, bis
 * ADM-063 die zentrale Medienverwaltung bringt.
 */
export default async function AdminVideosPage() {
  await requireAdminSection("videos", "/admin/videos");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const [{ data: videos }, { data: editions }, { data: links }] = await Promise.all([
    supabase.rpc("portal_videos_admin"),
    supabase.from("event").select("id, slug, name").eq("is_edition", true).order("start_date", { ascending: false }),
    supabase.rpc("portal_links_admin"),
  ]);
  const editionen = (editions ?? []) as { id: string; slug: string; name: string }[];
  const common = { save: t.common.save, cancel: t.common.cancel, delete: t.common.delete, none: t.common.none };

  return (
    <>
      <PageHeader word={t.admin.words.videos} title={t.videos.title} description={t.videos.lead} />
      <VideoAdmin
        videos={(videos ?? []) as AdminVideo[]}
        editions={editionen}
        t={t.videos}
        common={common}
        rpcMessages={t.rpc}
      />
      <section aria-labelledby="h-links" className="mt-10">
        <h2 id="h-links" className="ct-h2 text-ink">
          {t.videos.linksTitle}
        </h2>
        <p className="ct-help mt-1 mb-4 max-w-text">{t.videos.linksLead}</p>
        <VideoAdmin
          videos={(links ?? []) as AdminVideo[]}
          editions={editionen}
          t={{
            ...t.videos,
            add: t.videos.linkAdd,
            empty: t.videos.linkEmpty,
            emptyBody: t.videos.linkEmptyBody,
            fieldKeyHint: t.videos.linkKeyHint,
            fieldUrl: t.videos.linkUrl,
            fieldUrlHint: t.videos.linkUrlHint,
          }}
          common={common}
          rpcMessages={t.rpc}
          save={saveLink}
          remove={removeLink}
          idPrefix="l"
        />
      </section>
    </>
  );
}
