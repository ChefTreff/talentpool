import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { icsCalendar, icsFileName, type IcsEvent } from "@/lib/ics";
import { portalUrl } from "@/lib/mail/portal-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MyReception } from "@/app/(speaker)/speaker/types";
import type { MySession } from "@/app/(speaker)/speaker/session/types";

export const dynamic = "force-dynamic";

/** Domäne der UIDs, solange `NEXT_PUBLIC_SITE_URL` fehlt (lokale Entwicklung). */
const UID_HOST = "portal.chef-treff.de";

/**
 * Die eigenen Termine als `.ics` (SPK-014).
 *
 * Ohne Parameter kommt alles, was ansteht; `?session=<id>` und
 * `?reception=<id>` liefern einen einzelnen Termin — das brauchen die Knöpfe
 * an der Session und an der Reception.
 *
 * **Keine neue Rechtefläche.** Die Route liest ausschliesslich
 * `my_sessions()` und `my_receptions()`; beide geben von sich aus nur her, was
 * der angemeldeten Person gehört. Ein fremder oder erfundener Parameter kann
 * die Menge deshalb nur verkleinern, nie erweitern — er filtert die eigenen
 * Zeilen, er holt keine anderen.
 *
 * **Nur zugesagte Receptions.** Einen Termin in den Kalender zu schreiben, den
 * man abgesagt hat, wäre falsch; einen, den man noch nicht beantwortet hat,
 * wäre aufdringlich. Wer zusagt, bekommt ihn — und wer wieder absagt, löscht
 * ihn selbst: eine Absage kann einen fremden Kalender nicht aufräumen.
 *
 * **Kein Versand.** Konrad am 17.09.: „schon aufsetzen, Versand erst im
 * finalen Test." Die Datei entsteht hier auf Abruf. Sie an eine Mail zu
 * hängen, geht ohnehin erst, wenn der Worker Anhänge kann
 * (`docs/mail-plan.md`, Abschnitt „Offen").
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  await requireArea("speaker", `/api/speaker/kalender${url.search}`);

  const nurSession = url.searchParams.get("session");
  const nurReception = url.searchParams.get("reception");
  const einzeln = Boolean(nurSession || nurReception);

  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const basis = portalUrl();
  const host = basis ? new URL(basis).host : UID_HOST;

  const [{ data: sessionRows }, { data: receptionRows }] = await Promise.all([
    supabase.rpc("my_sessions"),
    supabase.rpc("my_receptions"),
  ]);

  const events: IcsEvent[] = [];

  if (!nurReception) {
    for (const s of (sessionRows ?? []) as MySession[]) {
      if (!s.start_at) continue; // ohne Slot gibt es keinen Termin
      if (nurSession && s.session_id !== nurSession) continue;
      const titel =
        (locale === "de" ? s.title_de : s.title_en) ?? s.title_de ?? s.title_en ?? t.speaker.untitled;
      events.push({
        uid: `slot-${s.session_id}@${host}`,
        start: new Date(s.start_at),
        end: s.end_at ? new Date(s.end_at) : null,
        summary: s.event_name ? `${titel} · ${s.event_name}` : titel,
        location: [s.stage_name, s.room].filter(Boolean).join(", ") || null,
        description: mitLink(t.speakerCalendar.slotNote, basis, "/speaker/session"),
        url: basis ? `${basis}/speaker/session` : null,
      });
    }
  }

  if (!nurSession) {
    for (const r of (receptionRows ?? []) as MyReception[]) {
      if (r.my_status !== "yes") continue;
      if (nurReception && r.id !== nurReception) continue;
      const titel = (locale === "en" ? r.title_en : r.title_de) || r.title_de;
      const text = locale === "en" ? r.description_en : r.description_de;
      events.push({
        uid: `reception-${r.id}@${host}`,
        start: new Date(r.starts_at),
        end: r.ends_at ? new Date(r.ends_at) : null,
        summary: titel,
        location: [r.location, r.address].filter(Boolean).join(", ") || null,
        description: [text, mitLink(t.speakerCalendar.receptionNote, basis, "/speaker")]
          .filter(Boolean)
          .join("\n\n"),
        url: basis ? `${basis}/speaker` : null,
      });
    }
  }

  // Ein gezielt angefragter Termin, den es nicht (mehr) gibt, ist ein echtes
  // „nicht gefunden" — eine leere Kalenderdatei sähe aus wie ein Fehler.
  if (einzeln && events.length === 0) {
    return new Response("not found", { status: 404 });
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  const name = icsFileName(events.length === 1 ? events[0].summary : "fls27");
  return new Response(icsCalendar(events), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      // Persönliche Termine gehören in keinen geteilten Zwischenspeicher.
      "cache-control": "private, no-store",
    },
  });
}

/** Den Hinweistext um den Portallink ergänzen, sofern es einen gibt. */
function mitLink(text: string, basis: string | null, pfad: string): string {
  return basis ? `${text}\n${basis}${pfad}` : text;
}
