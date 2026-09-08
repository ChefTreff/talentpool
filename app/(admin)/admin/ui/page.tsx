import { getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { UiKitDemo } from "./UiKitDemo";

export const dynamic = "force-dynamic";

/**
 * Storybook-freie Referenzseite: alle Bausteine an einem Ort — für Reviews
 * (80-%-Prinzip) und als Vorlage beim Bau neuer Bereiche.
 */
export default async function UiKitPage() {
  const { preferredLanguage } = await getSessionContext();
  const { t } = await getI18n(preferredLanguage);

  return (
    <>
      <PageHeader title={t.admin.ui.title} description={t.admin.ui.lead} />
      <UiKitDemo
        t={{
          ...t.admin.ui,
          save: t.common.save,
          cancel: t.common.cancel,
          close: t.common.close,
          required: t.common.required,
          choose: t.common.choose,
          active: t.common.active,
        }}
      />
    </>
  );
}
