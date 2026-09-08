import { resolveLocale } from "@/lib/i18n";
import { requireArea } from "@/lib/auth";
import { AreaPlaceholder } from "@/components/layout/AreaPlaceholder";

export const dynamic = "force-dynamic";

export default async function SpeakerPage() {
  await requireArea("speaker", "/speaker");
  const locale = await resolveLocale();
  return <AreaPlaceholder area="speaker" locale={locale} />;
}
