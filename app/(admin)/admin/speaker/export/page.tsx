import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { BERICHTE, VORSCHAU_ZEILEN, baueBericht, spaltenGruppen, waehleBericht, waehleSpalten } from "@/lib/speaker/export-berichte";
import { exportKontext, ladeBericht } from "@/lib/speaker/export-daten";
import { BerichteAnsicht, type SpaltenGruppe, type Vorschau } from "./BerichteAnsicht";

export const dynamic = "force-dynamic";

/**
 * Berichte und Export im Speaker-Admin (ADM-078).
 *
 * Konrad am 05.10. (To-do aus der Feedbackrunde): „eine Exportsektion im Speaker-Admin hinzufügen, wo man sich verschiedene Berichte zusammenstellen und sehen kann“;
 * Paulina: „eine riesige Excel, wo alle Daten auf einen Blick drin sind … ein Final Check“. Drei Berichte aus vorhandenen Quellen, die Spalten wählbar, die Vorschau
 * und die Datei aus **derselben** Tabelle (`baueBericht`); der Download steht unter `/admin/speaker/export/datei` und schreibt ins Audit-Log.
 *
 * Erreichbar über den Knopf „Berichte und Export“ auf `/admin/speaker` — **kein neuer Menüpunkt** vor Konrads Go zur Admin-Struktur (K-95), wie bei den
 * Aufgaben der Checkliste (ADM-067). Wer welche Daten lesen darf, entscheidet je Bericht die Datenbank (`manager_speakers`, `hospitality_admin_overview`,
 * `programme_board`); verweigert sie, zeigt die Seite das, statt eine leere Tabelle als „es gibt nichts“ auszugeben.
 */
export default async function SpeakerBerichtePage({
  searchParams,
}: {
  searchParams: Promise<{ bericht?: string | string[]; spalten?: string | string[] }>;
}) {
  await requireAdminSection("speakers", "/admin/speaker/export");
  const params = await searchParams;
  const bericht = waehleBericht(params.bericht);
  const { locale, t } = await getI18n("de");
  const ta = t.adminSpeakerExport as Record<string, string>;
  const supabase = await createSupabaseServerClient();

  const [daten, vocab] = await Promise.all([ladeBericht(supabase, bericht, locale), loadVocabMap(supabase, locale)]);

  const gruppen: SpaltenGruppe[] = spaltenGruppen(bericht).map((g) => ({
    gruppe: g.gruppe,
    label: ta[`group_${g.gruppe}`] ?? g.gruppe,
    spalten: g.spalten.map((s) => ({ key: s.key, label: ta[`col_${bericht}_${s.key}`] ?? s.key })),
  }));

  let vorschau: Vorschau | null = null;
  if (daten.ok) {
    const k = exportKontext(vocab, ta, t.admin.hospitality, locale);
    const { tabelle } = baueBericht(daten.roh, params.spalten, k, (b, key) => ta[`col_${b}_${key}`] ?? key);
    vorschau = { kopf: tabelle.kopf, zeilen: tabelle.zeilen.slice(0, VORSCHAU_ZEILEN), gesamt: tabelle.zeilen.length, max: VORSCHAU_ZEILEN };
  }

  return (
    <>
      <PageHeader word={t.admin.words.speakers} title={ta.title} description={ta.lead} />
      <BerichteAnsicht
        bericht={bericht}
        tabs={BERICHTE.map((b) => ({ href: `/admin/speaker/export?bericht=${b}`, label: ta[`report_${b}`], aktiv: b === bericht }))}
        hinweis={ta[`reportHint_${bericht}`]}
        gruppen={gruppen}
        gewaehlt={waehleSpalten(bericht, params.spalten)}
        vorschau={vorschau}
        fehler={daten.ok ? null : daten.grund}
        t={ta}
      />
    </>
  );
}
