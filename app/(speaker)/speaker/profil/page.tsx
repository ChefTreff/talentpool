import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhotoUpload } from "./PhotoUpload";
import { SpeakerProfileForm } from "./SpeakerProfileForm";
import { SPEAKER_BUCKET, type SpeakerProfile } from "../types";

export const dynamic = "force-dynamic";

/** Wie lange die Adresse des Fotos gilt — lang genug zum Ansehen, nicht zum Teilen. */
const PHOTO_URL_SECONDS = 300;

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

  // Das Foto liegt im privaten Bucket; die Adresse wird hier signiert, damit
  // der Browser kein Storage-Token braucht. Fehlt das Bild oder scheitert die
  // Signatur, zeigt die Karte den Leerzustand — kein kaputtes Bild.
  const { data: assetRows } = await supabase.rpc("my_speaker_assets", {
    p_profile_id: profile.id,
  });
  const photo = ((assetRows ?? []) as { kind: string; is_current: boolean; storage_path: string }[])
    .find((a) => a.kind === "photo" && a.is_current) ?? null;
  let photoUrl: string | null = null;
  if (photo) {
    const { data: signed } = await supabase.storage
      .from(SPEAKER_BUCKET)
      .createSignedUrl(photo.storage_path, PHOTO_URL_SECONDS);
    photoUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="max-w-[800px]">
      <PageHeader title={t.speaker.profileTitle} description={t.speaker.profileLead} />
      {/* Das Foto steht vor dem Formular: es ist der Schritt, den die
          Startseite als offen führt, und der kürzeste Weg zum Erfolgserlebnis. */}
      <div className="mb-6">
        <PhotoUpload
          profileId={profile.id}
          editionId={profile.edition_id}
          photoUrl={photoUrl}
          t={t.speaker}
          rpcMessages={t.rpc}
        />
      </div>
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
