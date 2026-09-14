import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmbedGate } from "@/components/ui/EmbedGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { loadVideo, loomEmbedUrl } from "@/components/video/load";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type PartnerOverview } from "../types";
import { Schritte, type SchrittStand } from "./Schritte";

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
 * Die sechs Schritte sind Konrads Wortlaut aus dem alten Portal. Sie sind seit
 * dem 14.09. abhakbar (Migration 0093) — als Selbstauskunft, nicht als
 * Nachweis, und in der Datenbank, damit die Produktion den Stand sieht.
 */
export default async function EventAppPage() {
  await requireArea("partner", "/partner/event-app");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: standRows }, { data: overviewJson }, video] = await Promise.all([
    supabase.rpc("my_org_steps", {
      p_org_id: current.org_id,
      p_topic: "event_app",
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    loadVideo("partner_event_app", "partner", current.edition_id),
  ]);
  const stand = (standRows ?? []) as SchrittStand[];
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const s = t.partnerEventApp;
  // `steps` ist eine Liste, alles andere sind Texte — die Komponente bekommt
  // beides getrennt, sonst passt der Wörterbuchtyp nicht.
  const { steps, ...texte } = s;

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

      <Schritte
        orgId={current.org_id}
        editionId={current.edition_id}
        steps={steps}
        stand={stand}
        canEdit={overview ? canEditOnboarding(overview.roles, overview.team) : false}
        dateLocale={t.meta.dateLocale}
        t={texte}
        rpcMessages={t.rpc}
      />

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
