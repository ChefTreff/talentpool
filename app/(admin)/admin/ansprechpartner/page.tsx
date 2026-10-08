import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { KontakteAdmin } from "./KontakteAdmin";
import type { AdminKontakt } from "./types";

export const dynamic = "force-dynamic";

/**
 * Ansprechpartner je Edition (F9.1). Die „allgemeinen Auskünfte“ gibt es nicht mehr (ADM-100, Migration `v6_auskuenfte_weg`).
 *
 * Das Gate lässt das Admin-Team herein; **ob** jemand ändern darf, entscheidet
 * `can_edit_edition_contacts()` in SQL — Admin oder die Bereichsleitung
 * Partner bzw. Speaker. Die Seite prüft das nicht selbst nach.
 */
export default async function AnsprechpartnerPage() {
  await requireAdminSection("contacts", "/admin/ansprechpartner");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: kontakte }, vocab] = await Promise.all([
    supabase.rpc("edition_contacts_admin"),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader word={t.admin.words.contacts} title={t.contacts.adminTitle} description={t.contacts.adminLead} />
      <KontakteAdmin
        kontakte={(kontakte ?? []) as AdminKontakt[]}
        types={vgroup(vocab, "edition_contact_type")}
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
