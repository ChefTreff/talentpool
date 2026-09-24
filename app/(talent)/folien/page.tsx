import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/** Laufzeit der signierten Download-Adresse: kurz, die Seite erzeugt sie bei jedem Aufruf neu. */
const URL_GUELTIG_SEKUNDEN = 10 * 60;
const BUCKET = "speaker-assets";

type Folie = {
  asset_id: string;
  session_id: string;
  session_title_de: string | null;
  session_title_en: string | null;
  speaker_name: string | null;
  filename: string;
  storage_path: string;
  slot_end_at: string;
};

/**
 * „Folien nach dem Summit" (TAL-001, P1). Ersatz für Slid@Home.
 *
 * Was hier steht, entscheidet allein `my_session_slides()`: freigegebene,
 * aktuelle Präsentationen (Speaker gibt beim Upload frei, SPK-011/SPK-055)
 * veröffentlichter Sessions, deren Slot vorbei ist — und nur für Personen mit
 * einem Ticket dieser Edition. Die Seite fügt keine eigene Regel hinzu.
 *
 * **Signiert wird serverseitig mit dem Dienstschlüssel**, weil der Bucket
 * `speaker-assets` privat bleibt und seine Policy Teilnehmende nicht kennt.
 * Das ist zulässig, weil nur Pfade signiert werden, die die Leserolle eben für
 * genau diese Person herausgegeben hat; der Pfad selbst verlässt den Server
 * nicht. Nichts wird zwischengespeichert: nimmt ein Speaker die Freigabe
 * zurück, fehlt die Datei beim nächsten Aufruf.
 */
export default async function FolienPage() {
  await requireArea("talent", "/folien");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.rpc("my_session_slides");
  const folien = (data ?? []) as Folie[];

  let urls = new Map<string, string | null>();
  if (folien.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(folien.map((f) => f.storage_path), URL_GUELTIG_SEKUNDEN, { download: true });
    urls = new Map((signed ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));
  }

  // Nach Session bündeln; die Reihenfolge aus der RPC (Slot-Ende) bleibt.
  const gruppen = new Map<string, { titel: string; speaker: Set<string>; dateien: { id: string; name: string; url: string | null }[]; ende: string }>();
  for (const f of folien) {
    const titel = (locale === "en" ? (f.session_title_en ?? f.session_title_de) : (f.session_title_de ?? f.session_title_en)) ?? t.talentSlides.untitled;
    const g = gruppen.get(f.session_id) ?? { titel, speaker: new Set<string>(), dateien: [], ende: f.slot_end_at };
    if (f.speaker_name) g.speaker.add(f.speaker_name);
    g.dateien.push({ id: f.asset_id, name: f.filename, url: urls.get(f.storage_path) ?? null });
    gruppen.set(f.session_id, g);
  }

  const zeit = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  return (
    <div className="max-w-text">
      <PageHeader word={t.talentSlides.word} title={t.talentSlides.title} description={t.talentSlides.lead} />

      {gruppen.size === 0 ? (
        <EmptyState
          title={t.talentSlides.emptyTitle}
          description={t.talentSlides.emptyBody}
          action={<ButtonLink href="/programm">{t.talentSlides.emptyAction}</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {[...gruppen.entries()].map(([sessionId, g]) => (
            <Card key={sessionId} as="article" className="p-4">
              <h2 className="ct-label text-ink">{g.titel}</h2>
              <p className="ct-help mt-1">
                {[...g.speaker].join(", ")}
                {g.speaker.size > 0 ? " · " : ""}
                {zeit.format(new Date(g.ende))}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {g.dateien.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="ct-small break-all text-ink">{d.name}</span>
                    {d.url ? (
                      <ButtonLink
                        href={d.url}
                        // Signierte Adresse mit `download: true` — lädt herunter,
                        // deshalb kein neues Fenster (QS-034).
                        download
                        variant="secondary"
                        size="sm"
                      >
                        {t.talentSlides.download}
                      </ButtonLink>
                    ) : (
                      <span className="ct-help">{t.talentSlides.unavailable}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <p className="ct-help">{t.talentSlides.usageNote}</p>
        </div>
      )}
    </div>
  );
}
