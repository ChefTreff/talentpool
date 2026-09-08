import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/shared";

/** "vocabulary:key" -> Label in der gewählten Sprache */
export type VocabMap = Map<string, string>;

type Term = {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string | null;
};

/**
 * Vokabular-Labels kommen aus `vocab_term`, nie hartkodiert (Design-Briefing §6).
 * `label_en` ist optional gepflegt — fehlt es, fällt das Label auf DE zurück.
 */
export async function loadVocabMap(
  client: SupabaseClient,
  locale: Locale = DEFAULT_LOCALE,
): Promise<VocabMap> {
  const { data } = await client
    .from("vocab_term")
    .select("vocabulary,key,label_de,label_en");
  const m = new Map<string, string>();
  for (const t of (data ?? []) as Term[]) {
    m.set(`${t.vocabulary}:${t.key}`, pickLabel(t, locale));
  }
  return m;
}

export function pickLabel(
  t: { label_de: string; label_en?: string | null },
  locale: Locale,
): string {
  if (locale === "en") return t.label_en?.trim() || t.label_de;
  return t.label_de;
}

/** Label für einen vocab-Key; fällt auf den Key zurück, "—" bei leer. */
export function vlabel(
  map: VocabMap,
  vocabulary: string,
  key: string | null | undefined,
): string {
  if (!key) return "—";
  return map.get(`${vocabulary}:${key}`) ?? key;
}
