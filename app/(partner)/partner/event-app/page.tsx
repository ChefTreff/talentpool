import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmbedGate } from "@/components/ui/EmbedGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { loadVideo, loomEmbedUrl } from "@/components/video/load";
import { getPartnerScope } from "../org";
import { Schritte } from "./Schritte";

export const dynamic = "force-dynamic";

/** Adresse der Event-App. Swapcard, je Edition dieselbe Anmeldung. */
const APP_URL = "https://app.swapcard.com";

/**
 * Event-App (F9.8). Die Seite fehlte ganz — der F4-Abgleich hatte sie als
 * zweitteuerste Lücke geführt.
 *
 * Sie erklärt und führt zu Swapcard; sie bildet die App **nicht** nach. Das
 * ist Absicht: was in Swapcard passiert, gehört dorthin, und eine halbe Kopie
 * hier wäre eine zweite Wahrheit, die niemand pflegt.
 *
 * Die sechs Schritte sind Konrads Wortlaut aus dem alten Portal. Sie sind
 * **nicht** abhakbar — wir können nicht sehen, was jemand in Swapcard getan
 * hat, und ein Haken, der nichts prüft, behauptet mehr, als wir wissen.
 */
export default async function EventAppPage() {
  await requireArea("partner", "/partner/event-app");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const video = await loadVideo("partner_event_app", "partner", current.edition_id);
  const s = t.partnerEventApp;

  return (
    <>
      <PageHeader title={s.title} description={s.lead} />

      <Card className="mb-8">
        <h2 className="ct-h3 text-ink">{s.appTitle}</h2>
        <p className="ct-small mt-1 leading-6">{s.appBody}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ButtonLink href={APP_URL} target="_blank" rel="noreferrer noopener">
            {s.appAction}
          </ButtonLink>
          <Link className="ct-link ct-small" href="/partner/wiki">
            {s.wikiHint}
          </Link>
        </div>
      </Card>

      <Schritte title={s.stepsTitle} lead={s.stepsLead} steps={s.steps} />

      {video && (
        <div className="mt-8 max-w-[640px]">
          <EmbedGate
            src={loomEmbedUrl(video.url)}
            title={(locale === "en" ? video.title_en : video.title_de) ?? s.videoTitle}
            provider="Loom"
            loadLabel={t.common.loadVideo}
            notice={t.common.embedNotice}
            openLabel={t.common.openAtProvider}
          />
        </div>
      )}
    </>
  );
}
