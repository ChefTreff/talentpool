import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { KbAdminArticle, KbArticle } from "./types";

/**
 * Artikel einer Zielgruppe. Welche Zielgruppe jemand lesen darf, entscheidet
 * `kb_articles()` aus den Rollen — dieser Aufruf reicht sie nur durch. Ein
 * 42501 ist deshalb kein Fehler der Seite, sondern die richtige Antwort; die
 * Liste bleibt leer.
 */
export async function loadArticles(input: {
  audience: string;
  language: string;
  editionId?: string | null;
  role?: string | null;
}): Promise<KbArticle[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kb_articles", {
    p_audience: input.audience,
    p_language: input.language,
    p_edition_id: input.editionId ?? null,
    p_role: input.role ?? null,
  });
  if (error) {
    if (error.code !== "42501") console.error("[wiki] kb_articles:", error.message);
    return [];
  }
  return (data ?? []) as KbArticle[];
}

export async function loadAdminArticles(audience?: string): Promise<KbAdminArticle[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kb_articles_admin", { p_audience: audience ?? null });
  if (error) {
    console.error("[wiki] kb_articles_admin:", error.message);
    return [];
  }
  return (data ?? []) as KbAdminArticle[];
}

/** Die laufende Edition — Grundlage für das Overlay. */
export async function currentEditionId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}
