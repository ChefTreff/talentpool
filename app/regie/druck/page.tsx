import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadRegieCues } from "@/components/regie/load";

export const dynamic = "force-dynamic";

/**
 * Der Ablaufplan zum Ausdrucken — für Techniker und Stage Hands.
 *
 * Eigene Route **ausserhalb der Portale**, ohne Seitenleiste und ohne
 * Kopfzeile: was gedruckt wird, soll die Seite sein und nicht der Rahmen
 * darum. Erreichbar aus der Produktion und aus dem Lead-Portal.
 *
 * Das Gate ist `requireUser`; wer welche Bühne sehen darf, entscheidet
 * `regie_view` über `can_edit_regie` (Migration 0101). Fehlt das Recht, kommt
 * eine leere Liste zurück — dann gibt es hier 404 statt einer leeren Seite,
 * die aussieht, als gäbe es keinen Ablauf.
 */
export default async function RegieDruckPage({
  searchParams,
}: {
  searchParams: Promise<{ buehne?: string; tag?: string }>;
}) {
  const { buehne, tag } = await searchParams;
  await requireUser(`/regie/druck?buehne=${buehne ?? ""}&tag=${tag ?? ""}`);
  if (!buehne || !tag) notFound();

  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();
  const [{ data: stage }, { data: day }, { cues }] = await Promise.all([
    supabase.from("stage").select("name, room").eq("id", buehne).maybeSingle(),
    supabase.from("event_day").select("day_date, label_de").eq("id", tag).maybeSingle(),
    loadRegieCues(buehne, tag),
  ]);
  if (!stage || !day) notFound();

  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const datum = new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeZone: "Europe/Berlin" });
  const p = t.production;

  return (
    <main className="mx-auto max-w-275 bg-surface p-6 text-ink">
      <header className="mb-4 border-b pb-3">
        <h1 className="ct-h1">{stage.name}</h1>
        <p className="ct-small mt-1">
          {datum.format(new Date(`${day.day_date}T12:00:00`))}
          {day.label_de && ` · ${day.label_de}`}
          {stage.room && ` · ${stage.room}`}
        </p>
        <p className="ct-help mt-1">
          {t.leads.regiePrintedAt.replace(
            "{date}",
            new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(),
            ),
          )}
        </p>
      </header>

      {cues.length === 0 ? (
        <p className="ct-small">{t.leads.regieEmptyBody}</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th className="ct-label w-28 px-2 py-1.5">{p.colStart}</th>
              <th className="ct-label px-2 py-1.5">{p.colAction}</th>
              <th className="ct-label px-2 py-1.5">{p.colModeration}</th>
              <th className="ct-label px-2 py-1.5">{p.colRegie}</th>
              <th className="ct-label px-2 py-1.5">{p.colBackstage}</th>
              <th className="ct-label px-2 py-1.5">{p.colOnStage}</th>
              <th className="ct-label px-2 py-1.5">{p.colMobiliar}</th>
            </tr>
          </thead>
          <tbody>
            {cues.map((c) => (
              // `break-inside-avoid`: eine Zeile soll nicht über den Seitenrand
              // laufen — beim Ausdruck ist das der Unterschied zwischen lesbar
              // und unbrauchbar.
              <tr key={c.cue_id} className="break-inside-avoid border-b align-top">
                <td className="ct-small px-2 py-2 tabular-nums">
                  {zeit.format(new Date(c.cue_start))}–{zeit.format(new Date(c.cue_end))}
                  {c.umbau_min != null && (
                    <span className="ct-help block">+{c.umbau_min} min</span>
                  )}
                </td>
                <td className="ct-small px-2 py-2">
                  <span className="font-semibold">{c.action}</span>
                  {c.title && <span className="block">{c.title}</span>}
                  {(c.speakers ?? []).length > 0 && (
                    <span className="ct-help block">
                      {(c.speakers ?? [])
                        .map((s) => [s.first_name, s.last_name].filter(Boolean).join(" "))
                        .join(", ")}
                    </span>
                  )}
                </td>
                <td className="ct-small px-2 py-2">{c.moderation ?? ""}</td>
                <td className="ct-small px-2 py-2">{c.regie ?? ""}</td>
                <td className="ct-small px-2 py-2">{c.backstage ?? ""}</td>
                {/* Was die Stage Leads je Slot angeben (LEAD-012, LEAD-031) —
                    auf Papier, weil Technik und Stage Hands mit dem Ausdruck
                    arbeiten. Leere Angaben fallen weg. */}
                <td className="ct-small px-2 py-2">
                  {c.people_on_stage && <span className="block">{c.people_on_stage}</span>}
                  {text(c.mic_assignments) && (
                    <span className="block">
                      {p.colMic}: {text(c.mic_assignments)}
                    </span>
                  )}
                  {text(c.media) && (
                    <span className="block">
                      {p.colMedia}: {text(c.media)}
                    </span>
                  )}
                </td>
                <td className="ct-small px-2 py-2">
                  {c.mobiliar ?? ""}
                  {c.notes && (
                    <span className="ct-help block">
                      {p.colNotes}: {c.notes}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

/** Freitext aus einem jsonb-Feld der Regie (`{ text }`). */
function text(v: Record<string, unknown> | null | undefined): string {
  return typeof v?.text === "string" ? v.text : "";
}
