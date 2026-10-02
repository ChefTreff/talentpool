import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { hasSanityConfig } from "@/lib/sanity/client";
import { speakerSchreibenErlaubt } from "@/lib/sanity/speakers";
import { WebsiteSpeaker } from "./WebsiteSpeaker";

export const dynamic = "force-dynamic";

/**
 * SPK-046: Speaker auf der Website (Sanity) — Vorschau und Übertragen per Knopf, nie automatisch.
 * Die Seite zeigt nur den Stand der Schalter; was übertragen würde, rechnet die Route
 * `POST /api/admin/sanity/speakers` nach derselben Abschnittsprüfung.
 */
export default async function AdminSpeakerWebsitePage() {
  await requireAdminSection("speakers", "/admin/speaker/website");
  const { t } = await getI18n();
  return (
    <>
      <PageHeader
        word={t.admin.words.speakers}
        title={t.adminSpeakerWebsite.title}
        description={t.adminSpeakerWebsite.lead}
        actions={
          <ButtonLink href="/admin/speaker" variant="ghost" size="sm">
            {t.adminSpeakerWebsite.back}
          </ButtonLink>
        }
      />
      <WebsiteSpeaker konfiguriert={hasSanityConfig()} schreibenErlaubt={speakerSchreibenErlaubt()} t={t.adminSpeakerWebsite} />
    </>
  );
}
