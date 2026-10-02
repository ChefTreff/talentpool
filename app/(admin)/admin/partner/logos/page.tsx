import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ButtonDownload } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
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
 *
 * Als Tabelle, nicht als Zeilenliste (QS-065): Kategorie, Datei, Einwilligung und
 * Stand fluchten untereinander; unter 640 px stapelt `<Table stapeln>` die Zeilen.
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
          <Table stapeln>
            <Thead>
              <Th>{t.logoWall.colPartner}</Th>
              <Th>{t.logoWall.colLevel}</Th>
              <Th>{t.logoWall.colCategory}</Th>
              <Th>{t.logoWall.colVector}</Th>
              <Th>{t.logoWall.colConsent}</Th>
              <Th>{t.logoWall.colState}</Th>
              <Th>{t.logoWall.colMissing}</Th>
            </Thead>
            <Tbody>
              {zeilen.map((z) => (
                <Tr key={z.org_edition_id} controls>
                  <Td className="ct-label">{z.org_name}</Td>
                  <Td label={t.logoWall.colLevel} className="ct-help">{z.sponsoring_level ?? "—"}</Td>
                  <Td label={t.logoWall.colCategory}>
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
                  </Td>
                  {/* Leere Zelle statt Auslassung: dass hier nichts steht, ist
                      die Information. */}
                  <Td label={t.logoWall.colVector} className="ct-help break-all">{z.vektor_datei ?? "—"}</Td>
                  <Td label={t.logoWall.colConsent}>
                    <Badge tone={z.einwilligung ? "success" : "warning"}>
                      {z.einwilligung ? t.logoWall.consentYes : t.logoWall.consentNo}
                    </Badge>
                  </Td>
                  <Td label={t.logoWall.colState}>
                    <Badge tone={z.druckbar ? "success" : "warning"}>
                      {z.druckbar ? t.logoWall.printable : t.logoWall.notPrintable}
                    </Badge>
                  </Td>
                  <Td label={t.logoWall.colMissing} className="ct-help">{z.fehlt ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <p className="ct-help mt-4">{t.logoWall.hintCategory}</p>
        </>
      )}
    </>
  );
}
