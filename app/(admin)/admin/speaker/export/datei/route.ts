import { requireAdminSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap } from "@/lib/vocab";
import { baueBericht, tabelleAlsCsv, tabelleAlsXlsx, waehleBericht } from "@/lib/speaker/export-berichte";
import { exportKontext, ladeBericht } from "@/lib/speaker/export-daten";

export const dynamic = "force-dynamic";

/**
 * Der Download zu „Berichte und Export“ (ADM-078): dieselbe Tabelle wie die Vorschau (`baueBericht`), als Excel oder CSV.
 *
 * `?bericht=speaker|hotel|programm`, `?spalten=…` (mehrfach oder mit Komma; unbekannte Namen zählen nicht, ohne gültige Auswahl gilt die Vorgabe),
 * `?format=xlsx|csv`. Wer das darf, steht doppelt fest: das Bereichsgate hier und die Datenbank je Bericht (42501 → 403, kein Inhalt, kein Hinweis darauf, wie viele
 * es gäbe).
 *
 * **Audit:** ein Eintrag je Download mit Bericht, Format, den gewählten Spaltennamen und der Zeilenzahl — **keine Zeilen und keine Adressen**. Eine Liste mit allen
 * Speakern samt E-Mail ist ein Datenabzug; wer ihn gezogen hat, soll nachlesbar sein (Masterplan: Audit-Log für Admin-Aktionen). Der Eintrag entsteht erst, wenn die
 * Tabelle gebaut ist — ein verweigerter oder gescheiterter Abruf hinterlässt keinen.
 *
 * Als `<button formaction>` aufgerufen, nicht als `Link`: ein vorgeladener Link würde die Route samt Audit-Eintrag ausführen, ohne dass jemand klickt (PART-051).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  await requireAdminSection("speakers", `/admin/speaker/export${url.search ? `?${url.searchParams.toString()}` : ""}`);

  const bericht = waehleBericht(url.searchParams.get("bericht") ?? undefined);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const { locale, t } = await getI18n("de");
  const ta = t.adminSpeakerExport as Record<string, string>;
  const supabase = await createSupabaseServerClient();

  const [daten, vocab] = await Promise.all([ladeBericht(supabase, bericht, locale), loadVocabMap(supabase, locale)]);
  if (!daten.ok) {
    const status = daten.grund === "nicht_erlaubt" ? 403 : daten.grund === "keine_edition" ? 404 : 500;
    return new Response(daten.grund === "nicht_erlaubt" ? "not allowed" : daten.grund === "keine_edition" ? "not found" : "error", { status });
  }

  const k = exportKontext(vocab, ta, t.admin.hospitality, locale);
  const { gewaehlt, tabelle } = baueBericht(daten.roh, url.searchParams.getAll("spalten"), k, (b, key) => ta[`col_${b}_${key}`] ?? key);

  await logAudit({
    action: "speaker.export",
    objectType: "speaker_export",
    objectId: bericht,
    after: { format, spalten: gewaehlt, zeilen: tabelle.zeilen.length },
  });

  const name = `${bericht === "speaker" ? "speaker-gesamtliste" : bericht === "hotel" ? "hotelliste" : "programm-je-buehne"}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    return new Response(tabelleAlsCsv(tabelle), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  return new Response(await tabelleAlsXlsx(tabelle, ta[`report_${bericht}`] ?? bericht), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
