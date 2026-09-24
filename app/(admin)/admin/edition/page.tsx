import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GeruestView } from "./GeruestView";
import type { Geruest } from "./types";

export const dynamic = "force-dynamic";

/**
 * Das Grundgerüst der Edition.
 *
 * `programme_skeleton()` prüft `is_programme_editor()` selbst — wer den
 * Admin-Bereich über eine andere Rolle betritt, bekommt hier nichts. Das Gate
 * der Seite ist also nicht die einzige Grenze, sondern die äussere.
 */
export default async function AdminEditionPage() {
  await requireAdminSection("edition", "/admin/edition");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("programme_skeleton");
  if (error || !data) notFound();
  const geruest = data as Geruest;

  const zeitraum = [geruest.event?.start_date, geruest.event?.end_date]
    .filter(Boolean)
    .join(" – ");

  return (
    <>
      <PageHeader
        title={t.adminEdition.title}
        description={[geruest.event?.name, zeitraum, geruest.event?.venue]
          .filter(Boolean)
          .join(" · ")}
      />
      <GeruestView
        geruest={geruest}
        t={t.adminEdition}
        common={{
          cancel: t.common.cancel,
          choose: t.common.choose,
          none: t.common.none,
          save: t.common.save,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
