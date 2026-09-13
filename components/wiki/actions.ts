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
};

export async function saveArticle(input: ArticleInput): Promise<ActionResult<{ id: string }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_kb_article", { p_data: input });
  if (error) return fail(error);
  revalidateAll();
  return { ok: true, data: { id: data as string } };
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
