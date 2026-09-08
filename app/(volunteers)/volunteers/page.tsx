import { getSessionContext } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { AreaPlaceholder } from "@/components/layout/AreaPlaceholder";

export const dynamic = "force-dynamic";

export default async function VolunteersPage() {
  const { preferredLanguage } = await getSessionContext();
  const locale = await resolveLocale(preferredLanguage);
  return <AreaPlaceholder area="volunteers" locale={locale} />;
}
