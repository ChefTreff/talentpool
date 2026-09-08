import { resolveLocale } from "@/lib/i18n";
import { requireArea } from "@/lib/auth";
import { AreaPlaceholder } from "@/components/layout/AreaPlaceholder";

export const dynamic = "force-dynamic";

export default async function ProduktionPage() {
  await requireArea("produktion", "/produktion");
  const locale = await resolveLocale();
  return <AreaPlaceholder area="produktion" locale={locale} />;
}
