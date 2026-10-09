"use server";

import { revalidatePath } from "next/cache";
import { requireAnyArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

/**
 * Schreibwege der Wissensbasis. Sitzungs-Client: `can_edit_kb()` prüft in der
 * Datenbank, ob diese Person die Zielgruppe des Artikels betreut.
 */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[wiki] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

const PATHS = ["/admin/wiki", "/partner/wiki", "/speaker/wiki", "/volunteers/wiki"] as const;
function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

async function client() {
  await requireAnyArea(["admin", "partner", "speaker", "volunteers"], PATHS[0]);
  return createSupabaseServerClient();
}

export type ArticleInput = {
  id?: string;
  slug?: string;
  edition_id?: string | null;
  language?: string;
  audience?: string[];
  roles?: string[];
  phase?: string;
  title?: string;
  body_md?: string;
  valid_until?: string | null;
  sort_order?: number;
  /** ADM-064: Schlüssel aus `wiki_category`; leer = kein Thema. Fehlt der Schlüssel, bleibt das Thema stehen. */
  category?: string | null;
  /** PART-103: Schlüssel aus `partner_format`; leere Liste = für alle. Fehlt der Schlüssel, bleibt der Bezug stehen. */
  product_formats?: string[];
};

export async function saveArticle(input: ArticleInput): Promise<ActionResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_kb_article", { p_data: input });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: { id: data as string } };
}

/** Die Felder, die für beide Sprachfassungen eines Artikels gleich sind (`upsert_kb_article_pair`). */
export type ArtikelGemeinsam = {
  audience?: string[];
  roles?: string[];
  phase?: string;
  category?: string | null;
  product_formats?: string[];
  valid_until?: string | null;
  sort_order?: number;
};

/** Titel und Text einer Sprachfassung. */
export type Sprachtext = { title: string; body_md: string };

/**
 * Einen Artikel mit **beiden** Sprachfassungen speichern (ADM-103): die gemeinsamen Felder gehen in beide Zeilen, Titel und
 * Text je Sprache; `null` lässt eine Sprache unverändert, eine fehlende Sprache entsteht als Entwurf. Eine Transaktion.
 */
export async function saveArticlePair(input: {
  slug: string;
  edition_id: string | null;
  shared: ArtikelGemeinsam;
  de: Sprachtext | null;
  en: Sprachtext | null;
}): Promise<ActionResult<{ de?: string; en?: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_kb_article_pair", {
    p_slug: input.slug,
    p_edition_id: input.edition_id,
    p_shared: input.shared,
    p_de: input.de,
    p_en: input.en,
  });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: (data ?? {}) as { de?: string; en?: string } };
}

export async function publishArticle(id: string, published: boolean): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("publish_kb_article", { p_id: id, p_published: published });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function archiveArticle(id: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("delete_kb_article", { p_id: id });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: undefined };
}
