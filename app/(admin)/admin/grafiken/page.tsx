import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GrafikenView } from "./GrafikenView";
import type { Bild, SessionZeile } from "./types";

export const dynamic = "force-dynamic";

/** Wie lange eine Vorschau-URL gilt. Lang genug zum Arbeiten, kurz genug zum Vergessen. */
const URL_GUELTIG_SEKUNDEN = 60 * 30;

/**
 * Bilder am Auftritt: Bühnenfotos und Slot-Grafiken.
 *
 * Die Vorschau-Links entstehen **hier**, nicht in der Datenbank: signierte URLs
 * sind kurzlebig und gehören nicht in eine Tabelle, die man später exportiert.
 */
export default async function AdminGrafikenPage() {
  await requireAdminSection("graphics", "/admin/grafiken");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: sessionRows, error }, { data: assetRows }] = await Promise.all([
    supabase.rpc("sessions_for_assets"),
    supabase.rpc("session_assets_admin"),
  ]);

  // 42501 heisst: dieses Konto pflegt keine Bilder. Kein Fehler, sondern eine
  // Antwort — die Seite zeigt den Leerzustand.
  if (error) {
    return (
      <>
        <PageHeader word={t.admin.words.graphics} title={t.adminGrafiken.title} description={t.adminGrafiken.lead} />
        <EmptyState title={t.adminGrafiken.noAccessTitle} description={t.adminGrafiken.noAccessBody} />
      </>
    );
  }

  const bilder = (assetRows ?? []) as Bild[];
  const pfade = bilder.map((b) => b.storage_path);
  const { data: urls } = pfade.length
    ? await supabase.storage.from("session-assets").createSignedUrls(pfade, URL_GUELTIG_SEKUNDEN)
    : { data: [] };
  const nachPfad = new Map((urls ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));

  return (
    <>
      <PageHeader word={t.admin.words.graphics} title={t.adminGrafiken.title} description={t.adminGrafiken.lead} />
      <GrafikenView
        sessions={(sessionRows ?? []) as SessionZeile[]}
        bilder={bilder.map((b) => ({ ...b, url: nachPfad.get(b.storage_path) ?? null }))}
        dateLocale={t.meta.dateLocale}
        t={t.adminGrafiken}
        common={{ none: t.common.none }}
      />
    </>
  );
}
