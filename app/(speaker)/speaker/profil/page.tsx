import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
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
        <PageHeader word={t.speaker.wordBio} title={t.speaker.profileTitle} description={t.speaker.profileLead} />
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
    <div className="max-w-text">
      <PageHeader word={t.speaker.wordBio} title={t.speaker.profileTitle} description={t.speaker.profileLead} />
      {/* Die Übersicht steht über dem Foto (SPK-065): sie ist der erste Anker der
          Seite und führt auch zum Foto (QS-026, QS-042). Die Ids gehören zu den
          Karten im Formular. */}
      <AbschnittsNavigation
        label={t.speaker.sectionsLabel}
        items={[
          { id: "foto", label: t.speaker.photoTitle },
          { id: "person", label: t.speaker.sectionPerson },
          { id: "auftritt", label: t.speaker.sectionAppearance },
          { id: "bio", label: t.speaker.sectionBio },
          { id: "socials", label: t.speaker.sectionSocials },
          { id: "kontakte", label: t.speaker.sectionContacts },
          { id: "consent", label: t.speaker.sectionConsent },
        ]}
      />
      {/* Das Foto steht vor dem Formular: es ist der Schritt, den die
          Startseite als offen führt, und der kürzeste Weg zum Erfolgserlebnis. */}
      <div id="foto" className="mb-6 scroll-mt-20">
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
