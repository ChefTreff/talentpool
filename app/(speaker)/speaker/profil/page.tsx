import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpeakerProfileForm } from "./SpeakerProfileForm";
import type { SpeakerProfile } from "../types";

export const dynamic = "force-dynamic";

export default async function SpeakerProfilPage() {
  await requireArea("speaker", "/speaker/profil");
  const { t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.rpc("my_speaker_profile");
  const profile = (data ?? null) as SpeakerProfile | null;

  if (!profile) {
    return (
      <>
        <PageHeader title={t.speaker.profileTitle} description={t.speaker.profileLead} />
        <EmptyState title={t.speaker.noProfileTitle} description={t.speaker.noProfileBody} />
      </>
    );
  }

  return (
    <div className="max-w-[800px]">
      <PageHeader title={t.speaker.profileTitle} description={t.speaker.profileLead} />
      <SpeakerProfileForm
        profile={profile}
        t={t.speaker}
        common={{
          cancel: t.common.cancel,
          choose: t.common.choose,
          none: t.common.none,
          required: t.common.required,
          save: t.common.save,
          saving: t.common.saving,
        }}
        rpcMessages={t.rpc}
      />
    </div>
  );
}
