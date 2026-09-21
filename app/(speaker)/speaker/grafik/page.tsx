import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GrafikMaske } from "./GrafikMaske";
import type { SpeakerProfile } from "../types";

export const dynamic = "force-dynamic";

/** Dateiname ohne Sonderzeichen — er landet im Download-Ordner des Speakers. */
function dateiname(vorname: string | null, nachname: string | null): string {
  const name = [vorname, nachname].filter(Boolean).join("-").toLowerCase();
  const sauber = name
    .normalize("NFKD")
    // Ohne diese Zeile wird aus „Müller" ein „mu-ller": die Zerlegung trennt
    // den Umlaut in „u" und ein kombinierendes Trema, und das Trema fällt in
    // den nächsten Schritt (gefunden beim Bauen von SPK-014, 21.09.).
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sauber ? `hear-me-speak-${sauber}` : "hear-me-speak";
}

/**
 * „Deine Grafik" (SPK-013).
 *
 * Die Seite lädt nur den Namen für den Dateinamen; alles andere passiert im
 * Browser. Das Porträt verlässt den Rechner nicht.
 */
export default async function SpeakerGrafikPage() {
  await requireArea("speaker", "/speaker/grafik");
  const { t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.rpc("my_speaker_profile");
  const profile = (data ?? null) as SpeakerProfile | null;

  return (
    <div className="max-w-[1100px]">
      <PageHeader title={t.speakerGraphic.title} description={t.speakerGraphic.lead} />
      <GrafikMaske
        vorschlag={dateiname(profile?.person.first_name ?? null, profile?.person.last_name ?? null)}
        t={t.speakerGraphic}
      />
    </div>
  );
}
