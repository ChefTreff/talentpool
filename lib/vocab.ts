import type { SupabaseClient } from "@supabase/supabase-js";

/** "vocabulary:key" -> label_de */
export type VocabMap = Map<string, string>;

export async function loadVocabMap(client: SupabaseClient): Promise<VocabMap> {
  const { data } = await client.from("vocab_term").select("vocabulary,key,label_de");
  const m = new Map<string, string>();
  for (const t of (data ?? []) as {
    vocabulary: string;
    key: string;
    label_de: string;
  }[]) {
    m.set(`${t.vocabulary}:${t.key}`, t.label_de);
  }
  return m;
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
