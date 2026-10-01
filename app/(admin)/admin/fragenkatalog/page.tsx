import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { KatalogView } from "./KatalogView";
import type { KatalogFrage } from "./types";

export const dynamic = "force-dynamic";

/**
 * Der Fragenkatalog (ADM-061).
 *
 * Bewerbungen auf Masterclasses, Company Tours und andere Formate stellen
 * Fragen aus diesem Katalog. Partner wählen nur, was hier als **für Partner
 * wählbar** freigegeben ist (PART-045). Gelöscht wird nicht — eine Frage, die
 * eine Session stellt, trägt gespeicherte Antworten; sie wird deaktiviert.
 */
export default async function FragenkatalogPage() {
  await requireAdminSection("questionCatalog", "/admin/fragenkatalog");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  // Lesen darf jede angemeldete Person (RLS `qc_read`) — der Katalog ist kein
  // Geheimnis. Die Zählung, welche Session eine Frage benutzt, läuft über den
  // Admin-Client: `session_question` ist sonst nur je Session sichtbar, und die
  // Rechte für diese Seite sind oben schon geprüft.
  const [{ data: fragen }, { data: nutzung }] = await Promise.all([
    supabase
      .from("question_catalog")
      .select("id, key, label_de, label_en, help_de, help_en, type, options, active, partner_selectable, sort_order")
      .order("sort_order")
      .order("key"),
    createSupabaseAdminClient().from("session_question").select("question_id").not("question_id", "is", null),
  ]);

  const zaehler = new Map<string, number>();
  for (const n of nutzung ?? []) zaehler.set(n.question_id, (zaehler.get(n.question_id) ?? 0) + 1);
  const liste: KatalogFrage[] = (fragen ?? []).map((f) => ({ ...f, in_use: zaehler.get(f.id) ?? 0 }) as KatalogFrage);
  const freigegeben = liste.filter((f) => f.active && f.partner_selectable).length;

  return (
    <>
      <PageHeader
        word={t.admin.words.questionCatalog}
        title={t.adminQuestionCatalog.title}
        description={t.adminQuestionCatalog.lead
          .replace("{n}", String(liste.length))
          .replace("{partner}", String(freigegeben))}
      />
      <KatalogView fragen={liste} t={t.adminQuestionCatalog} common={{ save: t.common.save, close: t.common.close, required: t.common.required }} rpcMessages={t.rpc} />
    </>
  );
}
