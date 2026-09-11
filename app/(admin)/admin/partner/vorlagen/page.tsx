import { partnerAdminShell } from "../shell";
import type { AdminTemplate } from "../types";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

/**
 * Vorlagen der Partner-Checkliste. Gelesen wird die Tabelle direkt (Team sieht
 * auch abgeschaltete), geschrieben nur über `upsert_deliverable_template`.
 */
export default async function AdminTemplatesPage() {
  const shell = await partnerAdminShell("/admin/partner/vorlagen");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [{ data: rows }, { data: products }] = await Promise.all([
    supabase
      .from("deliverable_template")
      .select(
        "id,key,product_sku,category,type,label_de,label_en,description_de,description_en,due_rule,file_rules,required,audience_roles,sort,active,answers_schema,fulfilled_by_sku",
      )
      .order("sort")
      .order("key"),
    supabase.from("product").select("sku,name_de,name_en").eq("active", true).order("sku"),
  ]);

  const templates = (rows ?? []) as AdminTemplate[];
  const skus = ((products ?? []) as { sku: string; name_de: string | null; name_en: string | null }[])
    .map((p) => ({
      value: p.sku,
      label: `${p.sku} · ${(locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? ""}`,
    }));

  return frame(
    t.adminPartner.templatesTitle,
    `${t.adminPartner.templatesLead} · ${templates.length}`,
    // Auch ohne Vorlagen sichtbar — sonst liesse sich die erste nie anlegen.
    <TemplateEditor
      templates={templates}
      skus={skus}
      t={t.adminPartner}
      common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
      rpcMessages={t.rpc}
    />,
  );
}
