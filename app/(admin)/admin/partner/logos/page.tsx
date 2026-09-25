import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export type LogoZeile = {
  org_id: string; org_edition_id: string; org_name: string; sponsoring_level: string | null;
  vektor_datei: string | null; vektor_status: string | null; vektor_seit: string | null;
  pixel_datei: string | null; einwilligung: string | null;
  druckbar: boolean; fehlt: string | null;
};

/**
 * Logo-Produktionsliste für die Foto-Wand (ADM-048).
 *
 * **Die Umkehrung ist der Sinn der Seite.** Eine Liste der vorhandenen Logos
 * verhindert das Vergessen nicht — sie sieht nur vollständig aus, weil die
 * Fehlenden gar nicht darin stehen. Hier steht **jeder Partner der Edition**,
 * und was fehlt, ist eine leere Zelle mit einem Satz daneben, der sagt, was zu
 * tun ist.
 *
 * Die Logokategorie fehlt absichtlich: sie ist ein eigenes Feld (ADM-046) und
 * noch nicht gebaut. Sie hier aus dem Sponsoring-Level abzuleiten hiesse, der
 * Druckerei eine Angabe zu liefern, die später nicht stimmt.
 */
export default async function LogoWandPage() {
  await requireAdminSection("logoWall", "/admin/partner/logos");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("partner_logo_production");
  const zeilen = (data ?? []) as LogoZeile[];
  const fertig = zeilen.filter((z) => z.druckbar).length;

  return (
    <>
      <PageHeader word={t.admin.words.logoWall} title={t.logoWall.title} description={t.logoWall.lead} />

      {zeilen.length === 0 ? (
        <EmptyState title={t.logoWall.empty} description={t.logoWall.emptyBody} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="ct-label text-ink">
              {t.logoWall.summary.replace("{n}", String(fertig)).replace("{gesamt}", String(zeilen.length))}
            </p>
            <Link className="ct-link ct-small" href="/admin/partner/logos/csv">{t.logoWall.csv}</Link>
          </div>
          <Card>
            <ul className="flex flex-col divide-y">
              {zeilen.map((z) => (
                <li key={z.org_edition_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className="ct-label text-ink">{z.org_name}</span>
                  {z.sponsoring_level && <span className="ct-help">{z.sponsoring_level}</span>}
                  {/* Leere Zelle statt Auslassung: dass hier nichts steht, ist
                      die Information. */}
                  <span className="ct-help">{z.vektor_datei ?? "—"}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Badge tone={z.einwilligung ? "success" : "warning"}>
                      {z.einwilligung ? t.logoWall.consentYes : t.logoWall.consentNo}
                    </Badge>
                    <Badge tone={z.druckbar ? "success" : "warning"}>
                      {z.druckbar ? t.logoWall.printable : t.logoWall.notPrintable}
                    </Badge>
                    {z.fehlt && <span className="ct-help">{z.fehlt}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="ct-help mt-4">{t.logoWall.hintCategory}</p>
        </>
      )}
    </>
  );
}
