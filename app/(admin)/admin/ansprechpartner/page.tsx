import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { KB_AUDIENCES } from "@/components/wiki/types";
import { KontakteAdmin } from "./KontakteAdmin";
import type { AdminKontakt, AdminInfo } from "./types";

export const dynamic = "force-dynamic";

/**
 * Ansprechpartner und allgemeine Auskünfte je Edition (F9.1).
 *
 * Das Gate lässt das Admin-Team herein; **ob** jemand ändern darf, entscheidet
 * `can_edit_edition_contacts()` in SQL — Admin oder die Bereichsleitung
 * Partner bzw. Speaker. Die Seite prüft das nicht selbst nach.
 */
export default async function AnsprechpartnerPage() {
  await requireArea("admin", "/admin/ansprechpartner");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: kontakte }, { data: infos }, vocab] = await Promise.all([
    supabase.rpc("edition_contacts_admin"),
    supabase.rpc("edition_infos_admin"),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader title={t.contacts.adminTitle} description={t.contacts.adminLead} />
      <KontakteAdmin
        kontakte={(kontakte ?? []) as AdminKontakt[]}
        infos={(infos ?? []) as AdminInfo[]}
        types={vgroup(vocab, "edition_contact_type")}
        audiences={Object.fromEntries(KB_AUDIENCES.map((a) => [a, a]))}
        t={t.contacts}
        common={{
          save: t.common.save,
          cancel: t.common.cancel,
          delete: t.common.delete,
          upload: t.common.upload,
          chooseOtherFile: t.common.chooseOtherFile,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
