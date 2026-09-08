import { resolveLocale } from "@/lib/i18n";
import { requireArea } from "@/lib/auth";
import { AreaPlaceholder } from "@/components/layout/AreaPlaceholder";

export const dynamic = "force-dynamic";

export default async function VolunteersPage() {
  await requireArea("volunteers", "/volunteers");
  const locale = await resolveLocale();
  return <AreaPlaceholder area="volunteers" locale={locale} />;
}
