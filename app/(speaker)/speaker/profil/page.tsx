import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { DietCard } from "@/components/diet/DietCard";
import { AbschnittsNavigation, Sektion } from "@/components/ui/Abschnitte";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhotoUpload } from "@/components/speaker/PhotoUpload";
import { registerSpeakerPhoto } from "../actions";
import { SpeakerProfileForm } from "./SpeakerProfileForm";
import { SPEAKER_BUCKET, type SpeakerProfile } from "../types";

export const dynamic = "force-dynamic";

/** Wie lange die Adresse des Fotos gilt — lang genug zum Ansehen, nicht zum Teilen. */
const PHOTO_URL_SECONDS = 300;

export default async function SpeakerProfilPage() {
  await requireArea("speaker", "/speaker/profil");
  const { locale, t } = await getI18n("en");
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

  // Die Ernährung steht im Profil (SPK-056, Konrad 24.09.: unter „Anreise"
  // passte sie nicht) — sie gehört zur Person, nicht zur Reise.
  // **Nicht für die Assistenz**: sie darf die Angabe nicht lesen, sähe ein
  // leeres Formular und würde beim Speichern eine hinterlegte Allergie
  // löschen. Deshalb wird sie für sie gar nicht erst geladen.
  const zeigtDiet = !profile.is_assistant;
  const [{ data: dietJson }, vocab, { data: stellvertretend }] = await Promise.all([
    zeigtDiet ? supabase.rpc("my_diet") : Promise.resolve({ data: null }),
    loadVocabMap(supabase, locale),
    // SPK-074 (K-40): im Verwaltet-Fall bestätigt der Kontakt mit Zugang stellvertretend.
    profile.is_assistant
      ? supabase.rpc("can_confirm_consent_on_behalf", { p_profile_id: profile.id })
      : Promise.resolve({ data: false }),
  ]);
  const diet = (dietJson ?? null) as { diet: string | null; diet_note: string | null } | null;

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
          // In der Reihenfolge der Seite: Ernährung, Einwilligungen, Kontakte.
          ...(zeigtDiet ? [{ id: "ernaehrung", label: t.diet.title }] : []),
          { id: "consent", label: t.speaker.sectionConsent },
          { id: "kontakte", label: t.speaker.sectionContacts },
        ]}
      />
      {/* Das Foto steht vor dem Formular: es ist der Schritt, den die
          Startseite als offen führt, und der kürzeste Weg zum Erfolgserlebnis. */}
      <div id="foto" className="mb-6 scroll-mt-20">
        <PhotoUpload
          profileId={profile.id}
          editionId={profile.edition_id}
          photoUrl={photoUrl}
          register={registerSpeakerPhoto}
          t={t.speaker}
          rpcMessages={t.rpc}
        />
      </div>
      <SpeakerProfileForm
        profile={profile}
        consentOnBehalf={stellvertretend === true}
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
        ernaehrung={
          zeigtDiet ? (
            <Sektion id="ernaehrung">
              <DietCard
                diet={diet?.diet ?? null}
                note={diet?.diet_note ?? null}
                path="/speaker/profil"
                options={vgroup(vocab, "diet")}
                t={t.diet}
                common={{ save: t.common.save, choose: t.common.choose }}
                rpcMessages={t.rpc}
              />
            </Sektion>
          ) : null
        }
      />
    </div>
  );
}
