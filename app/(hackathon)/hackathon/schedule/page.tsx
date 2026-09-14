import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

type PublicSlot = {
  session_id: string;
  start_at: string;
  end_at: string;
  title_de: string | null;
  title_en: string | null;
  description_en: string | null;
  description_de: string | null;
  format: string | null;
  stage_name: string | null;
  room: string | null;
  day_date: string;
};

/**
 * Der Zeitplan des Hackathons.
 *
 * **Kein eigenes Datenmodell.** Der Hackathon ist im Datenmodell ein Event der
 * Edition (`format_tag = 'hackathon'`) mit Bühnen und Slots wie der Summit —
 * also kommt der Zeitplan aus `programme_public`, derselben Sicht, aus der
 * auch das Teilnehmerportal liest. Das Programm-Team pflegt ihn im Board, das
 * es schon kennt; Rechte, Veröffentlichungsstatus und Zeitzonen gelten
 * unverändert. Eine zweite Tabelle „hack_schedule" hätte dieselben Felder noch
 * einmal gehabt — und wäre irgendwann anders gefüllt gewesen.
 */
export default async function SchedulePage() {
  await requireArea("hackathon", "/hackathon/schedule");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const { data: events } = await supabase
    .from("event")
    .select("id, timezone")
    .eq("format_tag", "hackathon")
    .order("start_date", { ascending: false })
    .limit(1);
  const event = events?.[0] ?? null;

  const [{ data: slots }, vocab] = await Promise.all([
    event
      ? supabase.from("programme_public").select("*").eq("event_id", event.id).order("start_at")
      : Promise.resolve({ data: [] }),
    loadVocabMap(supabase, locale),
  ]);

  const rows = (slots ?? []) as PublicSlot[];
  if (rows.length === 0) {
    return (
      <>
        <PageHeader title={t.hackathon.scheduleTitle} description={t.hackathon.scheduleLead} />
        <EmptyState title={t.hackathon.scheduleEmpty} description={t.hackathon.scheduleEmptyBody} />
      </>
    );
  }

  const zone = event?.timezone ?? "Europe/Berlin";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: zone });
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit", month: "long", timeZone: zone });

  const byDay = new Map<string, PublicSlot[]>();
  for (const s of rows) byDay.set(s.day_date, [...(byDay.get(s.day_date) ?? []), s]);

  return (
    <>
      <PageHeader title={t.hackathon.scheduleTitle} description={t.hackathon.scheduleLead} />
      <div className="flex flex-col gap-8">
        {[...byDay.entries()].map(([date, items]) => (
          <section key={date} className="flex flex-col gap-2">
            <h2 className="ct-h3">{day.format(new Date(`${date}T12:00:00Z`))}</h2>
            <ul className="flex flex-col gap-2">
              {items.map((s) => (
                <li key={s.session_id} className="flex flex-wrap items-baseline gap-3 border-b pb-2">
                  <span className="ct-label tabular-nums">
                    {time.format(new Date(s.start_at))}–{time.format(new Date(s.end_at))}
                  </span>
                  <span className="ct-label">{s.title_en ?? s.title_de ?? "—"}</span>
                  {s.format && <Badge>{vlabel(vocab, "session_format", s.format)}</Badge>}
                  {(s.stage_name || s.room) && (
                    <span className="ct-help">{[s.stage_name, s.room].filter(Boolean).join(" · ")}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
