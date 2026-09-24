import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { Assistent } from "./Assistent";
import { WikiView } from "./WikiView";
import { loadMyContacts } from "@/components/kontakt/load";
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

  // Wen man fragt, wenn das Wiki nichts hergibt. Der erste Ansprechpartner der
  // eigenen Beziehung genügt — eine Liste an dieser Stelle wäre eine zweite
  // Kontaktseite, und die gibt es schon.
  const kontakte = await loadMyContacts(editionId);
  const erster = kontakte[0] ?? null;
  const phases = Object.fromEntries(KB_PHASES.map((p) => [p, vlabel(vocab, "kb_phase", p)]));

  return (
    <>
      <PageHeader word={t.wiki.word} title={t.wiki.title} description={t.wiki.lead} />
      <Assistent
        audience={audience}
        locale={locale}
        kontakt={erster ? { name: erster.display_name, email: erster.email } : null}
        t={t.wikiAssistent}
      />
      <WikiView articles={articles} phases={phases} locale={locale} t={t.wiki} />
    </>
  );
}
