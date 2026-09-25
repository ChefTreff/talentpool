import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ZugaengeListe, type Konto } from "./ZugaengeListe";

export const dynamic = "force-dynamic";

const SEITE = 50;

/**
 * Zugänge (PORT4b): wer ein Konto hat, welche Rollen er trägt, und der Weg,
 * ihm den Zugang zu nehmen.
 *
 * **Gesperrt, nicht gelöscht.** „Alt-Systeme nur deaktivieren, nie löschen"
 * gilt auch für Menschen: wer geht, verliert den Zugang, nicht seine
 * Geschichte. Die Sperre ist ein Zeitstempel an der Person; `role_assignment`
 * wird nicht angefasst, damit das Entsperren genau wiederherstellt, was vorher
 * galt.
 */
export default async function ZugaengePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; seite?: string }>;
}) {
  const ctx = await requireAdminSection("access", "/admin/verwaltung/zugaenge");
  const { t } = await getI18n("de");
  const { q, seite: seiteRoh } = await searchParams;
  const suche = (q ?? "").trim();
  const seite = Math.max(1, Number(seiteRoh ?? "1") || 1);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("access_accounts", {
    p_query: suche || null,
    p_limit: SEITE,
    p_offset: (seite - 1) * SEITE,
  });
  const konten = (data ?? []) as Konto[];

  return (
    <>
      <PageHeader word={t.admin.words.access} title={t.accessAdmin.title} description={t.accessAdmin.lead} />
      <ZugaengeListe
        konten={konten}
        suche={suche}
        seite={seite}
        proSeite={SEITE}
        /** Die eigene Kennung: der Knopf zum Selbstsperren gehört gar nicht erst hin. */
        selbst={ctx.personId}
        t={t.accessAdmin as Record<string, string>}
        common={{ cancel: t.common.cancel, save: t.common.save }}
        rpcMessages={t.rpc as Record<string, string>}
      />
    </>
  );
}
