import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { WikiView } from "./WikiView";
import { currentEditionId, loadArticles } from "./load";
import { KB_PHASES } from "./types";
import type { Locale } from "@/lib/i18n/shared";

/**
 * Ein Wiki im Bereich. Die Zielgruppe steht fest — wer sie nicht lesen darf,
 * bekommt aus der RPC nichts und sieht den Leerzustand, keinen Fehler.
 */
export async function WikiPage({
  audience,
  locale: fallback,
  role,
}: {
  audience: string;
  locale?: Locale;
  /** Nur Volunteers: Rollen-Seiten des eigenen Bereichs. */
  role?: string | null;
}) {
  const { locale, t } = await getI18n(fallback);
  const supabase = await createSupabaseServerClient();
  const [editionId, vocab] = await Promise.all([currentEditionId(), loadVocabMap(supabase, locale)]);
  const articles = await loadArticles({ audience, language: locale, editionId, role });
  const phases = Object.fromEntries(KB_PHASES.map((p) => [p, vlabel(vocab, "kb_phase", p)]));

  return (
    <>
      <PageHeader title={t.wiki.title} description={t.wiki.lead} />
      <WikiView articles={articles} phases={phases} locale={locale} t={t.wiki} />
    </>
  );
}
