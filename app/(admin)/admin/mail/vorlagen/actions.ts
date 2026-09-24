"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { fillVars, markdownToHtml } from "@/lib/mail/render";

/**
 * Mail-Vorlagen pflegen. Die RPCs prüfen `has_role('admin')` selbst — diese
 * Texte gehen an alle, das ist keine Aufgabe, die man nebenbei delegiert.
 */
const PATH = "/admin/mail/vorlagen";

export type VorlageResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/mail/vorlagen] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAdminSection("mail", PATH);
  return createSupabaseServerClient();
}

export async function saveTemplate(data: Record<string, unknown>): Promise<VorlageResult<number>> {
  const supabase = await client();
  const { data: version, error } = await supabase.rpc("upsert_mail_template", { p_data: data });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: (version ?? 0) as number };
}

export async function restoreTemplate(
  key: string,
  locale: string,
  subject: string,
  body: string,
): Promise<VorlageResult<number>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("restore_mail_template", {
    p_key: key,
    p_locale: locale,
    p_subject: subject,
    p_body_md: body,
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: (data ?? 0) as number };
}

export type Fassung = {
  changed_at: string;
  changed_by: string | null;
  subject_before: string | null;
  body_before: string | null;
  version_after: number | null;
};

export async function loadHistory(key: string, locale: string): Promise<Fassung[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("mail_template_history", {
    p_key: key,
    p_locale: locale,
  });
  if (error) {
    console.error("[admin/mail/vorlagen] history:", error.message);
    return [];
  }
  return (data ?? []) as Fassung[];
}

/**
 * Vorschau mit **denselben** Funktionen, die der Versand benutzt.
 *
 * Eine Vorschau, die anders rendert als der Versand, ist schlimmer als keine:
 * sie erzeugt Vertrauen in etwas, das so nie ankommt. Deshalb `fillVars` und
 * `markdownToHtml` aus `lib/mail/render` und nicht der Markdown-Renderer des
 * Wikis, der andere Regeln hat.
 */
export async function previewTemplate(
  subject: string,
  body: string,
  vars: Record<string, string>,
): Promise<VorlageResult<{ subject: string; html: string }>> {
  await requireAdminSection("mail", PATH);
  return {
    ok: true,
    data: {
      subject: fillVars(subject, vars),
      html: markdownToHtml(fillVars(body, vars)),
    },
  };
}
