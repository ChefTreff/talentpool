import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContactList } from "@/components/partner/ContactList";
import { getPartnerScope } from "../org";
import { canManageContacts, type PartnerContact, type PartnerOverview } from "../types";
import { removeContact, transferPrimary, updateContact, upsertContact } from "../actions";

export const dynamic = "force-dynamic";

export default async function PartnerContactsPage() {
  await requireArea("partner", "/partner/kontakte");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: contactRows }, { data: overviewJson }, vocab] = await Promise.all([
    supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    loadVocabMap(supabase, locale),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const contacts = (contactRows ?? []) as PartnerContact[];

  return (
    <>
      <PageHeader
        word={t.partner.wordTeam}
        title={t.partnerContacts.title}
        description={`${t.partnerContacts.lead} · ${contacts.length}`}
      />
      <ContactList
        orgId={current.org_id}
        contacts={contacts}
        // Verwalten darf nur der Hauptkontakt oder das Team — sonst zeigt die
        // Liste keine Knöpfe, statt sie in ein 42501 laufen zu lassen.
        canManage={canManageContacts(overview?.roles ?? [], overview?.team ?? false)}
        roleLabels={vgroup(vocab, "contact_role")}
        actions={{
          invite: upsertContact,
          update: updateContact,
          remove: removeContact,
          transferPrimary,
        }}
        dateLocale={t.meta.dateLocale}
        t={t.partnerContacts}
        common={{
          save: t.common.save,
          cancel: t.common.cancel,
          none: t.common.none,
          close: t.common.close,
          required: t.common.required,
        }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
