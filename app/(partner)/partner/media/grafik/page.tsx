import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getDictionary, getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MeetUsAt, type Kontakt } from "@/components/partner/MeetUsAt";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../../org";
import { orgLabel, type PartnerAsset, type PartnerContact } from "../../types";

export const dynamic = "force-dynamic";

/** Lange genug, um die Seite zu benutzen, kurz genug, um den Link zu vergessen. */
const URL_GUELTIG_SEKUNDEN = 60 * 60;

/**
 * „Meet us at“-Grafik (PART-096, Konrad 02.10.): der Partner erzeugt seine
 * Grafik selbst — mit dem Logo aus dem Onboarding oder mit einer
 * Ansprechperson und ihrem Porträt, in Quadrat, Hochformat und Story, auf
 * Deutsch oder Englisch.
 *
 * Die Seite liefert nur, was aus der Datenbank kommt: Firmenname, das aktuelle
 * PNG-Logo (als kurzlebige signierte Adresse, nur zum Lesen), die Kontakte der
 * Organisation und die Tage des Summits. Gezeichnet wird im Browser; nichts von
 * dem, was dort entsteht, kommt zurück.
 *
 * Das Media Kit (`/partner/media`) bleibt der Ort für alles, was das Marketing
 * bereitstellt; die selbst erzeugte Grafik ergänzt es.
 */
export default async function PartnerMeetUsAtPage() {
  await requireArea("partner", "/partner/media/grafik");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();
  const s = t.partnerMeetUs;

  const supabase = await createSupabaseServerClient();
  const [{ data: assetRows }, { data: kontaktRows }, { data: event }] = await Promise.all([
    supabase.rpc("my_partner_assets", { p_org_id: current.org_id, p_edition_id: current.edition_id }),
    supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
    supabase.from("event").select("start_date,end_date").eq("id", current.edition_id).maybeSingle(),
  ]);

  // Das aktuelle PNG-Logo, das nicht abgelehnt ist (die Pflicht `logo_png`, 0057).
  const logoAsset =
    ((assetRows ?? []) as PartnerAsset[]).find((a) => a.kind === "logo_png" && a.is_current && a.status !== "rejected") ??
    null;
  const logoUrl = logoAsset
    ? ((await supabase.storage.from("partner-assets").createSignedUrl(logoAsset.storage_path, URL_GUELTIG_SEKUNDEN)).data
        ?.signedUrl ?? null)
    : null;

  // Nur Name und Position gehen an den Browser — die Adresse braucht die Grafik nicht.
  const kontakte: Kontakt[] = ((kontaktRows ?? []) as PartnerContact[])
    .map((k) => ({
      id: k.person_id,
      name: [k.first_name, k.last_name].filter(Boolean).join(" ").trim(),
      rolle: (k.contact_position ?? k.title ?? "").trim(),
    }))
    .filter((k) => k.name);

  return (
    <>
      <PageHeader word={t.partner.wordVisibility} title={s.title} description={s.lead} />
      <p className="mb-6">
        <Link href="/partner/media" className="ct-link">
          {s.back}
        </Link>
      </p>
      <MeetUsAt
        // Je Organisation ein eigener Zustand: wechselt der Partner die Organisation, bleibt nichts von der anderen stehen.
        key={current.org_id}
        orgName={orgLabel(current)}
        logo={logoAsset && logoUrl ? { url: logoUrl, name: logoAsset.filename ?? "logo.png" } : null}
        kontakte={kontakte}
        edition={{ start: event?.start_date ?? null, ende: event?.end_date ?? null }}
        portalSprache={locale === "en" ? "en" : "de"}
        t={s}
        texte={{ de: getDictionary("de").meetUsAtGrafik, en: getDictionary("en").meetUsAtGrafik }}
      />
    </>
  );
}
