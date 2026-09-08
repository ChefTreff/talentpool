import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { AreaKey } from "@/lib/areas";

/**
 * Platzhalter für Bereiche, deren Inhalte in einer späteren Welle kommen.
 * Er beweist, was Welle 0 liefert: Rollen-Gate, Umschalter, UI-Kit, DE/EN.
 */
export function AreaPlaceholder({
  area,
  locale,
}: {
  area: AreaKey;
  locale: Locale;
}) {
  const t = getDictionary(locale);
  return (
    <>
      <PageHeader
        eyebrow={t.placeholder.eyebrow}
        title={t.areas[area].name}
        description={t.areas[area].description}
      />
      <EmptyState
        title={t.placeholder.title}
        description={t.placeholder.body}
        action={
          <ButtonLink href="/" variant="secondary">
            {t.placeholder.backToStart}
          </ButtonLink>
        }
      />
    </>
  );
}
