"use server";

import { revalidatePath } from "next/cache";
import { requireAnyAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { fillVars, markdownToHtml } from "@/lib/mail/render";

/**
 * Mail-Vorlagen pflegen. Seit ADM-102 prüfen die RPCs **je Schlüssel**, ob die Person die Kategorie der Vorlage
 * bearbeiten darf (`can_edit_mail_template`): ein Partner-Team ändert Partner-Mails, nicht Speaker-Mails. Das Gate hier
 * ist die Tür zur Seite (irgendein Vorlagen-Abschnitt), die Datenbank ist die Grenze je Vorlage.
 */
const PATH = "/admin/mail/vorlagen";
const ABSCHNITTE = ["mail", "mailSpeaker", "mailPartner", "mailParticipants", "mailVolunteers"] as const;

export type VorlageResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; key: string; detail?: string };

function fail(error: unknown): { ok: false; key: string; detail?: string } {
  const f = toRpcFailure(error as never);
  if (f.key === "unknown" && f.raw) console.error("[admin/mail/vorlagen] RPC:", f.raw);
  return { ok: false, key: f.key, detail: f.detail };
}

async function client() {
  await requireAnyAdminSection(ABSCHNITTE, PATH);
  return createSupabaseServerClient();
}

/** Eine Sprachfassung, so wie `upsert_mail_template` sie annimmt. */
export type Fassungsdaten = { subject: string; body_md: string };

/**
 * Beide Sprachfassungen einer Vorlage **zusammen** speichern (ADM-102 e): eine Transaktion, je Sprache eigene Version und
 * eigener Protokolleintrag. `null` lässt die Sprache unverändert.
 */
export async function saveTemplatePair(
  key: string,
  de: Fassungsdaten | null,
  en: Fassungsdaten | null,
): Promise<VorlageResult<{ de: number | null; en: number | null }>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("upsert_mail_template_pair", { p_key: key, p_de: de, p_en: en });
  if (error) return fail(error);
  revalidatePath(PATH);
  const r = (data ?? {}) as { de?: number | null; en?: number | null };
  return { ok: true, data: { de: r.de ?? null, en: r.en ?? null } };
}

/** Anzeigename ändern (der Bereich) und — nur `admin` — Kategorie oder Platzhalter. */
export async function setTemplateMeta(
  key: string,
  meta: { category?: string; name_de?: string; name_en?: string },
): Promise<VorlageResult> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_mail_template_meta", {
    p_key: key,
    p_category: meta.category ?? null,
    p_name_de: meta.name_de ?? null,
    p_name_en: meta.name_en ?? null,
  });
  if (error) return fail(error);
  revalidatePath(PATH);
  return { ok: true, data: undefined };
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
  await requireAnyAdminSection(ABSCHNITTE, PATH);
  return {
    ok: true,
    data: {
      subject: fillVars(subject, vars),
      html: markdownToHtml(fillVars(body, vars)),
    },
  };
}
