import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { WikiAdmin } from "./WikiAdmin";
import { loadAdminArticles } from "@/components/wiki/load";
import { KB_AUDIENCES, KB_PHASES } from "@/components/wiki/types";

export const dynamic = "force-dynamic";

/**
 * Der Wiki-Editor. Das Gate lässt das Admin-Team herein; **welche** Artikel
 * jemand sieht und ändern darf, entscheidet `can_edit_kb()` je Zielgruppe —
 * die Bereichsleitung Volunteers sieht nur Volunteer-Artikel.
 */
export default async function AdminWikiPage({
  searchParams,
}: {
  searchParams: Promise<{ zielgruppe?: string }>;
}) {
  await requireAdminSection("wiki", "/admin/wiki");
  const { locale, t } = await getI18n();
  const { zielgruppe } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [articles, vocab, { data: editionRows }] = await Promise.all([
    loadAdminArticles(zielgruppe),
    loadVocabMap(supabase, locale),
    supabase.from("event").select("id, slug, name").eq("is_edition", true).order("start_date", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader word={t.admin.words.wiki} title={t.wiki.adminTitle} description={t.wiki.adminLead} />
      <WikiAdmin
        articles={articles}
        editions={(editionRows ?? []) as { id: string; slug: string; name: string }[]}
        audiences={Object.fromEntries(KB_AUDIENCES.map((a) => [a, vlabel(vocab, "kb_audience", a)]))}
        phases={Object.fromEntries(KB_PHASES.map((p) => [p, vlabel(vocab, "kb_phase", p)]))}
        t={t.wiki}
        common={{ save: t.common.save, cancel: t.common.cancel, close: t.common.close }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
