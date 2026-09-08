import { resolveLocale } from "@/lib/i18n";
import { requireArea } from "@/lib/auth";
import { AreaPlaceholder } from "@/components/layout/AreaPlaceholder";

export const dynamic = "force-dynamic";

export default async function SpeakerLeadsPage() {
  await requireArea("speaker-leads", "/speaker-leads");
  const locale = await resolveLocale();
  return <AreaPlaceholder area="speaker-leads" locale={locale} />;
}
