import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonDownload } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadActiveKeys, loadVocabMap, vgroup } from "@/lib/vocab";
import { KategorieWahl } from "./KategorieWahl";

export const dynamic = "force-dynamic";

export type LogoZeile = {
  org_id: string; org_edition_id: string; org_name: string; sponsoring_level: string | null;
  vektor_datei: string | null; vektor_status: string | null; vektor_seit: string | null;
  pixel_datei: string | null; einwilligung: string | null;
  druckbar: boolean; fehlt: string | null;
  /** ADM-046: nie leer — Feld am Partner, sonst aus der Stufe, sonst `official`. */
  logo_category: string; logo_category_source: "manual" | "level" | "fallback";
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
 * Die Logokategorie (ADM-046) steht je Partner und lässt sich hier setzen;
 * ohne eigenen Wert kommt sie aus der Sponsoring-Stufe, sonst ist sie
 * „Official" — dieselbe Ableitung wie für Website und Swapcard
 * (`logo_category_of`), damit die drei nie auseinanderlaufen. Die Liste ist
 * nach Kategorie sortiert, so wie gedruckt wird.
 */
export default async function LogoWandPage() {
  await requireAdminSection("logoWall", "/admin/partner/logos");
  const { t, locale } = await getI18n("de");
  const supabase = await createSupabaseServerClient();
  const [{ data }, vocab, aktiv] = await Promise.all([
    supabase.rpc("partner_logo_production"),
    loadVocabMap(supabase, locale),
    loadActiveKeys(supabase, "logo_category"),
  ]);
  const kategorien = vgroup(vocab, "logo_category");
  const optionen = Object.entries(kategorien)
    .filter(([key]) => aktiv.has(key))
    .map(([value, label]) => ({ value, label }));
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
            {/* Echter Download statt `Link` — sonst lädt Next die CSV-Route vor (Skill-Regel 3). */}
            <ButtonDownload href="/admin/partner/logos/csv" variant="ghost" size="sm">
              {t.logoWall.csv}
            </ButtonDownload>
          </div>
          <Card>
            <ul className="flex flex-col divide-y">
              {zeilen.map((z) => (
                <li key={z.org_edition_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className="ct-label text-ink">{z.org_name}</span>
                  {z.sponsoring_level && <span className="ct-help">{z.sponsoring_level}</span>}
                  <KategorieWahl
                    orgEditionId={z.org_edition_id}
                    wert={z.logo_category}
                    quelle={z.logo_category_source}
                    optionen={optionen}
                    t={{
                      label: t.logoWall.colCategory,
                      derived: t.logoWall.categoryDerived.replace("{kategorie}", kategorien[z.logo_category] ?? z.logo_category),
                      auto: t.logoWall.categoryAuto,
                      sourceLevel: t.logoWall.categoryFromLevel,
                      sourceFallback: t.logoWall.categoryFallback,
                      saved: t.common.saved,
                    }}
                    rpcMessages={t.rpc as Record<string, string>}
                  />
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
