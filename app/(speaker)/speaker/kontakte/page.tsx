import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { SpeakerProfile } from "../types";
import { KontakteSeite } from "./KontakteSeite";

export const dynamic = "force-dynamic";

/**
 * „Deine Kontakte“ als eigener Menüpunkt (SPK-089, Feedbackrunde Konrad und Paulina 05.10.2026): Assistenz, Agentur und Office hatten bisher
 * einen kleinen Abschnitt am Ende des Profils („einen Ticken zu klein“, Paulina). Jetzt eine eigene Seite mit der Liste und dem Anlegen; beim
 * Anlegen ist die Frage „Darf sich diese Person im Portal anmelden und dein Profil bearbeiten?“ Pflicht — „Ja“ schickt wie bisher die
 * Einladung per E-Mail. Die Rechte bleiben die der Datenbank (`upsert_speaker_contact`: nur die Speakerin selbst und das Team); die
 * Assistenz sieht die Liste nur lesend.
 */
export default async function SpeakerKontaktePage() {
  await requireArea("speaker", "/speaker/kontakte");
  const { t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.rpc("my_speaker_profile");
  const profile = (data ?? null) as SpeakerProfile | null;

  const kopf = (
    <PageHeader word={t.speaker.wordBackstage} title={t.speaker.sectionContacts} description={t.speaker.contactsPageLead} />
  );
  if (!profile) {
    return (
      <>
        {kopf}
        <EmptyState title={t.speaker.noProfileTitle} description={t.speaker.noProfileBody} />
      </>
    );
  }

  return (
    <div className="max-w-text">
      {kopf}
      <KontakteSeite
        profile={profile}
        t={t.speaker}
        common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    </div>
  );
}
