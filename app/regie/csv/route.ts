import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { loadRegieCues } from "@/components/regie/load";

export const dynamic = "force-dynamic";

// Die Zelle kommt aus `lib/csv.ts`: sie verdoppelt nicht nur Anführungszeichen,
// sondern entschärft auch Formelanfänge. Der Ablaufplan enthält Freitext aus
// dem Portal (Moderation, Regie, Hinweise) und wird von Technikern in Excel
// geöffnet — derselbe Weg wie beim Shuttle-Export (Befund 18.09.).

/**
 * Der Ablaufplan als CSV — für Techniker und Stage Hands, die ihn in ihre
 * eigenen Listen übernehmen.
 *
 * Semikolon und BOM wie bei der Bestellliste, damit Excel auf deutschen
 * Rechnern die Spalten nicht in eine einzige quetscht. Wer welche Bühne sehen
 * darf, entscheidet `regie_view` (Migration 0101) — hier steht nur das Gate,
 * dass überhaupt jemand angemeldet ist.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stageId = url.searchParams.get("buehne");
  const dayId = url.searchParams.get("tag");
  await requireUser(`/regie/csv${url.search}`);
  if (!stageId || !dayId) return new Response("buehne und tag fehlen", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const [{ data: stage }, { data: day }, { cues }] = await Promise.all([
    supabase.from("stage").select("name").eq("id", stageId).maybeSingle(),
    supabase.from("event_day").select("day_date").eq("id", dayId).maybeSingle(),
    loadRegieCues(stageId, dayId),
  ]);
  if (!stage || !day) return new Response("nicht gefunden", { status: 404 });

  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const head = ["Von", "Bis", "Umbau (min)", "Aktion", "Titel", "Speaker", "Moderation", "Regie", "Backstage", "Personen auf der Bühne", "Mikrofon", "Medien", "Mobiliar", "Notiz"];
  const lines = [
    head.map(csvCell).join(";"),
    ...cues.map((c) =>
      [
        zeit.format(new Date(c.cue_start)),
        zeit.format(new Date(c.cue_end)),
        c.umbau_min ?? "",
        c.action,
        c.title ?? "",
        (c.speakers ?? [])
          .map((s) => [s.first_name, s.last_name].filter(Boolean).join(" "))
          .join(", "),
        c.moderation ?? "",
        c.regie ?? "",
        c.backstage ?? "",
        // Angaben der Stage Leads (LEAD-031); Mikrofon und Medien als Text aus dem jsonb.
        c.people_on_stage ?? "",
        typeof c.mic_assignments?.text === "string" ? c.mic_assignments.text : "",
        typeof c.media?.text === "string" ? c.media.text : "",
        c.mobiliar ?? "",
        c.notes ?? "",
      ]
        .map(csvCell)
        .join(";"),
    ),
  ];

  const slug = String(stage.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = `regie-${slug || "buehne"}-${day.day_date}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
